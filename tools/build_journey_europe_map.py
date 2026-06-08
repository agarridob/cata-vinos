#!/usr/bin/env python3
"""
Build a medium/high-resolution single SVG map for the Journey view.

It adds/replaces this key in static/maps/maps_data.json:

  "journey_europe": {
    "label": "Europa occidental",
    "bbox": [-19.5, 16.5, 26.5, 53.5],
    "size": [980, 680],
    "path": "M ... Z"
  }

Default source: Natural Earth 1:50m land polygons.
This is a good middle point between the current 1:110m schematic map and very heavy 1:10m data.

Requirements for this one-off generator:

  pip install geopandas shapely pyogrio

Usage:

  python tools/build_journey_europe_map.py \
    --maps static/maps/maps_data.json \
    --target-length 12000

More detail:

  python tools/build_journey_europe_map.py --maps static/maps/maps_data.json --target-length 18000

Less detail:

  python tools/build_journey_europe_map.py --maps static/maps/maps_data.json --target-length 9000

Notes:
- This script is for development only. The Flask app does NOT need geopandas at runtime.
- If maps_data.json already has a high-res "canaries" map, this script reprojects that path into the journey map so Canarias stays sharper.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

try:
    import geopandas as gpd
    from shapely.geometry import box, Polygon, MultiPolygon, GeometryCollection
    from shapely.ops import unary_union
except Exception as exc:  # pragma: no cover
    print("Missing dependency: geopandas/shapely.", file=sys.stderr)
    print("Install dev dependencies with:", file=sys.stderr)
    print("  pip install geopandas shapely pyogrio", file=sys.stderr)
    raise

NE_50M_LAND_URL = "https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_land.zip"
NE_10M_LAND_URL = "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip"
NE_110M_LAND_URL = "https://naturalearth.s3.amazonaws.com/110m_physical/ne_110m_land.zip"

DEFAULT_BBOX = [-19.5, 16.5, 26.5, 53.5]  # lonMin, lonMax, latMin, latMax
DEFAULT_SIZE = [980, 680]


def download_zip(url: str, cache_dir: Path) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    zip_path = cache_dir / Path(url).name
    if zip_path.exists() and zip_path.stat().st_size > 0:
        print(f"Using cached {zip_path}", file=sys.stderr)
        return zip_path

    print(f"Downloading {url}", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": "cata-vinos-journey-map-builder/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        zip_path.write_bytes(r.read())
    return zip_path


def extract_zip(zip_path: Path, extract_dir: Path) -> Path:
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extract_dir)
    shp_files = list(extract_dir.glob("*.shp"))
    if not shp_files:
        raise RuntimeError(f"No .shp file found after extracting {zip_path}")
    return shp_files[0]


def project(lon: float, lat: float, bbox, size):
    lon_min, lon_max, lat_min, lat_max = bbox
    width, height = size
    x = (lon - lon_min) / (lon_max - lon_min) * width
    y = (lat_max - lat) / (lat_max - lat_min) * height
    return x, y


def ring_to_path(coords, bbox, size) -> str:
    pts = [project(float(lon), float(lat), bbox, size) for lon, lat, *_ in coords]
    if len(pts) < 3:
        return ""
    out = [f"M {pts[0][0]:.1f},{pts[0][1]:.1f}"]
    out.extend(f"L {x:.1f},{y:.1f}" for x, y in pts[1:])
    out.append("Z")
    return " ".join(out)


def geom_to_path(geom, bbox, size) -> str:
    if geom.is_empty:
        return ""

    parts = []

    if isinstance(geom, Polygon):
        parts.append(ring_to_path(list(geom.exterior.coords), bbox, size))
        # Holes intentionally ignored: this map is a TV background, not GIS analysis.
    elif isinstance(geom, MultiPolygon):
        for poly in geom.geoms:
            parts.append(geom_to_path(poly, bbox, size))
    elif isinstance(geom, GeometryCollection):
        for sub in geom.geoms:
            parts.append(geom_to_path(sub, bbox, size))

    return " ".join(p for p in parts if p)


def load_land_geometry(scale: str, cache_dir: Path, bbox):
    url = {
        "110m": NE_110M_LAND_URL,
        "50m": NE_50M_LAND_URL,
        "10m": NE_10M_LAND_URL,
    }[scale]

    zip_path = download_zip(url, cache_dir)
    shp_path = extract_zip(zip_path, cache_dir / zip_path.stem)

    print(f"Reading {shp_path}", file=sys.stderr)
    gdf = gpd.read_file(shp_path)

    lon_min, lon_max, lat_min, lat_max = bbox
    clip_geom = box(lon_min, lat_min, lon_max, lat_max)

    clipped = []
    for geom in gdf.geometry:
        inter = geom.intersection(clip_geom)
        if not inter.is_empty:
            clipped.append(inter)

    if not clipped:
        raise RuntimeError("No land geometry intersects the selected bbox")

    return unary_union(clipped)


def build_path_for_tolerance(geom, tolerance_deg: float, bbox, size) -> str:
    simplified = geom.simplify(tolerance_deg, preserve_topology=True)
    return geom_to_path(simplified, bbox, size)


def build_path_target_length(geom, target_length: int, bbox, size) -> tuple[str, float]:
    # Binary search a simplify tolerance in degrees.
    # Lower tolerance = more detail = longer path.
    low = 0.0
    high = 0.20
    best_path = build_path_for_tolerance(geom, 0.035, bbox, size)
    best_tol = 0.035
    best_diff = abs(len(best_path) - target_length)

    for _ in range(18):
        mid = (low + high) / 2
        path = build_path_for_tolerance(geom, mid, bbox, size)
        diff = abs(len(path) - target_length)

        if diff < best_diff:
            best_path = path
            best_tol = mid
            best_diff = diff

        if len(path) > target_length:
            # Too detailed; simplify more.
            low = mid
        else:
            # Too short; simplify less.
            high = mid

    return best_path, best_tol


def transform_existing_canaries(maps_data: dict, dst_bbox, dst_size) -> str:
    can = maps_data.get("canaries")
    if not can or not can.get("path") or not can.get("bbox") or not can.get("size"):
        return ""

    src_bbox = can["bbox"]
    src_size = can["size"]
    slon_min, slon_max, slat_min, slat_max = src_bbox
    sw, sh = src_size

    # Supports M/L/C/Z commands as produced by previous generators.
    token_re = re.compile(r"([MLCZ])|(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")
    out = []

    for match in token_re.finditer(can["path"]):
        command = match.group(1)
        if command:
            out.append(command)
            continue

        x = float(match.group(2))
        y = float(match.group(3))
        lon = slon_min + (x / sw) * (slon_max - slon_min)
        lat = slat_max - (y / sh) * (slat_max - slat_min)
        nx, ny = project(lon, lat, dst_bbox, dst_size)
        out.append(f"{nx:.1f},{ny:.1f}")

    return " ".join(out)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--maps", default="static/maps/maps_data.json", help="maps_data.json to patch")
    parser.add_argument("--output", default="journey_europe_entry.json", help="standalone output snippet")
    parser.add_argument("--scale", choices=["110m", "50m", "10m"], default="50m")
    parser.add_argument("--target-length", type=int, default=12000, help="target path length before adding high-res Canarias")
    parser.add_argument("--width", type=int, default=DEFAULT_SIZE[0])
    parser.add_argument("--height", type=int, default=DEFAULT_SIZE[1])
    parser.add_argument("--bbox", nargs=4, type=float, default=DEFAULT_BBOX, metavar=("LON_MIN", "LON_MAX", "LAT_MIN", "LAT_MAX"))
    parser.add_argument("--cache-dir", default=".cache/natural-earth")
    parser.add_argument("--no-canaries-extra", action="store_true", help="do not reproject existing high-res canaries path")
    args = parser.parse_args()

    bbox = list(args.bbox)
    size = [args.width, args.height]
    maps_path = Path(args.maps)

    maps_data = {}
    if maps_path.exists():
        maps_data = json.loads(maps_path.read_text(encoding="utf-8"))

    geom = load_land_geometry(args.scale, Path(args.cache_dir), bbox)
    land_path, tolerance = build_path_target_length(geom, args.target_length, bbox, size)

    canaries_path = ""
    if not args.no_canaries_extra and maps_data:
        canaries_path = transform_existing_canaries(maps_data, bbox, size)

    combined_path = land_path + (" " + canaries_path if canaries_path else "")

    entry = {
        "label": "Europa occidental",
        "bbox": bbox,
        "size": size,
        "path": combined_path,
    }

    snippet = {"journey_europe": entry}
    Path(args.output).write_text(json.dumps(snippet, ensure_ascii=False, indent=2), encoding="utf-8")

    if maps_path.exists():
        maps_data["journey_europe"] = entry
        maps_path.write_text(json.dumps(maps_data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Patched {maps_path}", file=sys.stderr)
    else:
        print(f"maps file not found, wrote only {args.output}", file=sys.stderr)

    print(f"Scale: {args.scale}", file=sys.stderr)
    print(f"Tolerance: {tolerance:.6f} degrees", file=sys.stderr)
    print(f"Land path length: {len(land_path)}", file=sys.stderr)
    print(f"Canaries extra length: {len(canaries_path)}", file=sys.stderr)
    print(f"Final path length: {len(combined_path)}", file=sys.stderr)
    print(f"Wrote {args.output}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
