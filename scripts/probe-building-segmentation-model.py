#!/usr/bin/env python3
"""Inspecciona un modelo ONNX de segmentación de edificios antes de usarlo.

Evita asumir shape, dtype o normalización. Imprime firma de entrada/salida y ejecuta
una inferencia sintética solo si es razonable hacerlo. Pensado para validar el modelo
HOTOSM DINOv3/UperNet de huellas edilicias antes de integrarlo al pipeline real.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--json", type=Path)
    args = ap.parse_args()

    sess = ort.InferenceSession(str(args.model), providers=["CPUExecutionProvider"])
    inputs = []
    for x in sess.get_inputs():
        inputs.append({"name": x.name, "shape": x.shape, "type": x.type})
    outputs = []
    for x in sess.get_outputs():
        outputs.append({"name": x.name, "shape": x.shape, "type": x.type})

    report = {
        "model": str(args.model),
        "providers": sess.get_providers(),
        "inputs": inputs,
        "outputs": outputs,
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
