#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_site_fixes.py — اعمال اصلاحات سایت (یک‌بار اجرا شود؛ اجرای دوباره بی‌خطر است)

  ۱) _includes/footer.html  : لینک‌های اینماد و ساماندهی (لینک واقعی + referrerpolicy)
  ۲) _layouts/default.html  : پیش‌نمایش لینک (عنوان/توضیح/عکس) شفاف و کنترل‌شده، لینک extra.css،
                              و نوار دسته‌بندی پایین موبایل
  ۳) فایل‌های جدید           : _includes/mobile-tabbar.html ، assets/css/extra.css ، assets/images/og-card.jpg

قبل از هر تغییر از فایل‌ها نسخه‌ی پشتیبان در scripts/_backup_site_fixes/ گذاشته می‌شود.
"""
import re
import shutil
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PAYLOAD = HERE / "site_fixes_payload"      # فایل‌های جدید کنار همین اسکریپت
BACKUP = HERE / "_backup_site_fixes"

NEW_FILES = [
    "_includes/mobile-tabbar.html",
    "assets/css/extra.css",
    "assets/js/extra.js",
    "assets/images/og-card.jpg",
    "_includes/thumb.html",
]

FOOTER_TRUST = '''<div class="trust-boxes">
      <!-- نماد اعتماد الکترونیکی (اینماد) — فقط روی دامنهٔ ثبت‌شده (gharibii.ir) تأیید نشان می‌دهد -->
      <a class="trust-box" href="https://trustseal.enamad.ir/?id=438091&amp;Code=1gtpBwEpys6lwvtIuiewl9QKeUqshfKJ" target="_blank" rel="noopener" referrerpolicy="origin" aria-label="نماد اعتماد الکترونیکی (اینماد)">
        <img src="{{ '/assets/images/trust/enamad.png' | relative_url }}" alt="نماد اعتماد الکترونیکی" width="96" height="96" loading="lazy" decoding="async">
      </a>

      <!-- ساماندهی رسانه‌های دیجیتال — فقط روی دامنهٔ ثبت‌شده تأیید نشان می‌دهد -->
      <a class="trust-box" href="https://logo.samandehi.ir/Verify.aspx?id=364139&amp;p=xlaogvkaaodsrfthxlaopfvl" target="_blank" rel="noopener" referrerpolicy="origin" aria-label="ساماندهی رسانه‌های دیجیتال">
        <img src="{{ '/assets/images/trust/samandehi.png' | relative_url }}" alt="ساماندهی رسانه‌های دیجیتال" width="96" height="96" loading="lazy" decoding="async">
      </a>
    </div>
'''

HEAD_BLOCK = '''{%- comment -%}
  ===== پیش‌نمایش لینک (واتساپ / تلگرام / گوگل) =====
  عنوان : «عنوان صفحه | فروشگاه غریبی کیش»
  توضیح : description همان صفحه (فرانت‌متر)؛ برای محصول: متن توضیحات، و اگر خالی/نمونه بود یک جملهٔ خودکار با قیمت
  عکس   : محصول → عکس اول خودش ؛ بقیهٔ صفحه‌ها → /assets/images/og-card.jpg
{%- endcomment -%}
  {%- assign pv_title = site.title -%}
  {%- if page.title -%}{%- assign pv_title = page.title | append: ' | ' | append: site.title -%}{%- endif -%}
  {%- assign pv_desc = page.description | default: '' -%}
  {%- if pv_desc == '' and page.layout == 'product' -%}
    {%- assign pv_body = page.content | strip_html | strip_newlines | normalize_whitespace | strip -%}
    {%- assign pv_ok = false -%}
    {%- if pv_body.size > 30 -%}{%- assign pv_ok = true -%}{%- endif -%}
    {%- if pv_body contains 'توضیحات محصول را اینجا' -%}{%- assign pv_ok = false -%}{%- endif -%}
    {%- if pv_ok -%}
      {%- assign pv_desc = pv_body | truncate: 155 -%}
    {%- else -%}
      {%- capture pv_price_html -%}{%- include price.html product=page -%}{%- endcapture -%}
      {%- assign pv_price = pv_price_html | split: '</span>' | first | strip_html | strip -%}
      {%- capture pv_desc -%}{{ page.title }} — {{ pv_price }} | سفارش در واتساپ یا تماس تلفنی، فروشگاه غریبی کیش{%- endcapture -%}
    {%- endif -%}
  {%- endif -%}
  {%- if pv_desc == '' -%}{%- assign pv_desc = site.description -%}{%- endif -%}
  {%- assign pv_img = page.images[0] -%}
  {%- if pv_img -%}
    {%- capture pv_img_rel -%}{% include img.html src=pv_img %}{%- endcapture -%}
    {%- assign pv_img_url = pv_img_rel | strip | prepend: site.url -%}
    {%- assign pv_img_w = 900 -%}{%- assign pv_img_h = 1200 -%}
  {%- else -%}
    {%- assign pv_img_url = '/assets/images/og-card.jpg' | absolute_url -%}
    {%- assign pv_img_w = 1200 -%}{%- assign pv_img_h = 630 -%}
  {%- endif -%}
  <title>{{ pv_title | escape }}</title>
  <meta name="description" content="{{ pv_desc | strip | escape }}">
  <link rel="canonical" href="{{ page.url | absolute_url }}">
  <meta property="og:locale" content="fa_IR">
  <meta property="og:site_name" content="{{ site.title | escape }}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{{ pv_title | escape }}">
  <meta property="og:description" content="{{ pv_desc | strip | escape }}">
  <meta property="og:url" content="{{ page.url | absolute_url }}">
  <meta property="og:image" content="{{ pv_img_url }}">
  <meta property="og:image:width" content="{{ pv_img_w }}">
  <meta property="og:image:height" content="{{ pv_img_h }}">
  <meta property="og:image:alt" content="{{ page.title | default: site.title | escape }}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{{ pv_title | escape }}">
  <meta name="twitter:description" content="{{ pv_desc | strip | escape }}">
  <meta name="twitter:image" content="{{ pv_img_url }}">
'''


def read(p):
    with open(p, "r", encoding="utf-8", newline="") as f:
        return f.read()


def write(p, s):
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def backup(p):
    BACKUP.mkdir(exist_ok=True)
    dst = BACKUP / p.relative_to(ROOT).as_posix().replace("/", "__")
    if not dst.exists():
        shutil.copy2(p, dst)


def eol_of(text):
    return "\r\n" if "\r\n" in text else "\n"


def fix_footer():
    p = ROOT / "_includes" / "footer.html"
    t = read(p)
    if 'class="trust-box" href="https://trustseal.enamad.ir' in t:
        print("• footer.html: قبلاً اصلاح شده؛ رد شد.")
        return True
    e = eol_of(t)
    n = t.replace("\r\n", "\n")
    pat = re.compile(r'<div class="trust-boxes">.*?</div>\s*\n(?=\s*<div class="holo-divider")', re.S)
    if not pat.search(n):
        print("✗ footer.html: بلوک trust-boxes پیدا نشد (فایل تغییر کرده؟). دستی ویرایش کنید.")
        return False
    backup(p)
    n = pat.sub(lambda m: FOOTER_TRUST, n, count=1)
    write(p, n.replace("\n", e))
    print("✓ footer.html: لینک اینماد/ساماندهی اصلاح شد.")
    return True


def fix_default():
    p = ROOT / "_layouts" / "default.html"
    t = read(p)
    if "pv_title" in t and "mobile-tabbar.html" in t and "extra.css" in t:
        print("• default.html: قبلاً اصلاح شده؛ رد شد.")
        return True
    e = eol_of(t)
    n = t.replace("\r\n", "\n")

    # ۱) از {% seo %} تا قبل از لینک style.css
    pat = re.compile(r"[ \t]*\{%\s*seo\s*%\}.*?(?=[ \t]*<link rel=\"stylesheet\" href=\"\{\{ '/assets/css/style\.css' \| relative_url \}\}\">)", re.S)
    if not pat.search(n):
        print("✗ default.html: بخش {% seo %} / og:image پیدا نشد. دستی ویرایش کنید.")
        return False
    backup(p)
    n = pat.sub(lambda m: HEAD_BLOCK, n, count=1)

    # ۲) لینک extra.css بعد از style.css
    css_line = "<link rel=\"stylesheet\" href=\"{{ '/assets/css/style.css' | relative_url }}\">"
    if "extra.css" not in n:
        n = n.replace(css_line, css_line + "\n  <link rel=\"stylesheet\" href=\"{{ '/assets/css/extra.css' | relative_url }}\">", 1)

    # ۳) نوار پایین موبایل قبل از main.js
    js_line = "<script src=\"{{ '/assets/js/main.js' | relative_url }}\" defer></script>"
    if "mobile-tabbar.html" not in n:
        if js_line not in n:
            print("✗ default.html: خط main.js پیدا نشد.")
            return False
        n = n.replace(js_line, "{% include mobile-tabbar.html %}\n  " + js_line, 1)

    write(p, n.replace("\n", e))
    print("✓ default.html: پیش‌نمایش لینک + extra.css + نوار پایین موبایل اضافه شد.")
    return True


def copy_new_files():
    """فایل‌های جدید را کپی می‌کند. اگر کنار اسکریپت نبودند ولی از قبل در جای خودشان هستند، مشکلی نیست."""
    ok = True
    for rel in NEW_FILES:
        src = PAYLOAD / rel
        dst = ROOT / rel
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            print(f"✓ {rel}")
        elif dst.exists():
            print(f"• {rel}: از قبل در جای خودش هست.")
        else:
            print(f"✗ فایل {rel} پیدا نشد (نه در site_fixes_payload و نه در سایت).")
            ok = False
    return ok


def ensure_extra_js():
    """لینک extra.js را (اگر نبود) بعد از main.js در default.html می‌گذارد."""
    p = ROOT / "_layouts" / "default.html"
    t = read(p)
    if "extra.js" in t:
        print("• default.html: extra.js از قبل لینک شده.")
        return True
    e = eol_of(t)
    n = t.replace("\r\n", "\n")
    js_line = "<script src=\"{{ '/assets/js/main.js' | relative_url }}\" defer></script>"
    if js_line not in n:
        print("✗ default.html: خط main.js پیدا نشد؛ extra.js را دستی اضافه کنید.")
        return False
    backup(p)
    n = n.replace(js_line, js_line + "\n  <script src=\"{{ '/assets/js/extra.js' | relative_url }}\" defer></script>", 1)
    write(p, n.replace("\n", e))
    print("✓ default.html: extra.js اضافه شد.")
    return True


def fix_categories():
    """
    md هایی که category: wands-crowns دارند ولی سایت (صفحه‌ی اصلی، هدر، صفحه‌ی دسته) «crown-wand» می‌خواند،
    اصلاح می‌شوند تا دستهٔ «تاج و عصا» نمایش داده شود. اسکریپت‌های ساخت md هم اصلاح می‌شوند.
    """
    md_root = ROOT / "_products"
    pat = re.compile(r"^(category:[ \t]*)([\"']?)wands-crowns\2([ \t]*)(?=\r?$)", re.M)
    changed = 0
    for md in sorted(md_root.rglob("*.md")):
        try:
            t = read(md)
        except Exception:
            continue
        if not t.startswith("---"):
            continue
        t2, n = pat.subn(lambda m: m.group(1) + "crown-wand" + m.group(3), t, count=1)
        if n:
            write(md, t2)
            changed += 1
    if changed:
        print(f"✓ دستهٔ {changed} محصول از wands-crowns به crown-wand اصلاح شد.")
    else:
        print("• هیچ md ای با category: wands-crowns نبود (قبلاً اصلاح شده).")
    for name in ("build_products.py", "organize_images_final.py"):
        sp = HERE / name
        if sp.exists():
            t = read(sp)
            if 'return "wands-crowns"' in t:
                write(sp, t.replace('return "wands-crowns"', 'return "crown-wand"'))
                print(f"✓ {name}: دستهٔ پیش‌فرض تاج و عصا به crown-wand اصلاح شد.")
    return True


CAT_ICONS = {
    "girls": '<path d="M9 3l3 3.5L15 3"/><path d="M10 7l-1 4.5-4.5 9.5h15L15 11.5 14 7"/><path d="M9 11.5h6"/>',
    "boys": '<path d="M8 3L3 6l2 4 3-1v12h8V9l3 1 2-4-5-3c-1 2-7 2-8 0z"/>',
    "bags-shoes": '<path d="M6 8h12l1 13H5z"/><path d="M9 8V6.5a3 3 0 016 0V8"/>',
    "crown-wand": '<path d="M3 18L4 7l5 5 3-7 3 7 5-5 1 11z"/><path d="M3 21h18"/>',
    "accessories": '<path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.8 6.4 20.1l1.4-6.3L3 9.5l6.4-.6z"/>',
}


def fix_header_icons():
    """به هر دکمهٔ دستهٔ هدر یک آیکون SVG (همان آیکون‌های نوار پایین موبایل) اضافه می‌کند."""
    p = ROOT / "_includes" / "header.html"
    t = read(p)
    if 'class="cat-ico"' in t:
        if 'class="cat-ico" width=' in t:
            print("• header.html: آیکون‌ها از قبل اضافه شده‌اند.")
            return True
        # نسخهٔ قبلی بدون اندازه بود؛ اندازهٔ صریح اضافه می‌شود تا حتی با CSS کش‌شده هم بزرگ نشوند
        backup(p)
        write(p, t.replace('<svg class="cat-ico" viewBox=', '<svg class="cat-ico" width="18" height="18" viewBox='))
        print("✓ header.html: اندازهٔ صریح (۱۸px) به آیکون‌ها اضافه شد.")
        return True
    e = eol_of(t)
    n = t.replace("\r\n", "\n")
    done = 0
    for slug, paths in CAT_ICONS.items():
        pat = re.compile(r"(<a href=\"\{\{ '/" + re.escape(slug) + r"/' \| relative_url \}\}\"[^>]*>)(?!<svg)")
        svg = '<svg class="cat-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">' + paths + "</svg>"
        n, c = pat.subn(lambda m: m.group(1) + svg, n, count=1)
        done += c
    if done < 5:
        print(f"✗ header.html: فقط {done} از ۵ دکمه پیدا شد؛ فایل تغییر کرده؟ چیزی نوشته نشد.")
        return False
    backup(p)
    write(p, n.replace("\n", e))
    print("✓ header.html: آیکون به ۵ دکمهٔ دسته اضافه شد.")
    return True


def bust_cache():
    """به CSS/JS در default.html یک ?v=زمان-بیلد می‌چسباند تا بعد از هر انتشار، مرورگر/سرویس‌ورکر نسخهٔ قبلی را نشان ندهد."""
    p = ROOT / "_layouts" / "default.html"
    t = read(p)
    e = eol_of(t)
    n = t.replace("\r\n", "\n")
    pat = re.compile(r"(\{\{ '/assets/(?:css|js)/[\w.-]+\.(?:css|js)' \| relative_url \}\})(?=\")")
    n2, c = pat.subn(lambda m: m.group(1) + "?v={{ site.time | date: '%Y%m%d%H%M%S' }}", n)
    if c == 0:
        print("• default.html: نسخه‌گذاری CSS/JS از قبل انجام شده (یا لینکی پیدا نشد).")
        return True
    backup(p)
    write(p, n2.replace("\n", e))
    print(f"✓ default.html: {c} فایل CSS/JS نسخه‌دار شد (مشکل «تغییر را نمی‌بینم» برطرف می‌شود).")
    return True


CONFIG_BLOCK = """

# ---------- روش‌های دیگر سفارش (برای کسانی که واتساپ ندارند) ----------
# هر کدام را خالی بگذارید، دکمه‌اش در سایت نمایش داده نمی‌شود.
order_telegram: "gharibii_ir"      # آیدی تلگرام بدون @
order_bale: ""                     # آیدی بله بدون @ ، مثلاً gharibii  ← لینک: https://ble.ir/gharibii
order_instagram: "storegaribi16"   # آیدی اینستاگرام بدون @ (دایرکت)
"""

CHANNELS_JSON = (
    '<script type="application/json" id="order-channels-data">'
    '{"telegram":{{ site.order_telegram | default: "" | jsonify }},'
    '"bale":{{ site.order_bale | default: "" | jsonify }},'
    '"instagram":{{ site.order_instagram | default: "" | jsonify }},'
    '"phones":[{% for s in site.whatsapp_sellers %}{"label":{{ s.name | jsonify }},"number":{{ s.number | jsonify }}}'
    '{% unless forloop.last %},{% endunless %}{% endfor %}'
    '{% if site.phone_e164 %}{% if site.whatsapp_sellers %},{% endif %}'
    '{"label":"تلفن فروشگاه","number":{{ site.phone_e164 | jsonify }},"display":{{ site.phone_display | jsonify }}}{% endif %}]}'
    '</script>'
)


def fix_order_channels():
    """روش‌های دیگر سفارش (بله، تلگرام، تماس، ...): تنظیمات در _config.yml و داده‌ی JSON در default.html."""
    ok = True
    cp = ROOT / "_config.yml"
    t = read(cp)
    if "order_telegram:" in t:
        print("• _config.yml: تنظیمات روش‌های سفارش از قبل هست.")
    else:
        backup(cp)
        e = eol_of(t)
        write(cp, t.rstrip("\r\n") + CONFIG_BLOCK.replace("\n", e) + e)
        print("✓ _config.yml: بخش «روش‌های دیگر سفارش» اضافه شد (order_bale را پر کنید).")
    dp = ROOT / "_layouts" / "default.html"
    d = read(dp)
    if 'id="order-channels-data"' in d:
        print("• default.html: داده‌ی روش‌های سفارش از قبل هست.")
        return ok
    e = eol_of(d)
    n = d.replace("\r\n", "\n")
    m = re.search(r'^[ \t]*<script type="application/json" id="wa-sellers-data">.*$', n, re.M)
    if not m:
        print("✗ default.html: خط wa-sellers-data پیدا نشد؛ داده‌ی سفارش اضافه نشد.")
        return False
    backup(dp)
    n = n[:m.end()] + "\n  " + CHANNELS_JSON + n[m.end():]
    write(dp, n.replace("\n", e))
    print("✓ default.html: داده‌ی روش‌های سفارش اضافه شد.")
    return ok


def _thumb_coverage():
    base = ROOT / "assets" / "images" / "products"
    if not base.exists():
        return 0, 0
    srcs = [p for p in base.rglob("*.webp") if not p.stem.endswith("-t")]
    have = sum(1 for p in srcs if p.with_name(p.stem + "-t.webp").exists())
    return have, len(srcs)


def speed_pack():
    """کارت‌ها، نوار تصاویر، صفحهٔ اصلی و جستجو را از تصویر کوچک (-t.webp) بخوانند. فقط اگر تامبنیل‌ها ساخته شده باشند."""
    have, total = _thumb_coverage()
    if total == 0 or have < total * 0.98:
        print(f"⏭️ بهینه‌سازی تصاویر انجام نشد: فقط {have} از {total} تامبنیل ساخته شده. اول RUN_THUMBS.bat را اجرا کنید، بعد دوباره این اسکریپت.")
        return True
    def FB(var):
        return "onerror=\"this.onerror=null;this.src='{% include img.html src=" + var + " %}'\""
    jobs = [
        ("_includes/product-card.html",
         [('<img src="{% include img.html src=im %}"',
           '<img src="{% include thumb.html src=im %}" ' + FB("im") + ' decoding="async"')]),
        ("_layouts/product.html",
         [('<img src="{% include img.html src=im %}" alt="" loading="lazy"',
           '<img src="{% include thumb.html src=im %}" ' + FB("im") + ' alt="" loading="lazy" decoding="async"'),
          ('<img id="main-img" src=', '<img id="main-img" fetchpriority="high" src=')]),
        ("index.html",
         [('<img src="{% include img.html src=gim %}"', '<img src="{% include thumb.html src=gim %}" ' + FB("gim")),
          ('<img src="{% include img.html src=bim %}"', '<img src="{% include thumb.html src=bim %}" ' + FB("bim")),
          ('<img src="{% include img.html src=cover %}"', '<img src="{% include thumb.html src=cover %}" ' + FB("cover"))]),
        ("search.json",
         [("{% capture u %}{% include img.html src=im %}{% endcapture %}", "{% capture u %}{% include thumb.html src=im %}{% endcapture %}")]),
    ]
    all_ok = True
    for rel, reps in jobs:
        p = ROOT / rel
        if not p.exists():
            print(f"✗ {rel}: پیدا نشد.")
            all_ok = False
            continue
        t = read(p)
        e = eol_of(t)
        n = t.replace("\r\n", "\n")
        changed = 0
        for old, new in reps:
            if new in n:
                continue
            if old in n:
                n = n.replace(old, new)
                changed += 1
            else:
                print(f"✗ {rel}: بخش «{old[:45]}…» پیدا نشد (فایل تغییر کرده؟).")
                all_ok = False
        if changed:
            backup(p)
            write(p, n.replace("\n", e))
            print(f"✓ {rel}: {changed} تغییر.")
        else:
            print(f"• {rel}: از قبل بهینه است (یا تغییری لازم نبود).")
    return all_ok


def main():
    print("=" * 60)
    print("  اعمال اصلاحات سایت")
    print("=" * 60)
    if not (ROOT / "_layouts" / "default.html").exists():
        print(f"✗ ریشهٔ سایت پیدا نشد: {ROOT}")
        return
    files_ok = copy_new_files()
    if not files_ok:
        # بدون این فایل‌ها نباید default.html را عوض کرد (include ناموجود، ساخت سایت را خراب می‌کند)
        print("\n⛔ چون فایل‌های بالا نیستند، default.html تغییر داده نشد. پوشهٔ site_fixes_payload را کنار اسکریپت بگذارید و دوباره اجرا کنید.")
        r = [False, fix_footer(), False]
    else:
        r = [files_ok, fix_footer(), fix_default(), ensure_extra_js()]
    r.append(fix_categories())
    r.append(fix_header_icons())
    r.append(bust_cache())
    r.append(fix_order_channels())
    r.append(speed_pack())
    print()
    print("🎉 همه‌چیز انجام شد." if all(r) else "⚠️ بعضی بخش‌ها انجام نشد؛ پیام‌های بالا را ببینید.")
    print("نسخه‌ی پشتیبان فایل‌های قبلی: scripts/_backup_site_fixes/")


if __name__ == "__main__":
    main()
