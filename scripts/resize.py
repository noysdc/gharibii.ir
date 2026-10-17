from pathlib import Path
from PIL import Image, ImageOps

# ---------------- تنظیمات ----------------
W, H = 900, 1200      # اندازه استاندارد (نسبت ۳:۴)
PAD = False           # False = برش وسط | True = بدون برش، با حاشیه سفید
QUALITY = 80          # کیفیت WebP
EXTS = {".jpg", ".jpeg", ".jfif", ".png", ".webp", ".bmp"}
# ------------------------------------------


def find_root():
    """پوشه اصلی پروژه را پیدا می‌کند (جایی که assets/images/products دارد)."""
    starts = [Path(__file__).resolve().parent, Path.cwd()]
    for start in starts:
        for p in [start, *start.parents]:
            if (p / "assets" / "images" / "products").is_dir():
                return p
    return None


def to_rgb(im):
    """شفافیت را روی پس‌زمینه سفید می‌گذارد تا پس‌زمینه سیاه نشود."""
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def main():
    root = find_root()
    if root is None:
        print("ERROR: could not find assets/images/products")
        return

    src = root / "assets" / "images" / "products"
    dst = root / "assets" / "images" / "products_resized"
    print("Source:", src)
    print("Output:", dst)

    files = [f for f in sorted(src.rglob("*")) if f.is_file() and f.suffix.lower() in EXTS]
    if not files:
        print("No images found in the source folder.")
        return

    seen, done, failed = set(), 0, []
    for f in files:
        out = dst / f.relative_to(src).with_suffix(".webp")
        if out in seen:  # دو فایل هم‌نام با پسوند متفاوت
            out = out.with_name(f"{f.stem}-{f.suffix[1:].lower()}.webp")
            print("Same name, saved as:", out.name)
        seen.add(out)
        try:
            out.parent.mkdir(parents=True, exist_ok=True)
            im = to_rgb(Image.open(f))
            if PAD:
                im = ImageOps.pad(im, (W, H), color="white")
            else:
                im = ImageOps.fit(im, (W, H), Image.LANCZOS, centering=(0.5, 0.4))
            im.save(out, "WEBP", quality=QUALITY, method=6)
            done += 1
        except Exception as e:
            failed.append((f, e))

    print(f"\nDone: {done} images converted, {len(failed)} failed.")
    for f, e in failed:
        print("  FAILED:", f, "->", e)


if __name__ == "__main__":
    main()