#!/usr/bin/env python3
"""Benchmark corto del modelo ONNX de edificios sobre tiles reales.

Mide latencia por tile con distintas cantidades de threads de ONNX Runtime para
no lanzar mosaicos completos a ciegas. No modifica datos ni genera detecciones.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--image", type=Path, required=True)
    p.add_argument("--threads", type=int, nargs="+", default=[1, 2, 4])
    p.add_argument("--tiles", type=int, default=3)
    p.add_argument("--warmup", type=int, default=1)
    return p.parse_args()


def make_tiles(im_bgr: np.ndarray, n: int) -> list[np.ndarray]:
    rgb = cv2.cvtColor(im_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    h, w = rgb.shape[:2]
    win = 256
    centers = [
        (max(0, w // 2 - win // 2), max(0, h // 2 - win // 2)),
        (max(0, w // 4 - win // 2), max(0, h // 4 - win // 2)),
        (max(0, 3 * w // 4 - win // 2), max(0, 3 * h // 4 - win // 2)),
        (max(0, w // 4 - win // 2), max(0, 3 * h // 4 - win // 2)),
        (max(0, 3 * w // 4 - win // 2), max(0, h // 4 - win // 2)),
    ]
    out = []
    for x, y in centers[: max(1, n)]:
        chip = rgb[y:y+win, x:x+win]
        if chip.shape[:2] != (win, win):
            pad = np.zeros((win, win, 3), np.float32)
            pad[:chip.shape[0], :chip.shape[1]] = chip
            chip = pad
        out.append(np.transpose(chip, (2, 0, 1))[None])
    return out


def make_session(model: Path, threads: int):
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.inter_op_num_threads = 1
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(str(model), sess_options=so, providers=["CPUExecutionProvider"])


def main():
    a = parse_args()
    im = cv2.imread(str(a.image), cv2.IMREAD_COLOR)
    if im is None:
        raise SystemExit(f"No se pudo leer {a.image}")
    chips = make_tiles(im, a.tiles)
    reports = []

    for threads in a.threads:
        started_session = time.perf_counter()
        sess = make_session(a.model, threads)
        session_seconds = time.perf_counter() - started_session
        input_name = sess.get_inputs()[0].name
        output_name = sess.get_outputs()[0].name

        for _ in range(max(0, a.warmup)):
            sess.run([output_name], {input_name: chips[0]})

        times = []
        for i, chip in enumerate(chips, 1):
            t0 = time.perf_counter()
            sess.run([output_name], {input_name: chip})
            dt = time.perf_counter() - t0
            times.append(dt)
            print(f"threads={threads} tile={i}/{len(chips)} {dt:.3f}s", flush=True)

        row = {
            "threads": threads,
            "session_init_seconds": session_seconds,
            "tiles": len(times),
            "mean_tile_seconds": float(np.mean(times)),
            "median_tile_seconds": float(np.median(times)),
            "min_tile_seconds": float(np.min(times)),
            "max_tile_seconds": float(np.max(times)),
            "projected_255_minutes": float(np.mean(times) * 255 / 60),
        }
        reports.append(row)
        print(json.dumps(row), flush=True)

    print("\n=== RESUMEN ===")
    for r in sorted(reports, key=lambda x: x["mean_tile_seconds"]):
        print(
            f"threads={r['threads']} mean={r['mean_tile_seconds']:.3f}s/tile "
            f"proj255={r['projected_255_minutes']:.1f}m"
        )


if __name__ == "__main__":
    main()
