from pathlib import Path
from PIL import Image, ImageOps

SIZE = 160      # مربع ۱۶۰×۱۶۰
QUALITY = 85
EXTS = {".jpg", ".jpeg", ".jfif", ".png", ".webp", ".bmp"}


def find_root():
    for start in (Path(__file__).resolve().parent, Path.cwd()):
        for p in [start, *start.parents]:
            if (p / "assets" / "images").is_dir():
                return p
    return None


def main():
    root = find_root()
    if root is None:
        print("ERROR: could not find assets/images")
        return
    src = root / "assets" / "images" / "sellers_raw"
    dst = root / "assets" / "images" / "sellers"
    src.mkdir(parents=True, exist_ok=True)
    dst.mkdir(parents=True, exist_ok=True)

    files = [f for f in sorted(src.iterdir()) if f.suffix.lower() in EXTS]
    if not files:
        print(f"Put the seller photos in: {src}")
        print("Then run this script again.")
        return

    for f in files:
        im = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
        # برش مربع؛ مرکز کمی بالاتر تا صورت وسط دایره بیفتد
        im = ImageOps.fit(im, (SIZE, SIZE), Image.LANCZOS, centering=(0.5, 0.35))
        out = dst / (f.stem + ".webp")
        im.save(out, "WEBP", quality=QUALITY, method=6)
        print("OK:", out.name)
    print("Done ->", dst)


if __name__ == "__main__":
    main()
