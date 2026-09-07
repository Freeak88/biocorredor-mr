#!/usr/bin/env python3
"""Inferencia de superficie construida sobre mosaicos RGB VHR.

Usa un ONNX de segmentación por ventanas solapadas para HOTOSM dinov3s-buildings.
Soporta CPU y DirectML (Windows/AMD/Intel/NVIDIA) con fallback explícito.

Mejoras:
- blending ponderado entre tiles para reducir costuras;
- progreso y timing por imagen;
- múltiples umbrales derivados de una sola inferencia;
- selección de execution provider y registro del provider efectivo;
- configuración compatible con DirectML (sequential + mem pattern off).

La semántica de los 3 logits observados en el ONNX no se asume como verdad. Se
mantiene provisionalmente la heurística: canal con mayor cobertura media = fondo,
p(building)=1-p(background), hasta cerrar QA visual.
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


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--input-dir", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--threshold", type=float, default=0.4371)
    p.add_argument("--thresholds", type=float, nargs="*", default=[0.30, 0.4371, 0.60])
    p.add_argument("--stride", type=int, default=192)
    p.add_argument("--only", nargs="*")
    p.add_argument("--progress-every", type=int, default=1)
    p.add_argument("--provider", choices=["auto", "cpu", "directml"], default="auto")
    p.add_argument("--device-id", type=int, default=0,
                   help="Adapter DirectML. Verificar GPU efectiva en Task Manager si hay varias.")
    p.add_argument("--cpu-threads", type=int, default=0,
                   help="0 = ONNX Runtime decide; sólo aplica a CPU")
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


def blend_window(win: int) -> np.ndarray:
    one = np.hanning(win).astype(np.float32)
    two = np.outer(one, one)
    two /= max(float(two.max()), 1e-6)
    return np.maximum(two, 0.05).astype(np.float32)


def make_session(model: Path, provider: str, device_id: int, cpu_threads: int):
    available = ort.get_available_providers()
    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    if provider == "directml" or (provider == "auto" and "DmlExecutionProvider" in available):
        if "DmlExecutionProvider" not in available:
            raise RuntimeError(
                "DirectML solicitado pero DmlExecutionProvider no está disponible. "
                "En Windows instalar onnxruntime-directml y quitar onnxruntime CPU si entra en conflicto."
            )
        so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        so.enable_mem_pattern = False
        providers = [("DmlExecutionProvider", {"device_id": str(device_id)}), "CPUExecutionProvider"]
        requested = "directml"
    else:
        so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        if cpu_threads > 0:
            so.intra_op_num_threads = cpu_threads
        providers = ["CPUExecutionProvider"]
        requested = "cpu"

    t0 = time.perf_counter()
    sess = ort.InferenceSession(str(model), sess_options=so, providers=providers)
    init_seconds = time.perf_counter() - t0
    return sess, requested, available, init_seconds


def infer_image(sess, image_bgr, stride: int, progress_every: int):
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    h, w = rgb.shape[:2]
    win = 256
    ys, xs = positions(h, win, stride), positions(w, win, stride)
    tile_weight = blend_window(win)
    sums = None
    weight = np.zeros((h, w), np.float32)
    input_name = sess.get_inputs()[0].name
    output_name = sess.get_outputs()[0].name
    total = len(ys) * len(xs)
    done = 0
    started = time.perf_counter()

    for y in ys:
        for x in xs:
            chip = rgb[y:y+win, x:x+win]
            if chip.shape[:2] != (win, win):
                pad = np.zeros((win, win, 3), np.float32)
                pad[:chip.shape[0], :chip.shape[1]] = chip
                chip = pad
            tensor = np.transpose(chip, (2, 0, 1))[None]
            t0 = time.perf_counter()
            logits = sess.run([output_name], {input_name: tensor})[0][0]
            tile_seconds = time.perf_counter() - t0
            probs = softmax(logits, axis=0).astype(np.float32)
            if sums is None:
                sums = np.zeros((probs.shape[0], h, w), np.float32)
            hh, ww = min(win, h-y), min(win, w-x)
            bw = tile_weight[:hh, :ww]
            sums[:, y:y+hh, x:x+ww] += probs[:, :hh, :ww] * bw[None]
            weight[y:y+hh, x:x+ww] += bw

            done += 1
            if progress_every > 0 and (done % progress_every == 0 or done == total):
                elapsed = time.perf_counter() - started
                rate = done / elapsed if elapsed > 0 else 0.0
                remain = (total - done) / rate if rate > 0 else float("nan")
                print(
                    f"tiles {done}/{total} ({100*done/total:.1f}%) "
                    f"last={tile_seconds:.2f}s elapsed={elapsed/60:.1f}m eta={remain/60:.1f}m",
                    flush=True,
                )

    sums /= np.maximum(weight[None], 1e-6)
    channel_mean = sums.mean(axis=(1, 2))
    argmax_map = np.argmax(sums, axis=0)
    argmax_share = np.array([(argmax_map == i).mean() for i in range(sums.shape[0])])
    background = int(np.argmax(channel_mean))
    building_prob = 1.0 - sums[background]
    elapsed = time.perf_counter() - started
    return building_prob, channel_mean, argmax_share, background, total, elapsed


def threshold_tag(value: float) -> str:
    return f"t{int(round(value * 1000)):04d}"


def write_mask(path: Path, prob: np.ndarray, threshold: float):
    mask = prob >= threshold
    cv2.imwrite(str(path), mask.astype(np.uint8) * 255)
    return float(mask.mean())


def main():
    a = parse_args()
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
        prob, means, shares, bg, tile_count, elapsed = infer_image(sess, im, a.stride, a.progress_every)

        stem = p.stem
        cv2.imwrite(str(a.output_dir / f"{stem}-building-prob.png"),
                    np.clip(prob * 255, 0, 255).astype(np.uint8))

        threshold_fractions = {}
        for t in thresholds:
            tag = threshold_tag(t)
            frac = write_mask(a.output_dir / f"{stem}-building-mask-{tag}.png", prob, t)
            threshold_fractions[f"{t:.4f}"] = frac

        primary_fraction = write_mask(a.output_dir / f"{stem}-building-mask.png", prob, a.threshold)

        row = {
            "file": p.name,
            "requested_provider": requested_provider,
            "available_providers": available,
            "effective_providers": effective,
            "device_id": a.device_id if requested_provider == "directml" else None,
            "session_init_seconds": float(session_init_seconds),
            "background_channel": bg,
            "channel_mean_probability": [float(v) for v in means],
            "channel_argmax_share": [float(v) for v in shares],
            "threshold": a.threshold,
            "threshold_pixel_fractions": threshold_fractions,
            "building_pixel_fraction": primary_fraction,
            "probability_mean": float(prob.mean()),
            "probability_p95": float(np.percentile(prob, 95)),
            "stride": a.stride,
            "tile_count": tile_count,
            "elapsed_seconds": float(elapsed),
            "blend": "hann_floor_0.05",
        }
        reports.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)

    (a.output_dir / "inference-qa.json").write_text(
        json.dumps(reports, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Salida: {a.output_dir}")
    print("IMPORTANTE: background_channel sigue siendo provisional; validar visualmente antes de cuantificar m².")


if __name__ == "__main__":
    main()
