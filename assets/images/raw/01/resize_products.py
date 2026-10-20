from pathlib import Path
from PIL import Image, ImageOps

# ---------------- تنظیمات ----------------
ROOT = Path(__file__).resolve().parent  # پوشه‌ای که اسکریپت در آن قرار دارد
W, H = 900, 1200                        # عرض و ارتفاع خروجی (این خط جا افتاده بود)
PAD = False
QUALITY = 80
EXTS = {".jpg", ".jpeg", ".jfif", ".png", ".webp", ".bmp"}
DELETE_ORIGINALS = True   # بعد از تبدیل موفق، عکس اصلی حذف شود
# -----------------------------------------


def to_rgb(im):
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def main():
    if not ROOT.is_dir():
        print("ERROR: مسیر پیدا نشد:", ROOT)
        return

    print("Root:", ROOT)

    folders = [ROOT] + [p for p in sorted(ROOT.rglob("*")) if p.is_dir()]
    done, failed, deleted = 0, [], 0

    for folder in folders:
        files = [f for f in sorted(folder.iterdir())
                 if f.is_file() and f.suffix.lower() in EXTS]
        if not files:
            continue

        non_webp = [f for f in files if f.suffix.lower() != ".webp"]
        if not non_webp:
            continue

        base_name = folder.name

        for idx, f in enumerate(files, start=1):
            stem = base_name if len(files) == 1 else f"{base_name}-{idx}"
            out = folder / f"{stem}.webp"

            if out.resolve() == f.resolve():
                continue

            try:
                im = to_rgb(Image.open(f))
                if PAD:
                    im = ImageOps.pad(im, (W, H), color="white")
                else:
                    im = ImageOps.fit(im, (W, H), Image.LANCZOS, centering=(0.5, 0.4))
                im.save(out, "WEBP", quality=QUALITY, method=6)

                if not out.exists() or out.stat().st_size == 0:
                    raise RuntimeError("خروجی ساخته نشد یا خالی است")

                print(f"OK  {f.name}  ->  {out.name}")

                if DELETE_ORIGINALS and f.suffix.lower() != ".webp":
                    f.unlink()
                    deleted += 1
                    print(f"     deleted original: {f.name}")

                done += 1
            except Exception as e:
                failed.append((f, e))
                print("FAILED:", f, "->", e)

    print(f"\nDone: {done} converted, {deleted} originals deleted, {len(failed)} failed.")


if __name__ == "__main__":
    main()