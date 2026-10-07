#!/usr/bin/env python3
"""Inferencia de edificios sobre mosaicos RGB VHR con el ONNX de HOTOSM.

Este script replica las partes relevantes del serving oficial de
`hotosm/dinov3s-buildings` / `dinov3-hot`:

- normalización RGB con HOT_MEAN / HOT_STD;
- canal 0 = mask logit -> sigmoid = probabilidad de edificio;
- canal 1 = boundary logit -> sigmoid;
- canal 2 = distance logit -> tanh;
- stitching de ventanas con kernel gaussiano;
- múltiples umbrales derivados de una sola inferencia;
- soporte CPU / DirectML con control de fallback;
- progreso, timing y QA reproducible.

Importante: una detección de edificio es evidencia de ocupación física observable,
no determina uso, estado administrativo ni legalidad.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

DATE_JPG = re.compile(r"^\d{4}-\d{2}-\d{2}\.jpg$")

MODEL_INPUT_SIZE = 256
HOT_MEAN = np.asarray(
    [0.4296737853453577, 0.4001659668453235, 0.34333372802741474],
    dtype=np.float32,
).reshape(3, 1, 1)
HOT_STD = np.asarray(
    [0.2056069389373208, 0.16738555558380538, 0.1598986422586595],
    dtype=np.float32,
).reshape(3, 1, 1)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--input-dir", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--threshold", type=float, default=0.4371)
    p.add_argument("--thresholds", type=float, nargs="*", default=[0.30, 0.4371, 0.60])
    p.add_argument(
        "--stride",
        type=int,
        default=128,
        help="Stride del sliding window. 128 coincide con el serving actual de dinov3-hot.",
    )
    p.add_argument("--only", nargs="*")
    p.add_argument("--progress-every", type=int, default=10)
    p.add_argument("--provider", choices=["auto", "cpu", "directml"], default="auto")
    p.add_argument("--device-id", type=int, default=0)
    p.add_argument("--cpu-threads", type=int, default=0,
                   help="0 = ONNX Runtime decide; sólo aplica a CPU")
    return p.parse_args()


def sigmoid(x: np.ndarray) -> np.ndarray:
    # Clip sólo para estabilidad numérica; no altera la región útil de sigmoid.
    x = np.clip(x, -80.0, 80.0)
    return 1.0 / (1.0 + np.exp(-x))


def positions(length: int, window: int, stride: int):
    if length <= window:
        return [0]
    out = list(range(0, max(1, length - window + 1), stride))
    if out[-1] + window < length:
        out.append(length - window)
    return out


def gaussian_kernel(size: int, sigma_frac: float = 0.125) -> np.ndarray:
    """Kernel gaussiano 2D equivalente al serving oficial de dinov3-hot."""
    x = np.arange(size, dtype=np.float32) - (size - 1) / 2.0
    sigma = sigma_frac * size
    one = np.exp(-0.5 * (x / sigma) ** 2)
    kernel = np.outer(one, one)
    kernel /= max(float(kernel.max()), 1e-12)
    return kernel.astype(np.float32)


def normalize_chip(chip_rgb_uint8: np.ndarray) -> np.ndarray:
    chw = chip_rgb_uint8.astype(np.float32).transpose(2, 0, 1) / 255.0
    return (chw - HOT_MEAN) / HOT_STD


def cpu_session(model: Path, cpu_threads: int):
    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    if cpu_threads > 0:
        so.intra_op_num_threads = cpu_threads
    t0 = time.perf_counter()
    sess = ort.InferenceSession(str(model), sess_options=so, providers=["CPUExecutionProvider"])
    return sess, time.perf_counter() - t0


def dml_session(model: Path, device_id: int):
    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    so.enable_mem_pattern = False
    t0 = time.perf_counter()
    sess = ort.InferenceSession(
        str(model),
        sess_options=so,
        providers=[("DmlExecutionProvider", {"device_id": str(device_id)}), "CPUExecutionProvider"],
    )
    init_seconds = time.perf_counter() - t0
    effective = sess.get_providers()
    if "DmlExecutionProvider" not in effective:
        raise RuntimeError(
            f"DirectML no quedó activo; ONNX Runtime hizo fallback. effective_providers={effective}"
        )
    return sess, init_seconds


def make_session(model: Path, provider: str, device_id: int, cpu_threads: int):
    available = ort.get_available_providers()
    if provider == "cpu":
        sess, init = cpu_session(model, cpu_threads)
        return sess, "cpu", available, init
    if provider == "directml":
        if "DmlExecutionProvider" not in available:
            raise RuntimeError("DirectML solicitado pero DmlExecutionProvider no está disponible")
        sess, init = dml_session(model, device_id)
        return sess, "directml", available, init

    if "DmlExecutionProvider" in available:
        try:
            sess, init = dml_session(model, device_id)
            return sess, "directml", available, init
        except Exception as exc:
            print(f"WARNING: DirectML falló; se usará CPU. Motivo: {exc}", flush=True)
    sess, init = cpu_session(model, cpu_threads)
    return sess, "cpu", available, init


def infer_image(sess, image_bgr: np.ndarray, stride: int, progress_every: int):
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    h, w = image_rgb.shape[:2]
    win = MODEL_INPUT_SIZE
    ys, xs = positions(h, win, stride), positions(w, win, stride)
    kernel = gaussian_kernel(win)

    mask_acc = np.zeros((h, w), np.float32)
    boundary_acc = np.zeros((h, w), np.float32)
    distance_acc = np.zeros((h, w), np.float32)
    weight_acc = np.zeros((h, w), np.float32)

    input_name = sess.get_inputs()[0].name
    output_name = sess.get_outputs()[0].name
    total = len(ys) * len(xs)
    done = 0
    started = time.perf_counter()

    for y in ys:
        for x in xs:
            chip = image_rgb[y:y + win, x:x + win]
            hh, ww = chip.shape[:2]
            if (hh, ww) != (win, win):
                pad = np.zeros((win, win, 3), dtype=np.uint8)
                pad[:hh, :ww] = chip
                chip = pad

            tensor = normalize_chip(chip)[None]
            t0 = time.perf_counter()
            logits = sess.run([output_name], {input_name: tensor})[0][0]
            tile_seconds = time.perf_counter() - t0

            if logits.shape[0] < 3:
                raise RuntimeError(f"Se esperaban >=3 canales ONNX; recibido {logits.shape}")

            mask_prob = sigmoid(logits[0]).astype(np.float32)
            boundary_prob = sigmoid(logits[1]).astype(np.float32)
            distance = np.tanh(logits[2]).astype(np.float32)

            hh = min(win, h - y)
            ww = min(win, w - x)
            k = kernel[:hh, :ww]
            mask_acc[y:y + hh, x:x + ww] += mask_prob[:hh, :ww] * k
            boundary_acc[y:y + hh, x:x + ww] += boundary_prob[:hh, :ww] * k
            distance_acc[y:y + hh, x:x + ww] += distance[:hh, :ww] * k
            weight_acc[y:y + hh, x:x + ww] += k

            done += 1
            if progress_every > 0 and (done % progress_every == 0 or done == total):
                elapsed = time.perf_counter() - started
                rate = done / elapsed if elapsed > 0 else 0.0
                remain = (total - done) / rate if rate > 0 else float("nan")
                print(
                    f"tiles {done}/{total} ({100 * done / total:.1f}%) "
                    f"last={tile_seconds:.2f}s elapsed={elapsed / 60:.1f}m eta={remain / 60:.1f}m",
                    flush=True,
                )

    if float(weight_acc.min()) <= 0.0:
        raise RuntimeError("Sliding window dejó píxeles sin cobertura")

    mask_prob = mask_acc / weight_acc
    boundary_prob = boundary_acc / weight_acc
    distance = distance_acc / weight_acc
    elapsed = time.perf_counter() - started
    return mask_prob, boundary_prob, distance, total, elapsed, float(weight_acc.min()), float(weight_acc.max())


def threshold_tag(value: float) -> str:
    return f"t{int(round(value * 1000)):04d}"


def write_mask(path: Path, prob: np.ndarray, threshold: float):
    mask = prob >= threshold
    cv2.imwrite(str(path), mask.astype(np.uint8) * 255)
    return float(mask.mean())


def write_prob(path: Path, arr: np.ndarray):
    cv2.imwrite(str(path), np.clip(arr * 255.0, 0, 255).astype(np.uint8))


def main():
    a = parse_args()
    if not (1 <= a.stride <= MODEL_INPUT_SIZE):
        raise SystemExit(f"--stride debe estar entre 1 y {MODEL_INPUT_SIZE}")

    a.output_dir.mkdir(parents=True, exist_ok=True)
    sess, requested_provider, available, session_init_seconds = make_session(
        a.model, a.provider, a.device_id, a.cpu_threads
    )
    effective = sess.get_providers()
    print("available_providers=", available, flush=True)
    print("effective_providers=", effective, flush=True)
    print(f"session_init={session_init_seconds:.2f}s requested={requested_provider}", flush=True)

    files = sorted(p for p in a.input_dir.iterdir() if p.is_file() and DATE_JPG.match(p.name))
    if a.only:
        wanted = set(a.only)
        files = [p for p in files if p.name in wanted or p.stem in wanted]
    reports = []

    thresholds = []
    for t in [a.threshold, *a.thresholds]:
        t = float(t)
        if not any(abs(t - old) < 1e-9 for old in thresholds):
            thresholds.append(t)

    for p in files:
        im = cv2.imread(str(p), cv2.IMREAD_COLOR)
        if im is None:
            raise RuntimeError(f"No se pudo leer {p}")
        print(f"\n=== {p.name} ===", flush=True)

        mask_prob, boundary_prob, distance, tile_count, elapsed, weight_min, weight_max = infer_image(
            sess, im, a.stride, a.progress_every
        )

        stem = p.stem
        write_prob(a.output_dir / f"{stem}-building-prob.png", mask_prob)
        write_prob(a.output_dir / f"{stem}-building-boundary-prob.png", boundary_prob)
        # distance está en [-1, 1]; se guarda visualmente reescalado a [0, 255].
        write_prob(a.output_dir / f"{stem}-building-distance.png", (distance + 1.0) / 2.0)

        threshold_fractions = {}
        for t in thresholds:
            tag = threshold_tag(t)
            frac = write_mask(a.output_dir / f"{stem}-building-mask-{tag}.png", mask_prob, t)
            threshold_fractions[f"{t:.4f}"] = frac

        primary_fraction = write_mask(
            a.output_dir / f"{stem}-building-mask.png", mask_prob, a.threshold
        )

        row = {
            "file": p.name,
            "requested_provider": requested_provider,
            "available_providers": available,
            "effective_providers": effective,
            "device_id": a.device_id if requested_provider == "directml" else None,
            "cpu_threads": a.cpu_threads if requested_provider == "cpu" else None,
            "session_init_seconds": float(session_init_seconds),
            "model_output_semantics": {
                "channel_0": "mask_logit -> sigmoid",
                "channel_1": "boundary_logit -> sigmoid",
                "channel_2": "distance_logit -> tanh",
            },
            "normalization": {
                "mean": HOT_MEAN.reshape(-1).astype(float).tolist(),
                "std": HOT_STD.reshape(-1).astype(float).tolist(),
            },
            "threshold": a.threshold,
            "threshold_pixel_fractions": threshold_fractions,
            "building_pixel_fraction": primary_fraction,
            "probability_mean": float(mask_prob.mean()),
            "probability_p95": float(np.percentile(mask_prob, 95)),
            "boundary_probability_mean": float(boundary_prob.mean()),
            "distance_mean": float(distance.mean()),
            "stride": a.stride,
            "tile_count": tile_count,
            "elapsed_seconds": float(elapsed),
            "blend": "gaussian_sigma_frac_0.125",
            "weight_min": weight_min,
            "weight_max": weight_max,
            "pipeline_reference": "dinov3_hot.serve.sliding_window_onnx",
        }
        reports.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)

    (a.output_dir / "inference-qa.json").write_text(
        json.dumps(reports, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Salida: {a.output_dir}")
    print(
        "NOTA: la probabilidad ahora sigue la semántica oficial del modelo (sigmoid canal 0). "
        "Validar visualmente antes de cuantificar m²."
    )


if __name__ == "__main__":
    main()
