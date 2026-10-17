"""
ساخت آیکن‌های نصب اپلیکیشن (PWA) از لوگوی فروشگاه.

اجرا (از هر جا):   python scripts/make_icons.py
لوگو را از این مسیر می‌خواند:  C:\Users\unes shojaei\Documents\GitHub\gharibii.ir\assets\images\gharibii-store-logo.webp  (یا .png)
خروجی:  assets/icons/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
اگر لوگو پیدا نشود، یک آیکن موقت (تاج) می‌سازد.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

BG_TOP = (10, 102, 112)      # فیروزه‌ای
BG_BOTTOM = (59, 42, 107)    # بنفش


def find_root():
    for start in (Path(__file__).resolve().parent, Path.cwd()):
        for p in [start, *start.parents]:
            if (p / "assets").is_dir():
                return p
    return None


def gradient(size):
    g = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        g.putpixel((0, y), tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)))
    return g.resize((size, size))


def placeholder_logo(S=1024):
    """آیکن موقت: حباب شیشه‌ای با تاج."""
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 0, S, S), fill=(255, 255, 255, 40), outline=(255, 255, 255, 140), width=S // 60)
    crown = [(0.22, 0.66), (0.22, 0.40), (0.38, 0.54), (0.50, 0.30), (0.62, 0.54), (0.78, 0.40), (0.78, 0.66)]
    d.polygon([(x * S, y * S) for x, y in crown], fill=(255, 214, 102, 255))
    d.rectangle((0.22 * S, 0.68 * S, 0.78 * S, 0.76 * S), fill=(255, 140, 60, 255))
    for cx, cy, c in ((0.50, 0.30, (0, 229, 255)), (0.22, 0.40, (255, 77, 148)), (0.78, 0.40, (255, 77, 148))):
        r = S * 0.04
        d.ellipse((cx * S - r, cy * S - r, cx * S + r, cy * S + r), fill=c + (255,))
    return im


def load_logo(root):
    for name in ("gharibii-store-logo.webp", "gharibii-store-logo.png", "gharibii-store-logo.jpg"):
        f = root / "assets" / "images" / name
        if f.exists():
            print("لوگو:", f)
            return Image.open(f).convert("RGBA")
    print("لوگو پیدا نشد؛ آیکن موقت ساخته می‌شود.")
    return placeholder_logo()


def make(logo, size, scale, rounded):
    S = size * 2                                  # ساخت بزرگ‌تر برای لبه‌های نرم
    bg = gradient(S).convert("RGBA")
    L = int(S * scale)
    lg = logo.copy()
    lg.thumbnail((L, L), Image.LANCZOS)
    # سایه ملایم زیر لوگو
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh = Image.new("RGBA", lg.size, (0, 0, 0, 90))
    shadow.paste(sh, ((S - lg.width) // 2, (S - lg.height) // 2 + S // 60), lg.split()[-1])
    shadow = shadow.filter(ImageFilter.GaussianBlur(S // 60))
    bg = Image.alpha_composite(bg, shadow)
    bg.alpha_composite(lg, ((S - lg.width) // 2, (S - lg.height) // 2))
    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, S, S), radius=int(S * 0.22), fill=255)
        bg.putalpha(mask)
    return bg.resize((size, size), Image.LANCZOS)


def main():
    root = find_root()
    if root is None:
        print("ERROR: پوشه assets پیدا نشد.")
        return
    out = root / "assets" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    logo = load_logo(root)
    jobs = [
        ("icon-192.png", 192, 0.78, True),
        ("icon-512.png", 512, 0.78, True),
        ("maskable-512.png", 512, 0.56, False),     # ناحیه امن آیکن‌های گرد/ماسک‌دار
        ("apple-touch-icon.png", 180, 0.72, False), # iOS خودش گوشه‌ها را گرد می‌کند
    ]
    for name, size, scale, rounded in jobs:
        make(logo, size, scale, rounded).save(out / name)
        print("OK:", name)
    print("تمام شد ->", out)


if __name__ == "__main__":
    main()
