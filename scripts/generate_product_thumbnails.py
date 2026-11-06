#!/usr/bin/env python3
"""Create lightweight WebP thumbnails beside product originals.

Original product photos are never modified. Each source file gets a sibling
named <original>-t.webp, capped at 480x640 while preserving its aspect ratio.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image, ImageOps

MAX_SIZE = (480, 640)
QUALITY = 76
SUPPORTED = {".webp"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate product-card thumbnails.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate thumbnails even when they already exist.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List work without creating or changing any files.",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    source_root = project_root / "assets" / "images" / "products"
    if not source_root.is_dir():
        parser.error(f"Product image folder not found: {source_root}")

    sources = [
        path for path in sorted(source_root.rglob("*"))
        if path.is_file()
        and path.suffix.lower() in SUPPORTED
        and not path.stem.lower().endswith("-t")
    ]

    created = skipped = failed = 0
    original_bytes = thumbnail_bytes = 0

    print(f"Source: {source_root}")
    print(f"Found {len(sources)} original WebP images.")

    for source in sources:
        target = source.with_name(f"{source.stem}-t.webp")

        if target.exists() and not args.force:
            skipped += 1
            continue

        if args.dry_run:
            created += 1
            continue

        try:
            with Image.open(source) as opened:
                image = ImageOps.exif_transpose(opened)

                # Preserve transparency when it exists; otherwise use RGB.
                has_alpha = "A" in image.getbands() or "transparency" in image.info
                image = image.convert("RGBA" if has_alpha else "RGB")
                image.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)
                image.save(target, format="WEBP", quality=QUALITY, method=5)

            created += 1
            original_bytes += source.stat().st_size
            thumbnail_bytes += target.stat().st_size
        except Exception as exc:
            failed += 1
            print(f"FAILED: {source.relative_to(source_root)}: {exc}")

    print(
        f"Finished: {created} generated, {skipped} skipped, {failed} failed."
    )
    if not args.dry_run and original_bytes:
        saved = original_bytes - thumbnail_bytes
        print(
            f"Processed source size: {original_bytes / 1024 / 1024:.1f} MiB; "
            f"thumbnail size: {thumbnail_bytes / 1024 / 1024:.1f} MiB; "
            f"estimated transfer reduction for these images: "
            f"{saved / 1024 / 1024:.1f} MiB."
        )

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
