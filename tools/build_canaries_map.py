#!/usr/bin/env python3
"""
Build a high-resolution Canary Islands SVG path for static/maps/maps_data.json.

Usage examples:
  python tools/build_canaries_map.py \
    --url https://opendata.sitcan.es/upload/unidades-administrativas/gobcan_unidades-administrativas_islas.geojson \
    --maps static/maps/maps_data.json \
    --tolerance 0.8

  python tools/build_canaries_map.py --input canarias.geojson --output canaries_entry.json

The output format matches cata-vinos maps_data.json:
{
  "canaries": {
    "label": "Islas Canarias",
    "bbox": [lonMin, lonMax, latMin, latMax],
    "size": [width, height],
    "path": "M ... Z ..."
  }
}
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.request
from pathlib import Path
from typing import Any, Iterable, List, Tuple

Point = Tuple[float, float]
Ring = List[Point]

DEFAULT_URL = "https://opendata.sitcan.es/upload/unidades-administrativas/gobcan_unidades-administrativas_islas.geojson"


def load_geojson(args: argparse.Namespace) -> dict:
    if args.input:
        return json.loads(Path(args.input).read_text(encoding="utf-8"))

    url = args.url or DEFAULT_URL
    print(f"Downloading GeoJSON from {url}...", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": "cata-vinos-map-builder/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode("utf-8")
    return json.loads(raw)


def iter_geometries(obj: dict) -> Iterable[dict]:
    typ = obj.get("type")
    if typ == "FeatureCollection":
        for feat in obj.get("features", []):
            geom = feat.get("geometry")
            if geom:
                yield from iter_geometries(geom)
    elif typ == "Feature":
        geom = obj.get("geometry")
        if geom:
            yield from iter_geometries(geom)
    elif typ == "GeometryCollection":
        for geom in obj.get("geometries", []):
            yield from iter_geometries(geom)
    else:
        yield obj


def extract_rings(geojson: dict) -> List[Ring]:
    rings: List[Ring] = []
    for geom in iter_geometries(geojson):
        typ = geom.get("type")
        coords = geom.get("coordinates")
        if not coords:
            continue

        if typ == "Polygon":
            for ring in coords:
                rings.append([(float(lon), float(lat)) for lon, lat, *rest in ring])
        elif typ == "MultiPolygon":
            for poly in coords:
                for ring in poly:
                    rings.append([(float(lon), float(lat)) for lon, lat, *rest in ring])

    # Drop tiny rings/noise.
    rings = [r for r in rings if len(r) >= 4]
    if not rings:
        raise ValueError("No Polygon/MultiPolygon rings found in GeoJSON")
    return rings


def perpendicular_distance(p: Point, a: Point, b: Point) -> float:
    x, y = p
    x1, y1 = a
    x2, y2 = b
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / math.hypot(dx, dy)


def douglas_peucker(points: Ring, tolerance: float) -> Ring:
    if tolerance <= 0 or len(points) <= 3:
        return points

    # Work on open line; caller ensures closure.
    first = points[0]
    last = points[-1]
    max_dist = -1.0
    index = -1

    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], first, last)
        if d > max_dist:
            index = i
            max_dist = d

    if max_dist > tolerance:
        left = douglas_peucker(points[: index + 1], tolerance)
        right = douglas_peucker(points[index:], tolerance)
        return left[:-1] + right
    return [first, last]


def close_ring(ring: Ring) -> Ring:
    if ring[0] != ring[-1]:
        return ring + [ring[0]]
    return ring


def bounds(rings: List[Ring]) -> Tuple[float, float, float, float]:
    lons = [p[0] for r in rings for p in r]
    lats = [p[1] for r in rings for p in r]
    return min(lons), max(lons), min(lats), max(lats)


def make_projector(lon_min: float, lon_max: float, lat_min: float, lat_max: float, width: int, height: int):
    def project(point: Point) -> Point:
        lon, lat = point
        x = (lon - lon_min) / (lon_max - lon_min) * width
        y = (lat_max - lat) / (lat_max - lat_min) * height
        return x, y
    return project


def ring_to_path(ring: Ring) -> str:
    if len(ring) < 3:
        return ""
    parts = [f"M {ring[0][0]:.1f},{ring[0][1]:.1f}"]
    parts.extend(f"L {x:.1f},{y:.1f}" for x, y in ring[1:])
    parts.append("Z")
    return " ".join(parts)


def build_entry(geojson: dict, width: int, height: int, tolerance: float, padding_deg: float) -> dict:
    lon_min, lon_max, lat_min, lat_max = bounds(extract_rings(geojson))

    lon_min -= padding_deg
    lon_max += padding_deg
    lat_min -= padding_deg
    lat_max += padding_deg

    projector = make_projector(lon_min, lon_max, lat_min, lat_max, width, height)

    projected_rings: List[Ring] = []
    for ring in extract_rings(geojson):
        projected = [projector(p) for p in ring]
        projected = close_ring(projected)

        # Simplify without losing closure.
        open_ring = projected[:-1]
        simplified = douglas_peucker(open_ring, tolerance)
        simplified = close_ring(simplified)
        if len(simplified) >= 4:
            projected_rings.append(simplified)

    path = " ".join(ring_to_path(r) for r in projected_rings if r)

    return {
        "label": "Islas Canarias",
        "bbox": [round(lon_min, 6), round(lon_max, 6), round(lat_min, 6), round(lat_max, 6)],
        "size": [width, height],
        "path": path,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL, help="GeoJSON URL to download")
    parser.add_argument("--input", help="Local GeoJSON file instead of --url")
    parser.add_argument("--output", default="canaries_entry.json", help="Output JSON snippet")
    parser.add_argument("--maps", help="Optional static/maps/maps_data.json to patch in-place")
    parser.add_argument("--width", type=int, default=760)
    parser.add_argument("--height", type=int, default=340)
    parser.add_argument("--tolerance", type=float, default=0.8, help="Simplification tolerance in SVG pixels. Try 0.4-1.2")
    parser.add_argument("--padding-deg", type=float, default=0.08, help="BBox padding in degrees")
    args = parser.parse_args()

    geojson = load_geojson(args)
    entry = build_entry(
        geojson,
        width=args.width,
        height=args.height,
        tolerance=args.tolerance,
        padding_deg=args.padding_deg,
    )

    snippet = {"canaries": entry}
    Path(args.output).write_text(json.dumps(snippet, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {args.output}", file=sys.stderr)
    print(f"Path length: {len(entry['path'])}", file=sys.stderr)

    if args.maps:
        maps_path = Path(args.maps)
        maps = json.loads(maps_path.read_text(encoding="utf-8"))
        maps["canaries"] = entry
        maps_path.write_text(json.dumps(maps, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Patched {args.maps}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
