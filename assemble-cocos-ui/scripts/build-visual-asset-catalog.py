#!/usr/bin/env python3
import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--reference")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    files = sorted(root.rglob("*.png"))
    items = []
    for index, path in enumerate(files):
        try:
            with Image.open(path) as source:
                image = source.convert("RGBA")
                items.append({
                    "id": f"A{index:04d}",
                    "path": str(path),
                    "relative": path.relative_to(root).as_posix(),
                    "width": image.width,
                    "height": image.height,
                    "alpha_bbox": image.getchannel("A").getbbox(),
                })
        except Exception as error:
            items.append({
                "id": f"A{index:04d}",
                "path": str(path),
                "relative": path.relative_to(root).as_posix(),
                "error": str(error),
            })

    (output / "manifest.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    columns, rows = 6, 8
    cell_width, cell_height = 240, 160
    page_size = columns * rows
    page_count = math.ceil(len(items) / page_size)
    for page in range(page_count):
        sheet = Image.new(
            "RGB", (columns * cell_width, rows * cell_height), (38, 38, 38)
        )
        draw = ImageDraw.Draw(sheet)
        page_items = items[page * page_size:(page + 1) * page_size]
        for offset, item in enumerate(page_items):
            x = (offset % columns) * cell_width
            y = (offset // columns) * cell_height
            draw.rectangle(
                (x, y, x + cell_width - 1, y + cell_height - 1), outline=(75, 75, 75)
            )
            if "error" not in item:
                with Image.open(item["path"]) as source:
                    image = source.convert("RGBA")
                image.thumbnail((220, 112), Image.Resampling.LANCZOS)
                sheet.paste(image, (x + (cell_width - image.width) // 2, y + 3), image)
            draw.text(
                (x + 4, y + 118),
                f'{item["id"]} {item.get("width", "?")}x{item.get("height", "?")}',
                fill=(255, 215, 90),
            )
            draw.text((x + 4, y + 135), item["relative"][:38], fill="white")
        sheet.save(output / f"catalog-{page + 1:02d}.jpg", quality=92)

    if args.reference:
        reference = Image.open(args.reference).convert("RGB")
        draw = ImageDraw.Draw(reference)
        boxes = [
            ("TOP_SCENE", (7, 90, 370, 201), "#00ffff"),
            ("SHOP", (50, 165, 98, 190), "#00ff80"),
            ("PANEL", (13, 188, 364, 699), "#ff00ff"),
            ("CITY_BANNER", (16, 191, 351, 255), "#ffff00"),
            ("HELP", (22, 207, 51, 239), "#ff8000"),
            ("CLOSE", (331, 177, 371, 220), "#ff0000"),
            ("ITEM_OPEN", (26, 257, 349, 359), "#00ff00"),
            ("NAME", (32, 260, 126, 292), "#00a0ff"),
            ("PIN", (119, 260, 143, 291), "#a000ff"),
            ("PROGRESS", (213, 259, 345, 284), "#ff60a0"),
            ("LOCK_1", (168, 390, 207, 443), "#ffd000"),
            ("LOCKED_1", (27, 365, 349, 466), "#80ff00"),
            ("LOCKED_2", (27, 473, 349, 572), "#80ff00"),
            ("LOCKED_3", (27, 579, 349, 679), "#80ff00"),
        ]
        for name, bounds, color in boxes:
            draw.rectangle(bounds, outline=color, width=2)
            draw.text((bounds[0] + 2, max(2, bounds[1] - 12)), name, fill=color)
        reference.save(output / "reference-annotated.png")

    print(json.dumps({"assets": len(items), "pages": page_count, "output": str(output)}))


if __name__ == "__main__":
    main()
