#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_thumbs.py — ساخت تصویر کوچک (thumbnail) برای کارت‌های محصول، نوار تصاویر و جستجو

برای هر  assets/images/products/**/<name>.webp  یک فایل  <name>-t.webp  (۵۴۰×۷۲۰، کیفیت ۷۸) می‌سازد.
عکس‌های اصلی دست نمی‌خورند (فقط در صفحهٔ خود محصول نمایش داده می‌شوند).
فایل‌هایی که تامبنیل به‌روزشان وجود دارد دوباره ساخته نمی‌شوند.

اجرا:   python make_thumbs.py            (یا RUN_THUMBS.bat)
        python make_thumbs.py --force    (ساخت دوباره‌ی همه)
"""
import os
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

try:
    from PIL import Image, ImageOps
except ImportError:
    print("❌ Pillow نصب نیست:  pip install pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "assets" / "images" / "products"
SIZE = (540, 720)
QUALITY = 78
FORCE = "--force" in sys.argv


def is_thumb(p):
    return p.stem.endswith("-t")


def main():
    if not PRODUCTS.exists():
        print(f"❌ پوشه پیدا نشد: {PRODUCTS}")
        return
    srcs = [p for p in PRODUCTS.rglob("*.webp") if not is_thumb(p)]
    made = skipped = failed = 0
    before = after = 0
    big = []
    for p in sorted(srcs):
        t = p.with_name(p.stem + "-t.webp")
        before += p.stat().st_size
        if p.stat().st_size > 250 * 1024:
            big.append((p.stat().st_size, p))
        if t.exists() and not FORCE and t.stat().st_mtime >= p.stat().st_mtime:
            skipped += 1
            after += t.stat().st_size
            continue
        try:
            with Image.open(p) as im:
                im = ImageOps.exif_transpose(im)
                alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
                im = im.convert("RGBA" if alpha else "RGB")
                th = ImageOps.fit(im, SIZE, Image.LANCZOS, centering=(0.5, 0.5))
                th.save(t, "WEBP", quality=QUALITY, method=4)
            made += 1
            after += t.stat().st_size
        except Exception as e:
            failed += 1
            print(f"❌ {p.relative_to(ROOT).as_posix()}: {e}")
    print("=" * 60)
    print(f"🖼️  عکس اصلی: {len(srcs)}   |   تامبنیل جدید: {made}   |   از قبل بود: {skipped}   |   خطا: {failed}")
    if len(srcs):
        print(f"📦 حجم کل عکس‌های اصلی: {before/1048576:.1f} MB   |   حجم کل تامبنیل‌ها: {after/1048576:.1f} MB")
        avg_o, avg_t = before / len(srcs) / 1024, (after / max(1, len(srcs) - failed)) / 1024
        print(f"   میانگین هر عکس اصلی: {avg_o:.0f} KB   |   میانگین هر تامبنیل: {avg_t:.0f} KB")
    if big:
        big.sort(reverse=True)
        print(f"\n⚠️ {len(big)} عکس اصلی بزرگ‌تر از ۲۵۰KB است (در صفحهٔ محصول سنگین‌اند). بزرگ‌ترین‌ها:")
        for s, p in big[:10]:
            print(f"   {s//1024} KB  {p.relative_to(ROOT).as_posix()}")
    print("=" * 60)


if __name__ == "__main__":
    main()
