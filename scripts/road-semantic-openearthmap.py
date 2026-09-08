#!/usr/bin/env python3
"""Benchmark semántico de caminos sobre OpenEarthMap / Mask2Former.

Objetivo: evaluar sin fine-tuning local si un modelo multi-clase entrenado sobre
OpenEarthMap separa mejor `Road` de `Bareland`, `Pavement`, `Cropland` y
`Building` que las heurísticas V4.

Soporta aceleración DirectML opcional en Windows/AMD mediante torch-directml.
Con --device auto intenta DirectML y, si no está disponible o falla un operador,
cae explícitamente a CPU sin mezclar resultados parciales.

No es una capa final ni una conclusión de loteo/legalidad.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
V2_PATH = HERE / "generate-earthwork-road-candidates-v2.py"
spec = importlib.util.spec_from_file_location("earthwork_road_v2", V2_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"No se pudo cargar {V2_PATH}")
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)

MODEL_ID = "mfaytin/mask2former-satellite"
DEFAULT_OUTPUT = v2.HISTORY_ROOT / "road-semantic-openearthmap"

LABELS_8 = [
    "Bareland", "Grass", "Pavement", "Road",
    "Tree", "Water", "Cropland", "Building",
]
LABELS_9 = [
    "Background", "Bareland", "Grass", "Pavement", "Road",
    "Tree", "Water", "Cropland", "Building",
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--date", default="2023-04-19")
    p.add_argument("--registered-dir", type=Path, default=v2.DEFAULT_REGISTERED)
    p.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    p.add_argument("--productiva-mask", type=Path, default=v2.DEFAULT_PRODUCTIVA)
    p.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--model", default=MODEL_ID)
    p.add_argument("--tile", type=int, default=512)
    p.add_argument("--stride", type=int, default=448)
    p.add_argument("--threshold", type=float, default=0.35)
    p.add_argument("--cpu-threads", type=int, default=20)
    p.add_argument("--min-productivo-tile-fraction", type=float, default=0.01)
    p.add_argument(
        "--device",
        choices=["auto", "directml", "cpu"],
        default="auto",
        help="auto intenta DirectML y cae a CPU; directml exige torch-directml; cpu fuerza CPU",
    )
    return p.parse_args()


def positions(length: int, tile: int, stride: int) -> list[int]:
    if length <= tile:
        return [0]
    out = list(range(0, length - tile + 1, stride))
    last = length - tile
    if out[-1] != last:
        out.append(last)
    return out


def weight_window(tile: int) -> np.ndarray:
    w = np.hanning(tile).astype(np.float32)
    w = np.maximum(w, 0.12)
    return np.outer(w, w).astype(np.float32)


def semantic_scores(outputs, torch):
    class_probs = outputs.class_queries_logits.softmax(dim=-1)[..., :-1]
    mask_probs = outputs.masks_queries_logits.sigmoid()
    return torch.einsum("bqc,bqhw->bchw", class_probs, mask_probs)


def labels_for_channels(n: int) -> list[str]:
    if n == 8:
        return LABELS_8
    if n == 9:
        return LABELS_9
    raise RuntimeError(
        f"El modelo produjo {n} clases. Esperaba 8 u 9; no voy a adivinar el índice de Road."
    )


def save_gray(path: Path, arr01: np.ndarray) -> None:
    cv2.imwrite(str(path), np.clip(arr01 * 255.0, 0, 255).astype(np.uint8))


def choose_device(args, torch):
    if args.device == "cpu":
        return torch.device("cpu"), "cpu"

    try:
        import torch_directml
        dml = torch_directml.device()
        return dml, "directml"
    except Exception as exc:
        if args.device == "directml":
            raise SystemExit(f"DirectML solicitado pero no disponible: {exc}")
        print(f"DirectML no disponible; usando CPU: {exc}")
        return torch.device("cpu"), "cpu"


def run_model_once(model, inputs, device, torch, tile: int):
    with torch.inference_mode():
        outputs = model(**{k: v.to(device) for k, v in inputs.items()})
        sem = semantic_scores(outputs, torch)
        sem = torch.nn.functional.interpolate(
            sem,
            size=(tile, tile),
            mode="bilinear",
            align_corners=False,
        )[0]
        return sem.to("cpu").numpy().astype(np.float32)


def main() -> None:
    args = parse_args()
    if args.stride <= 0 or args.tile <= 0 or args.stride > args.tile:
        raise SystemExit("--stride debe ser >0 y <= --tile")

    import torch
    from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation

    torch.set_num_threads(max(1, args.cpu_threads))
    torch.set_grad_enabled(False)

    registered_dir = v2.resolve_registered_dir(args.registered_dir, [args.date])
    image_bgr = v2.read_image(registered_dir / f"{args.date}.jpg")
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    h, w = image_rgb.shape[:2]

    meta = v2.load_json(args.metadata)
    prod = v2.load_json(args.productiva_mask)
    productivo = v2.rasterize_productivo(meta, prod, (h, w))
    valid = productivo > 0
    if not np.any(valid):
        raise SystemExit("Scope Productivo vacío")

    print(f"model={args.model}")
    print(f"date={args.date}")
    print(f"registered_dir={registered_dir}")
    print("cargando processor/model...")

    processor = AutoImageProcessor.from_pretrained(args.model)
    model = Mask2FormerForUniversalSegmentation.from_pretrained(args.model)
    model.eval()

    device, device_name = choose_device(args, torch)
    print(f"device={device_name}")
    try:
        model.to(device)
    except Exception as exc:
        if device_name != "directml" or args.device == "directml":
            raise
        print(f"DirectML no pudo cargar el modelo; fallback CPU: {exc}")
        device = torch.device("cpu")
        device_name = "cpu"
        model.to(device)
        print("device=cpu")

    ys = positions(h, args.tile, args.stride)
    xs = positions(w, args.tile, args.stride)
    ww = weight_window(args.tile)

    score_sum = None
    weight_sum = np.zeros((h, w), dtype=np.float32)
    processed = 0
    skipped = 0
    labels = None
    dml_fallback_done = False

    for y in ys:
        for x in xs:
            ph = min(args.tile, h - y)
            pw = min(args.tile, w - x)
            prod_patch = valid[y:y + ph, x:x + pw]
            if float(prod_patch.mean()) < args.min_productivo_tile_fraction:
                skipped += 1
                continue

            patch = image_rgb[y:y + ph, x:x + pw]
            if ph != args.tile or pw != args.tile:
                padded = np.zeros((args.tile, args.tile, 3), dtype=np.uint8)
                padded[:ph, :pw] = patch
                patch = padded

            inputs = processor(
                images=Image.fromarray(patch),
                return_tensors="pt",
                do_resize=False,
            )

            try:
                sem_np = run_model_once(model, inputs, device, torch, args.tile)
            except Exception as exc:
                if device_name == "directml" and args.device == "auto" and not dml_fallback_done:
                    print(f"DirectML falló durante inferencia; reiniciando en CPU: {exc}")
                    device = torch.device("cpu")
                    device_name = "cpu"
                    model.to(device)
                    dml_fallback_done = True
                    print("device=cpu")
                    sem_np = run_model_once(model, inputs, device, torch, args.tile)
                else:
                    raise

            if labels is None:
                labels = labels_for_channels(int(sem_np.shape[0]))
                score_sum = np.zeros((len(labels), h, w), dtype=np.float32)
                print(f"semantic_channels={len(labels)} labels={labels}")

            wt = ww[:ph, :pw]
            score_sum[:, y:y + ph, x:x + pw] += sem_np[:, :ph, :pw] * wt[None, :, :]
            weight_sum[y:y + ph, x:x + pw] += wt
            processed += 1
            if processed % 10 == 0:
                print(f"tiles {processed} procesados ({skipped} omitidos fuera de Productivo)")

    if score_sum is None or labels is None or processed == 0:
        raise SystemExit("No se procesó ningún tile Productivo")

    denom = np.maximum(weight_sum, 1e-6)
    scores = score_sum / denom[None, :, :]
    scores[:, ~valid] = 0.0

    road_idx = labels.index("Road")
    pavement_idx = labels.index("Pavement")
    bare_idx = labels.index("Bareland")
    building_idx = labels.index("Building")
    crop_idx = labels.index("Cropland")

    road_prob = scores[road_idx]
    argmax = scores.argmax(axis=0)
    road_argmax = (argmax == road_idx) & valid
    road_strong = (road_prob >= args.threshold) & valid

    out_dir = args.output_dir / args.date
    out_dir.mkdir(parents=True, exist_ok=True)
    save_gray(out_dir / "road-probability.png", road_prob)
    cv2.imwrite(str(out_dir / "road-argmax.png"), road_argmax.astype(np.uint8) * 255)
    cv2.imwrite(str(out_dir / "road-strong.png"), road_strong.astype(np.uint8) * 255)

    overlay = image_bgr.astype(np.float32).copy()
    palette_bgr = {
        road_idx: np.array([255, 255, 0], dtype=np.float32),
        pavement_idx: np.array([0, 255, 255], dtype=np.float32),
        bare_idx: np.array([0, 140, 255], dtype=np.float32),
        building_idx: np.array([255, 0, 255], dtype=np.float32),
        crop_idx: np.array([0, 200, 0], dtype=np.float32),
    }
    for idx, color in palette_bgr.items():
        m = (argmax == idx) & valid
        overlay[m] = 0.55 * overlay[m] + 0.45 * color
    cv2.imwrite(
        str(out_dir / "landcover-overlay.jpg"),
        np.clip(overlay, 0, 255).astype(np.uint8),
        [cv2.IMWRITE_JPEG_QUALITY, 92],
    )

    road_overlay = image_bgr.astype(np.float32).copy()
    m = road_argmax
    road_overlay[m] = 0.45 * road_overlay[m] + 0.55 * np.array([255, 255, 0], np.float32)
    cv2.imwrite(
        str(out_dir / "road-overlay.jpg"),
        np.clip(road_overlay, 0, 255).astype(np.uint8),
        [cv2.IMWRITE_JPEG_QUALITY, 92],
    )

    thresholds = [0.10, 0.20, 0.30, 0.35, 0.40, 0.50]
    road_vals = road_prob[valid]
    class_fractions = {
        labels[i]: float(((argmax == i) & valid)[valid].mean())
        for i in range(len(labels))
    }
    report = {
        "scope": "Productivo only",
        "date": args.date,
        "model": args.model,
        "training_domain": "OpenEarthMap",
        "status": "diagnostic external semantic baseline only",
        "registered_dir": str(registered_dir),
        "device": device_name,
        "tile": args.tile,
        "stride": args.stride,
        "tiles_processed": processed,
        "tiles_skipped_low_productivo": skipped,
        "semantic_channels": len(labels),
        "labels_runtime": labels,
        "road_class_index": road_idx,
        "road_argmax_fraction_productivo": float(road_argmax[valid].mean()),
        "road_probability_mean": float(road_vals.mean()),
        "road_probability_p90": float(np.percentile(road_vals, 90)),
        "road_probability_p95": float(np.percentile(road_vals, 95)),
        "road_probability_p99": float(np.percentile(road_vals, 99)),
        "road_fraction_by_threshold": {
            f"{t:.2f}": float((road_vals >= t).mean()) for t in thresholds
        },
        "argmax_class_fraction_productivo": class_fractions,
        "warning": (
            "Modelo externo sin ajuste local. No usar Road/Bareland/Pavement como "
            "superficie final ni physical_loteo_score hasta QA visual. El checkpoint "
            "publica documentación de 9 clases pero puede exponer 8 canales; el script "
            "resuelve el mapping según los canales reales y aborta ante otra forma."
        ),
    }
    qa = out_dir / "openearthmap-road-qa.json"
    qa.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n=== OPENEARTHMAP ROAD QA ===")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"road_overlay={out_dir / 'road-overlay.jpg'}")
    print(f"landcover_overlay={out_dir / 'landcover-overlay.jpg'}")
    print(f"qa={qa}")


if __name__ == "__main__":
    main()
