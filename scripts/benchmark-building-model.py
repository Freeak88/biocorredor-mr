#!/usr/bin/env python3
"""Benchmark corto del modelo ONNX sobre tiles reales, CPU o DirectML.

Importante: un benchmark pedido como DirectML sólo se acepta si la sesión usa
realmente DmlExecutionProvider. ONNX Runtime puede hacer fallback silencioso a
CPU si DirectML falla; ese caso se reporta como error y no como resultado GPU.
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
    p.add_argument("--provider", choices=["cpu", "directml", "auto"], default="auto")
    p.add_argument("--threads", type=int, nargs="+", default=[1, 2, 4, 8])
    p.add_argument("--device-ids", type=int, nargs="+", default=[0, 1, 2])
    p.add_argument("--tiles", type=int, default=3)
    p.add_argument("--warmup", type=int, default=1)
    return p.parse_args()


def make_tiles(im_bgr: np.ndarray, n: int) -> list[np.ndarray]:
    rgb = cv2.cvtColor(im_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    h, w = rgb.shape[:2]
    win = 256
    centers = [
        (w//2-win//2, h//2-win//2), (w//4-win//2, h//4-win//2),
        (3*w//4-win//2, 3*h//4-win//2), (w//4-win//2, 3*h//4-win//2),
        (3*w//4-win//2, h//4-win//2),
    ]
    out=[]
    for x,y in centers[:max(1,n)]:
        x=max(0,x); y=max(0,y)
        chip=rgb[y:y+win,x:x+win]
        out.append(np.transpose(chip,(2,0,1))[None])
    return out


def cpu_session(model: Path, threads: int):
    so=ort.SessionOptions(); so.intra_op_num_threads=threads; so.inter_op_num_threads=1
    so.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
    so.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(str(model), sess_options=so, providers=["CPUExecutionProvider"])


def dml_session(model: Path, device_id: int):
    so=ort.SessionOptions(); so.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
    so.enable_mem_pattern=False
    so.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess = ort.InferenceSession(
        str(model),
        sess_options=so,
        providers=[("DmlExecutionProvider", {"device_id": str(device_id)}), "CPUExecutionProvider"],
    )
    effective = sess.get_providers()
    if "DmlExecutionProvider" not in effective:
        raise RuntimeError(
            f"DirectML no quedó activo; ONNX Runtime hizo fallback. effective_providers={effective}"
        )
    return sess


def measure(sess, chips, warmup, label):
    inp=sess.get_inputs()[0].name; out=sess.get_outputs()[0].name
    for _ in range(max(0,warmup)): sess.run([out], {inp:chips[0]})
    times=[]
    for i,chip in enumerate(chips,1):
        t=time.perf_counter(); sess.run([out], {inp:chip}); dt=time.perf_counter()-t
        times.append(dt); print(f"{label} tile={i}/{len(chips)} {dt:.3f}s", flush=True)
    return times


def main():
    a=parse_args(); im=cv2.imread(str(a.image),cv2.IMREAD_COLOR)
    if im is None: raise SystemExit(f"No se pudo leer {a.image}")
    chips=make_tiles(im,a.tiles); available=ort.get_available_providers()
    print("available_providers=", available, flush=True)
    reports=[]

    use_dml = a.provider in ("directml","auto") and "DmlExecutionProvider" in available
    if a.provider == "directml" and not use_dml:
        raise SystemExit("DmlExecutionProvider no disponible")

    if use_dml:
        for dev in a.device_ids:
            try:
                t0=time.perf_counter(); sess=dml_session(a.model,dev); init=time.perf_counter()-t0
                times=measure(sess,chips,a.warmup,f"directml device={dev}")
                reports.append({"provider":"directml","device_id":dev,"session_init_seconds":init,
                    "mean_tile_seconds":float(np.mean(times)),"projected_255_minutes":float(np.mean(times)*255/60),
                    "effective_providers":sess.get_providers()})
            except Exception as exc:
                print(f"directml device={dev} ERROR: {exc}", flush=True)

    if a.provider in ("cpu","auto"):
        for th in a.threads:
            t0=time.perf_counter(); sess=cpu_session(a.model,th); init=time.perf_counter()-t0
            times=measure(sess,chips,a.warmup,f"cpu threads={th}")
            reports.append({"provider":"cpu","threads":th,"session_init_seconds":init,
                "mean_tile_seconds":float(np.mean(times)),"projected_255_minutes":float(np.mean(times)*255/60),
                "effective_providers":sess.get_providers()})

    print("\n=== RESUMEN ===")
    if not reports:
        print("Sin benchmarks válidos.")
    for r in sorted(reports,key=lambda x:x["mean_tile_seconds"]):
        ident=f"device={r['device_id']}" if r["provider"]=="directml" else f"threads={r['threads']}"
        print(f"{r['provider']} {ident} mean={r['mean_tile_seconds']:.3f}s/tile proj255={r['projected_255_minutes']:.1f}m")
    print(json.dumps(reports,indent=2))

if __name__ == "__main__": main()
