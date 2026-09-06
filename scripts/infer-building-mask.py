#!/usr/bin/env python3
"""Inferencia de superficie construida sobre mosaicos RGB VHR.

Usa un ONNX de segmentación por ventanas solapadas. Está pensado para el modelo
HOTOSM dinov3s-buildings (256 px, stride 192). Como el artefacto expone 3 logits
sin metadatos de clases, identifica provisionalmente el canal de fondo como el
canal con mayor cobertura media y define p(building)=1-p(background).

Genera probability PNG, mask PNG y un JSON QA por imagen. No vectoriza todavía.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

DATE_JPG = re.compile(r"^\d{4}-\d{2}-\d{2}\.jpg$")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--input-dir", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--threshold", type=float, default=0.4371)
    p.add_argument("--stride", type=int, default=192)
    p.add_argument("--only", nargs="*")
    return p.parse_args()


def softmax(x, axis=0):
    x = x - np.max(x, axis=axis, keepdims=True)
    e = np.exp(x)
    return e / np.sum(e, axis=axis, keepdims=True)


def positions(length: int, window: int, stride: int):
    if length <= window:
        return [0]
    out = list(range(0, length - window + 1, stride))
    if out[-1] != length - window:
        out.append(length - window)
    return out


def infer_image(sess, image_bgr, stride: int):
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    h, w = rgb.shape[:2]
    win = 256
    ys, xs = positions(h, win, stride), positions(w, win, stride)
    sums = None
    weight = np.zeros((h, w), np.float32)
    input_name = sess.get_inputs()[0].name
    output_name = sess.get_outputs()[0].name

    for y in ys:
        for x in xs:
            chip = rgb[y:y+win, x:x+win]
            if chip.shape[:2] != (win, win):
                pad = np.zeros((win, win, 3), np.float32)
                pad[:chip.shape[0], :chip.shape[1]] = chip
                chip = pad
            tensor = np.transpose(chip, (2, 0, 1))[None]
            logits = sess.run([output_name], {input_name: tensor})[0][0]
            probs = softmax(logits, axis=0).astype(np.float32)
            if sums is None:
                sums = np.zeros((probs.shape[0], h, w), np.float32)
            hh, ww = min(win, h-y), min(win, w-x)
            sums[:, y:y+hh, x:x+ww] += probs[:, :hh, :ww]
            weight[y:y+hh, x:x+ww] += 1.0

    sums /= np.maximum(weight[None], 1e-6)
    channel_mean = sums.mean(axis=(1, 2))
    argmax_share = np.array([(np.argmax(sums, axis=0) == i).mean() for i in range(sums.shape[0])])
    background = int(np.argmax(channel_mean))
    building_prob = 1.0 - sums[background]
    return building_prob, channel_mean, argmax_share, background


def main():
    a = parse_args()
    a.output_dir.mkdir(parents=True, exist_ok=True)
    sess = ort.InferenceSession(str(a.model), providers=["CPUExecutionProvider"])
    files = sorted(p for p in a.input_dir.iterdir() if p.is_file() and DATE_JPG.match(p.name))
    if a.only:
        wanted = set(a.only)
        files = [p for p in files if p.name in wanted or p.stem in wanted]
    reports = []

    for p in files:
        im = cv2.imread(str(p), cv2.IMREAD_COLOR)
        if im is None:
            raise RuntimeError(f"No se pudo leer {p}")
        prob, means, shares, bg = infer_image(sess, im, a.stride)
        mask = prob >= a.threshold
        stem = p.stem
        cv2.imwrite(str(a.output_dir / f"{stem}-building-prob.png"), np.clip(prob*255, 0, 255).astype(np.uint8))
        cv2.imwrite(str(a.output_dir / f"{stem}-building-mask.png"), (mask.astype(np.uint8)*255))
        row = {
            "file": p.name,
            "background_channel": bg,
            "channel_mean_probability": [float(v) for v in means],
            "channel_argmax_share": [float(v) for v in shares],
            "threshold": a.threshold,
            "building_pixel_fraction": float(mask.mean()),
            "probability_mean": float(prob.mean()),
            "probability_p95": float(np.percentile(prob, 95)),
        }
        reports.append(row)
        print(json.dumps(row, ensure_ascii=False))

    (a.output_dir / "inference-qa.json").write_text(json.dumps(reports, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Salida: {a.output_dir}")
    print("IMPORTANTE: background_channel es inferido provisionalmente; validar visualmente antes de cuantificar m².")


if __name__ == "__main__":
    main()
