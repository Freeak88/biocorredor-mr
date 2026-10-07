#!/usr/bin/env python3
"""Baseline semántico de caminos para BioCorredor MR.

Objetivo: probar una red U-Net entrenada en Massachusetts Roads como baseline
externo, exportarla una sola vez a ONNX y correr inferencia mosaico-a-mosaico
sobre Cluster 2 dentro de Productivo. No es modelo final ni ground truth.

Subcomandos:
  prepare  -> descarga checkpoint .pth y exporta a ONNX (requiere torch + onnx)
  infer    -> ONNXRuntime tiled inference sobre una fecha (requiere onnxruntime)

Fuente del checkpoint:
  https://huggingface.co/teohyc/Satellite-Road-Segmentation-UNet
Licencia declarada por el modelo: MIT.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import urllib.request
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
V2_PATH = HERE / "generate-earthwork-road-candidates-v2.py"
spec = importlib.util.spec_from_file_location("territorial_v2", V2_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"No se pudo cargar {V2_PATH}")
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)

MODEL_DIR = Path("tmp/territorial-analysis/models/road-semantic-baseline")
PTH_PATH = MODEL_DIR / "best_road_seg_unet.pth"
ONNX_PATH = MODEL_DIR / "road_unet_massachusetts_256.onnx"
PTH_URL = (
    "https://huggingface.co/teohyc/Satellite-Road-Segmentation-UNet/resolve/main/"
    "best_road_seg_unet.pth?download=true"
)
DEFAULT_OUTPUT = v2.HISTORY_ROOT / "road-semantic-baseline"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    prep = sub.add_parser("prepare")
    prep.add_argument("--pth", type=Path, default=PTH_PATH)
    prep.add_argument("--onnx", type=Path, default=ONNX_PATH)
    prep.add_argument("--force-download", action="store_true")

    inf = sub.add_parser("infer")
    inf.add_argument("--model", type=Path, default=ONNX_PATH)
    inf.add_argument("--registered-dir", type=Path, default=v2.DEFAULT_REGISTERED)
    inf.add_argument("--date", default="2023-04-19")
    inf.add_argument("--metadata", type=Path, default=v2.DEFAULT_META)
    inf.add_argument("--productiva-mask", type=Path, default=v2.DEFAULT_PRODUCTIVA)
    inf.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    inf.add_argument("--tile", type=int, default=256)
    inf.add_argument("--stride", type=int, default=192)
    inf.add_argument("--threshold", type=float, default=0.50)
    inf.add_argument("--cpu-threads", type=int, default=20)
    return p.parse_args()


def build_torch_model():
    try:
        import torch
        import torch.nn as nn
    except ImportError as exc:
        raise SystemExit("prepare requiere torch; instalá requirements-territorial-road-baseline.txt") from exc

    class ConvBlock(nn.Module):
        def __init__(self, in_channels: int, out_channels: int):
            super().__init__()
            self.conv = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, 3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
                nn.Conv2d(out_channels, out_channels, 3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
                nn.Dropout(0.3),
            )

        def forward(self, x):
            return self.conv(x)

    class UNet(nn.Module):
        def __init__(self):
            super().__init__()
            self.enc1 = ConvBlock(3, 64)
            self.enc2 = ConvBlock(64, 128)
            self.enc3 = ConvBlock(128, 256)
            self.enc4 = ConvBlock(256, 512)
            self.pool = nn.MaxPool2d(2)
            self.bottleneck = ConvBlock(512, 1024)
            self.upconv4 = nn.ConvTranspose2d(1024, 512, 2, 2)
            self.dec4 = ConvBlock(1024, 512)
            self.upconv3 = nn.ConvTranspose2d(512, 256, 2, 2)
            self.dec3 = ConvBlock(512, 256)
            self.upconv2 = nn.ConvTranspose2d(256, 128, 2, 2)
            self.dec2 = ConvBlock(256, 128)
            self.upconv1 = nn.ConvTranspose2d(128, 64, 2, 2)
            self.dec1 = ConvBlock(128, 64)
            self.conv_final = nn.Conv2d(64, 1, 1)

        def forward(self, x):
            e1 = self.enc1(x)
            e2 = self.enc2(self.pool(e1))
            e3 = self.enc3(self.pool(e2))
            e4 = self.enc4(self.pool(e3))
            b = self.bottleneck(self.pool(e4))
            d4 = self.dec4(torch.cat([self.upconv4(b), e4], 1))
            d3 = self.dec3(torch.cat([self.upconv3(d4), e3], 1))
            d2 = self.dec2(torch.cat([self.upconv2(d3), e2], 1))
            d1 = self.dec1(torch.cat([self.upconv1(d2), e1], 1))
            return torch.sigmoid(self.conv_final(d1))

    return torch, UNet()


def cmd_prepare(args: argparse.Namespace) -> None:
    args.pth.parent.mkdir(parents=True, exist_ok=True)
    if args.force_download or not args.pth.exists():
        print(f"descargando checkpoint -> {args.pth}")
        urllib.request.urlretrieve(PTH_URL, args.pth)
    else:
        print(f"checkpoint existente -> {args.pth}")

    torch, model = build_torch_model()
    state = torch.load(args.pth, map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.eval()

    dummy = torch.zeros((1, 3, 256, 256), dtype=torch.float32)
    args.onnx.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        args.onnx,
        input_names=["image"],
        output_names=["road_probability"],
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"ONNX exportado -> {args.onnx}")


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
    w = np.maximum(w, 0.08)
    return np.outer(w, w).astype(np.float32)


def infer_tiled(session, image_bgr: np.ndarray, tile: int, stride: int) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    xs, ys = positions(w, tile, stride), positions(h, tile, stride)
    acc = np.zeros((h, w), np.float32)
    den = np.zeros((h, w), np.float32)
    win = weight_window(tile)
    input_name = session.get_inputs()[0].name

    total = len(xs) * len(ys)
    done = 0
    for y in ys:
        for x in xs:
            chip = image_bgr[y:y+tile, x:x+tile]
            rgb = cv2.cvtColor(chip, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            tensor = np.transpose(rgb, (2, 0, 1))[None, ...]
            pred = session.run(None, {input_name: tensor})[0]
            prob = np.asarray(pred, dtype=np.float32).squeeze()
            acc[y:y+tile, x:x+tile] += prob * win
            den[y:y+tile, x:x+tile] += win
            done += 1
            if done % 25 == 0 or done == total:
                print(f"tiles {done}/{total}")
    return acc / np.maximum(den, 1e-6)


def cmd_infer(args: argparse.Namespace) -> None:
    try:
        import onnxruntime as ort
    except ImportError as exc:
        raise SystemExit("infer requiere onnxruntime") from exc

    if not args.model.exists():
        raise SystemExit(f"Falta modelo ONNX: {args.model}. Ejecutá primero prepare.")

    registered = v2.resolve_registered_dir(args.registered_dir, v2.DEFAULT_DATES)
    image_path = registered / f"{args.date}.jpg"
    image = v2.read_image(image_path)
    meta = v2.load_json(args.metadata)
    prod_geojson = v2.load_json(args.productiva_mask)
    productivo = v2.rasterize_productivo(meta, prod_geojson, image.shape[:2])
    valid = productivo > 0

    so = ort.SessionOptions()
    so.intra_op_num_threads = args.cpu_threads
    so.inter_op_num_threads = 1
    session = ort.InferenceSession(str(args.model), sess_options=so, providers=["CPUExecutionProvider"])

    print(f"model={args.model}")
    print(f"date={args.date}")
    print(f"registered_dir={registered}")
    prob = infer_tiled(session, image, args.tile, args.stride)
    prob[~valid] = 0.0

    strong = ((prob >= args.threshold) & valid).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    strong = cv2.morphologyEx(strong, cv2.MORPH_CLOSE, k)

    outdir = args.output_dir / args.date
    outdir.mkdir(parents=True, exist_ok=True)
    np.save(outdir / "road-probability.npy", prob)
    cv2.imwrite(str(outdir / "road-probability.png"), v2.colorize(prob, valid))
    cv2.imwrite(str(outdir / "road-strong.png"), strong)

    overlay = image.copy().astype(np.float32)
    cyan = strong > 0
    overlay[cyan] = 0.45 * overlay[cyan] + 0.55 * np.array([255, 255, 0], np.float32)
    overlay = np.clip(overlay, 0, 255).astype(np.uint8)
    cv2.imwrite(str(outdir / "road-overlay.jpg"), overlay, [cv2.IMWRITE_JPEG_QUALITY, 92])

    vals = prob[valid]
    qa = {
        "scope": "Productivo only",
        "date": args.date,
        "model": "teohyc/Satellite-Road-Segmentation-UNet",
        "training_domain": "Massachusetts Roads dataset",
        "status": "diagnostic external baseline only",
        "tile": args.tile,
        "stride": args.stride,
        "threshold": args.threshold,
        "productivo_fraction_ge_threshold": float((strong[valid] > 0).mean()),
        "prob_mean": float(vals.mean()),
        "prob_p90": float(np.percentile(vals, 90)),
        "prob_p95": float(np.percentile(vals, 95)),
        "warning": "Do not use as final road mask or physical_loteo_score until local visual QA passes.",
    }
    (outdir / "road-semantic-baseline-qa.json").write_text(
        json.dumps(qa, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("\n=== ROAD SEMANTIC BASELINE QA ===")
    print(json.dumps(qa, indent=2, ensure_ascii=False))
    print(f"overlay={outdir / 'road-overlay.jpg'}")


def main() -> None:
    args = parse_args()
    if args.cmd == "prepare":
        cmd_prepare(args)
    else:
        cmd_infer(args)


if __name__ == "__main__":
    main()
