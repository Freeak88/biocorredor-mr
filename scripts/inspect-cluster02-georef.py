#!/usr/bin/env python3
"""Inventaría pistas de georreferenciación locales para Cluster 2.

No modifica archivos. Busca metadata, world files, nombres de tiles y textos con
claves geoespaciales dentro de tmp/territorial-analysis/cluster-02-history.

Salida: JSON reproducible para decidir cómo reconstruir pixel -> coordenada del
mosaico 2023 antes de vectorizar detecciones.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import cv2

TEXT_EXTS = {".json", ".geojson", ".csv", ".txt", ".md", ".jgw", ".wld", ".tfw", ".prj", ".xml"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
KEYWORDS = (
    "bbox", "bounds", "extent", "west", "east", "north", "south",
    "lat", "lon", "lng", "zoom", "tile", "mercator", "epsg",
    "crs", "xmin", "xmax", "ymin", "ymax", "center",
)
TILE_PATTERNS = [
    re.compile(r"(?P<z>\d{1,2})[/\\](?P<x>\d+)[/\\](?P<y>\d+)(?:\.[A-Za-z0-9]+)?$"),
    re.compile(r"(?:^|[-_])z(?P<z>\d{1,2})(?:[-_])x(?P<x>\d+)(?:[-_])y(?P<y>\d+)", re.I),
    re.compile(r"(?:^|[-_])(?P<x>\d{4,})[-_](?P<y>\d{4,})[-_](?P<z>\d{1,2})(?:\.|$)"),
]


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument(
        "--root",
        type=Path,
        default=Path("tmp/territorial-analysis/cluster-02-history"),
    )
    p.add_argument(
        "--output",
        type=Path,
        default=Path("tmp/territorial-analysis/cluster-02-history/georef-inventory.json"),
    )
    p.add_argument("--max-text-bytes", type=int, default=2_000_000)
    return p.parse_args()


def image_info(path: Path):
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if im is None:
        return None
    h, w = im.shape[:2]
    return {"width": int(w), "height": int(h), "channels": 1 if im.ndim == 2 else int(im.shape[2])}


def tile_hint(path: Path, root: Path):
    rel = str(path.relative_to(root))
    for pat in TILE_PATTERNS:
        m = pat.search(rel)
        if m:
            return {k: int(v) for k, v in m.groupdict().items()}
    return None


def text_hits(path: Path, max_bytes: int):
    try:
        if path.stat().st_size > max_bytes:
            return None
        txt = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None
    lines = []
    for i, line in enumerate(txt.splitlines(), 1):
        low = line.lower()
        if any(k in low for k in KEYWORDS):
            lines.append({"line": i, "text": line[:500]})
            if len(lines) >= 40:
                break
    return lines or None


def main():
    a = parse_args()
    root = a.root.resolve()
    if not root.exists():
        raise SystemExit(f"No existe: {root}")

    report = {
        "root": str(root),
        "reference_image": None,
        "metadata_candidates": [],
        "world_files": [],
        "tile_hints": [],
        "images": [],
        "directories": [],
    }

    ref_candidates = [
        root / "2023-04-19.jpg",
        root / "registered-local" / "2023-04-19.jpg",
        root / "registered-v2" / "2023-04-19.jpg",
    ]
    for p in ref_candidates:
        if p.exists():
            report["reference_image"] = {
                "path": str(p.relative_to(root)),
                **(image_info(p) or {}),
            }
            break

    for p in sorted(root.rglob("*")):
        try:
            rel = str(p.relative_to(root))
        except Exception:
            rel = str(p)
        if p.is_dir():
            if len(report["directories"]) < 200:
                report["directories"].append(rel)
            continue

        suffix = p.suffix.lower()
        if suffix in IMAGE_EXTS and len(report["images"]) < 300:
            info = image_info(p)
            if info:
                report["images"].append({"path": rel, **info})

        hint = tile_hint(p, root)
        if hint and len(report["tile_hints"]) < 500:
            report["tile_hints"].append({"path": rel, **hint})

        if suffix in {".jgw", ".wld", ".tfw", ".prj"} or p.name.lower().endswith(".aux.xml"):
            try:
                content = p.read_text(encoding="utf-8", errors="ignore")[:4000]
            except Exception:
                content = ""
            report["world_files"].append({"path": rel, "content": content})

        if suffix in TEXT_EXTS or p.name.lower().endswith(".aux.xml"):
            hits = text_hits(p, a.max_text_bytes)
            if hits:
                report["metadata_candidates"].append({
                    "path": rel,
                    "size": p.stat().st_size,
                    "hits": hits,
                })

    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== GEOREF INVENTORY ===")
    print("root:", root)
    print("reference:", report["reference_image"])
    print("world_files:", len(report["world_files"]))
    print("tile_hints:", len(report["tile_hints"]))
    print("metadata_candidates:", len(report["metadata_candidates"]))
    print("images:", len(report["images"]))
    print()

    if report["world_files"]:
        print("WORLD FILES / CRS:")
        for row in report["world_files"][:20]:
            print(" -", row["path"])

    if report["tile_hints"]:
        print("TILE HINTS (primeros 20):")
        for row in report["tile_hints"][:20]:
            print(" -", row)

    if report["metadata_candidates"]:
        print("METADATA CANDIDATES:")
        for row in report["metadata_candidates"][:30]:
            print(" -", row["path"])
            for hit in row["hits"][:5]:
                print(f"    L{hit['line']}: {hit['text']}")

    print()
    print("JSON:", a.output)


if __name__ == "__main__":
    main()
