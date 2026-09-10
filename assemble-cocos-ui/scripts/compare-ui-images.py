#!/usr/bin/env python3
"""Strict RGBA comparison for a Cocos UI render and its reference image."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - depends on the host runtime
    raise SystemExit("Pillow is required: python -m pip install Pillow") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare two images without tolerance; exit 0 only for identical RGBA pixels."
    )
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--actual", required=True, type=Path)
    parser.add_argument("--diff", type=Path, help="Optional RGBA heatmap output")
    parser.add_argument("--overlay", type=Path, help="Optional 50 percent overlay output")
    parser.add_argument("--report", type=Path, help="Optional JSON report output")
    return parser.parse_args()


def save_image(image: Image.Image, path: Path | None) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def write_report(report: dict, path: Path | None) -> None:
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(payload + "\n", encoding="utf-8")
    print(payload)


def main() -> int:
    args = parse_args()
    reference = Image.open(args.reference).convert("RGBA")
    actual = Image.open(args.actual).convert("RGBA")

    base_report = {
        "reference": str(args.reference.resolve()),
        "actual": str(args.actual.resolve()),
        "referenceSize": list(reference.size),
        "actualSize": list(actual.size),
    }
    if reference.size != actual.size:
        write_report(
            {
                **base_report,
                "identical": False,
                "reason": "size-mismatch",
                "mismatchPixels": None,
            },
            args.report,
        )
        return 2

    width, height = reference.size
    reference_pixels = reference.load()
    actual_pixels = actual.load()
    heatmap = Image.new("RGBA", reference.size, (0, 0, 0, 0))
    heatmap_pixels = heatmap.load()
    row_counts = [0] * height
    column_counts = [0] * width

    mismatch_pixels = 0
    max_channel_difference = 0
    absolute_difference_sum = 0
    min_x, min_y = width, height
    max_x = max_y = -1

    for y in range(height):
        for x in range(width):
            expected = reference_pixels[x, y]
            observed = actual_pixels[x, y]
            differences = tuple(abs(a - b) for a, b in zip(expected, observed))
            pixel_difference = max(differences)
            absolute_difference_sum += sum(differences)
            if pixel_difference == 0:
                continue

            mismatch_pixels += 1
            row_counts[y] += 1
            column_counts[x] += 1
            max_channel_difference = max(max_channel_difference, pixel_difference)
            min_x, min_y = min(min_x, x), min(min_y, y)
            max_x, max_y = max(max_x, x), max(max_y, y)
            heatmap_pixels[x, y] = (255, max(0, 255 - pixel_difference * 2), 0, 255)

    pixel_count = width * height
    mismatch_bounds = None
    if mismatch_pixels:
        mismatch_bounds = {
            "left": min_x,
            "top": min_y,
            "rightExclusive": max_x + 1,
            "bottomExclusive": max_y + 1,
        }

    report = {
        **base_report,
        "identical": mismatch_pixels == 0,
        "mismatchPixels": mismatch_pixels,
        "mismatchRatio": mismatch_pixels / pixel_count if pixel_count else 0,
        "maxChannelDifference": max_channel_difference,
        "meanAbsoluteChannelDifference": (
            absolute_difference_sum / (pixel_count * 4) if pixel_count else 0
        ),
        "mismatchBounds": mismatch_bounds,
        "topMismatchRows": [
            {"index": index, "pixels": count}
            for index, count in sorted(
                enumerate(row_counts), key=lambda item: item[1], reverse=True
            )[:10]
            if count
        ],
        "topMismatchColumns": [
            {"index": index, "pixels": count}
            for index, count in sorted(
                enumerate(column_counts), key=lambda item: item[1], reverse=True
            )[:10]
            if count
        ],
    }

    save_image(heatmap, args.diff)
    save_image(Image.blend(reference, actual, 0.5), args.overlay)
    write_report(report, args.report)
    return 0 if report["identical"] else 1


if __name__ == "__main__":
    sys.exit(main())
