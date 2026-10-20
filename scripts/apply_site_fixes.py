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
    print()
    print("🎉 همه‌چیز انجام شد." if all(r) else "⚠️ بعضی بخش‌ها انجام نشد؛ پیام‌های بالا را ببینید.")
    print("نسخه‌ی پشتیبان فایل‌های قبلی: scripts/_backup_site_fixes/")


if __name__ == "__main__":
    main()
