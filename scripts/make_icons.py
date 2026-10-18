"""
ساخت آیکون‌های اپ (PWA) و تصویرهای لودینگ آیفون از لوگوی فروشگاه، با همان تم هولوگرامی/کریستالی هدر سایت.

اجرا (از ریشهٔ پروژه):   python scripts/make_icons.py
نیازمندی:                pip install pillow numpy
ورودی:                   assets/images/gharibii-store-logo.webp
خروجی:                   assets/icons/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
                         assets/splash/ios-<عرض>x<ارتفاع>.jpg  (برای apple-touch-startup-image)
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# رنگ‌های هولوگرامی هدر (همان گرادیان .holo-logo در style.css)
HOLO = [(0.00, (232, 213, 255)), (0.18, (200, 230, 255)), (0.35, (212, 240, 232)),
        (0.52, (255, 232, 212)), (0.70, (255, 212, 232)), (0.88, (212, 232, 255)), (1.00, (232, 213, 255))]
# پس‌زمینهٔ آیکون: همان رنگ‌ها اما پررنگ‌تر تا حباب لوگو از آن جدا دیده شود
VIVID = [(0.00, (176, 150, 255)), (0.25, (120, 200, 255)), (0.50, (140, 235, 200)),
         (0.75, (255, 190, 160)), (1.00, (255, 150, 215))]
RING = [(255, 150, 220), (150, 220, 255), (180, 255, 220), (255, 240, 180), (220, 180, 255), (255, 150, 220)]


def find_root():
    for start in (Path(__file__).resolve().parent, Path.cwd()):
        for p in [start, *start.parents]:
            if (p / "assets").is_dir():
                return p
    raise SystemExit("پوشهٔ assets پیدا نشد؛ اسکریپت را از ریشهٔ پروژه اجرا کنید.")


def ramp(t, stops):
    """t: آرایهٔ 0..1  ->  آرایهٔ RGB با درون‌یابی بین stops"""
    xs = np.array([s[0] for s in stops])
    out = np.zeros(t.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, xs, [s[1][c] for s in stops])
    return out


def linear_bg(w, h, stops):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    t = (x / max(w - 1, 1) + y / max(h - 1, 1)) / 2          # زاویهٔ ۱۳۵ درجه
    return ramp(t, stops)


def blend(base, color, alpha):
    a = alpha[..., None]
    return base * (1 - a) + np.array(color, dtype=np.float32) * a


def radial(w, h, cx, cy, r, soft=1.0):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r
    return np.clip(1 - d, 0, 1) ** soft


def holo_bubble(D, logo):
    """حباب کریستالی هولوگرامی با لوگو؛ تصویر RGBA به اندازهٔ D×D"""
    y, x = np.mgrid[0:D, 0:D].astype(np.float32)
    cx = cy = (D - 1) / 2
    dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (D / 2)
    inside = np.clip((1 - dist) * (D / 2), 0, 1)             # لبهٔ نرم دایره

    base = linear_bg(D, D, HOLO)
    base = blend(base, (255, 255, 255), radial(D, D, D * .25, D * .20, D * .55, 1.3) * .95)
    base = blend(base, (200, 230, 255), radial(D, D, D * .78, D * .85, D * .55, 1.2) * .70)

    # حلقهٔ رنگی دور حباب (conic)
    ang = (np.arctan2(y - cy, x - cx) / (2 * math.pi)) % 1.0
    ring_col = ramp(ang, [(i / 5, c) for i, c in enumerate(RING)])
    ring_a = np.clip((dist - .66) / .06, 0, 1) * np.clip((.97 - dist) / .04, 0, 1) * .55
    base = base * (1 - ring_a[..., None]) + ring_col * ring_a[..., None]

    # برق شیشه‌ای مورب
    sweep = np.exp(-(((x + y) / (2 * D) - .38) / .07) ** 2) * .55
    base = blend(base, (255, 255, 255), sweep * (dist < .96))

    # سایهٔ داخلی پایین/لبه برای عمق
    shade = np.clip((dist - .80) / .20, 0, 1) ** 2 * .22
    base = blend(base, (168, 85, 247), shade)

    rgba = np.dstack([np.clip(base, 0, 255), inside * 255]).astype(np.uint8)
    bubble = Image.fromarray(rgba, "RGBA")

    # لوگو: عرض ۷۸٪ حباب با سایهٔ ملایم، مثل هدر
    lg = logo.copy()
    k = (D * .80) / max(lg.size)                              # بزرگ/کوچک‌کردن تا ۸۰٪ حباب
    lg = lg.resize((max(1, int(lg.width * k)), max(1, int(lg.height * k))), Image.LANCZOS)
    pos = ((D - lg.width) // 2, (D - lg.height) // 2)
    sh = Image.new("RGBA", bubble.size, (0, 0, 0, 0))
    sh_l = Image.new("RGBA", lg.size, (10, 102, 112, 90))
    sh.paste(sh_l, (pos[0], pos[1] + D // 90), lg.split()[-1])
    sh = sh.filter(ImageFilter.GaussianBlur(D / 120))
    bubble = Image.alpha_composite(bubble, sh)
    bubble.alpha_composite(lg, pos)

    # براق بالا-چپ روی همه چیز
    gl = radial(D, D, D * .30, D * .22, D * .42, 1.6) * .42 * (dist < .97)
    glow = np.dstack([np.full((D, D), 255), np.full((D, D), 255), np.full((D, D), 255), gl * 255]).astype(np.uint8)
    bubble = Image.alpha_composite(bubble, Image.fromarray(glow, "RGBA"))
    return bubble


def halo(size, d, cx, cy, strength=1.0):
    """هالهٔ بنفش/صورتی دور حباب (همان box-shadow درخشان لوگوی هدر)"""
    w, h = size
    a = radial(w, h, cx, cy, d * .78, 1.8) * .55 * strength
    layer = np.zeros((h, w, 4), dtype=np.uint8)
    layer[..., 0], layer[..., 1], layer[..., 2] = 240, 170, 255
    layer[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(layer, "RGBA")


def icon(logo, size, bubble_ratio, rounded):
    S = size * 2
    bg = linear_bg(S, S, VIVID)
    bg = blend(bg, (255, 255, 255), radial(S, S, S * .18, S * .12, S * .70, 1.4) * .55)
    bg = blend(bg, (90, 200, 255), radial(S, S, S * .88, S * .92, S * .70, 1.4) * .40)
    im = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    D = int(S * bubble_ratio)
    c = S / 2
    im = Image.alpha_composite(im, halo((S, S), D, c, c))
    b = holo_bubble(D, logo)
    im.alpha_composite(b, ((S - D) // 2, (S - D) // 2))
    if rounded:
        m = Image.new("L", (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * .22), fill=255)
        im.putalpha(m)
    else:
        im = im.convert("RGB").convert("RGBA")
    return im.resize((size, size), Image.LANCZOS)


def splash(logo, w, h, scale):
    """تصویر لودینگ آیفون: زمینهٔ روشن سایت + حباب هولوگرامی + خط هولوگرامی (متن را خود سایت نشان می‌دهد)"""
    W, H = w, h
    bg = np.zeros((H, W, 3), dtype=np.float32)
    bg[:] = (243, 247, 248)                                     # --bg سایت
    m = max(W, H)
    bg = blend(bg, (255, 212, 232), radial(W, H, W * .92, -H * .02, m * .55, 1.0) * .75)
    bg = blend(bg, (200, 230, 255), radial(W, H, W * .04, H * .16, m * .55, 1.0) * .75)
    bg = blend(bg, (232, 213, 255), radial(W, H, W * .86, H * .62, m * .50, 1.0) * .60)
    bg = blend(bg, (212, 240, 232), radial(W, H, W * .10, H * .92, m * .50, 1.0) * .60)
    im = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

    D = int(min(W, H) * .42)
    cx, cy = W // 2, int(H * .42)
    im = Image.alpha_composite(im, halo((W, H), D, cx, cy, .9))
    im.alpha_composite(holo_bubble(D, logo), (cx - D // 2, cy - D // 2))

    # خط هولوگرامی زیر لوگو (مثل divider هدر)
    lw = int(W * .62)
    lh = max(4, int(scale * 3))
    xs = np.linspace(0, 1, lw, dtype=np.float32)
    col = ramp(xs, [(0, (255, 255, 255)), (.15, (255, 184, 232)), (.30, (200, 184, 255)), (.50, (184, 224, 255)),
                    (.70, (184, 255, 216)), (.85, (255, 232, 184)), (1, (255, 255, 255))])
    fade = np.clip(np.minimum(xs, 1 - xs) / .12, 0, 1)
    bar = np.zeros((lh, lw, 4), dtype=np.uint8)
    bar[..., :3] = col[None, :, :].astype(np.uint8)
    bar[..., 3] = (fade[None, :] * 255).astype(np.uint8)
    bar_im = Image.fromarray(bar, "RGBA")
    gl = bar_im.filter(ImageFilter.GaussianBlur(lh * 2))
    y0 = cy + D // 2 + int(H * .035)
    im.alpha_composite(gl, ((W - lw) // 2, y0))
    im.alpha_composite(bar_im, ((W - lw) // 2, y0))
    return im.convert("RGB")


# اندازهٔ تصویر لودینگ آیفون‌ها: (عرض نقطه، ارتفاع نقطه، ضریب پیکسل)
IOS = [(440, 956, 3), (430, 932, 3), (428, 926, 3), (414, 896, 3), (414, 896, 2), (414, 736, 3),
       (402, 874, 3), (393, 852, 3), (390, 844, 3), (375, 812, 3), (375, 667, 2), (320, 568, 2)]


def main():
    root = find_root()
    logo = None
    for n in ("gharibii-store-logo.webp", "gharibii-store-logo.png"):
        f = root / "assets" / "images" / n
        if f.exists():
            logo = Image.open(f).convert("RGBA")
            print("لوگو:", f)
            break
    if logo is None:
        raise SystemExit("لوگو پیدا نشد: assets/images/gharibii-store-logo.webp")
    # حاشیهٔ خالی دور لوگو را می‌بُریم تا بزرگ‌تر و واضح‌تر دیده شود
    bbox = logo.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        logo = logo.crop(bbox)

    out = root / "assets" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for name, size, ratio, rounded in [("icon-192.png", 192, .80, True), ("icon-512.png", 512, .80, True),
                                       ("maskable-512.png", 512, .64, False),
                                       ("apple-touch-icon.png", 180, .80, False)]:
        icon(logo, size, ratio, rounded).save(out / name, optimize=True)
        print("OK", name)

    sdir = root / "assets" / "splash"
    sdir.mkdir(parents=True, exist_ok=True)
    seen = set()
    for w, h, r in IOS:
        W, H = w * r, h * r
        if (W, H) in seen:
            continue
        seen.add((W, H))
        im = splash(logo, W, H, r)
        # JPEG با کیفیت بالا: گرادیان نرم می‌ماند و حجم هر تصویر کم است
        im.save(sdir / f"ios-{W}x{H}.jpg", quality=90, subsampling=0, optimize=True, progressive=True)
        print("OK", f"ios-{W}x{H}.jpg")
    print("تمام شد.")


if __name__ == "__main__":
    main()
