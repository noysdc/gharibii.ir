#!/usr/bin/env python3
"""تبدیل CSV محصولات به یک فایل .md برای هر محصول.

استفاده:
    python tools/csv_to_md.py products.csv            # خروجی در _products/
    python tools/csv_to_md.py products.csv --dry-run  # فقط نمایش، بدون نوشتن

اگر نام ستون‌های CSV شما فرق دارد، فقط لیست ALIASES را ویرایش کنید.
"""
import argparse, csv, json, re, sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse, unquote

ALIASES = {
    "title": ["title", "name", "نام", "عنوان", "نام محصول"],
    "price": ["price", "قیمت", "قیمت (تومان)"],
    "category": ["category", "دسته", "دسته بندی", "دسته‌بندی", "گروه"],
    "images": ["images", "image", "image_url", "تصاویر", "تصویر", "عکس", "عکس ها", "عکس‌ها"],
    "old_url": ["old_url", "url", "link", "لینک", "آدرس", "لینک قدیمی"],
    "description": ["description", "desc", "توضیحات", "شرح"],
    "slug": ["slug", "نامک"],
    "id": ["id", "code", "کد", "کد محصول"],
}
CATEGORY_WORDS = [("girls", ["دخترانه", "دختر", "girl"]), ("boys", ["پسرانه", "پسر", "boy"])]
PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def norm(s):
    return (s or "").replace("ي", "ی").replace("ك", "ک").replace("\u200c", " ").strip().lower()


def find_columns(headers):
    found = {}
    for key, names in ALIASES.items():
        for h in headers:
            if norm(h) in [norm(n) for n in names]:
                found[key] = h
                break
    return found


def slugify(text):
    text = (text or "").replace("ي", "ی").replace("ك", "ک").replace("\u200c", "-")
    text = re.sub(r"[^\w]+", "-", text, flags=re.UNICODE).strip("-_")
    return text[:80]


def to_category(v):
    n = norm(v)
    for cat, words in CATEGORY_WORDS:
        if any(norm(w) in n for w in words):
            return cat
    return "other"


def to_price(v):
    digits = re.sub(r"\D", "", (v or "").translate(PERSIAN_DIGITS))
    return int(digits) if digits else 0


def to_old_path(v):
    v = (v or "").strip()
    if not v:
        return ""
    path = unquote(urlparse(v).path) if "://" in v else v
    return path if path.startswith("/") else "/" + path


def split_images(v, prefix):
    parts = [p.strip() for p in re.split(r"[|\n;,]\s*", v or "") if p.strip()]
    return [p if "://" in p or p.startswith("/") else prefix + p for p in parts]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_file")
    ap.add_argument("--out", default="_products")
    ap.add_argument("--image-prefix", default="/assets/images/products/")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    with open(a.csv_file, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit("CSV خالی است.")
    cols = find_columns(rows[0].keys())
    print("ستون‌های شناخته‌شده:", {k: v for k, v in cols.items()})
    if "title" not in cols:
        sys.exit("ستون نام محصول پیدا نشد؛ ALIASES را ویرایش کنید.")

    used, today = set(), date.today().isoformat()
    for i, r in enumerate(rows, 1):
        get = lambda k: (r.get(cols[k]) or "").strip() if k in cols else ""
        title = get("title")
        if not title:
            continue
        cat = to_category(get("category"))
        slug = slugify(get("slug")) or slugify(title) or f"p-{get('id') or i}"
        while (cat, slug) in used:
            slug = f"{slug}-{get('id') or i}"
        used.add((cat, slug))

        fm = ["---", f"title: {json.dumps(title, ensure_ascii=False)}",
              f"price: {to_price(get('price'))}", f"category: {cat}", f"date: {today}"]
        imgs = split_images(get("images"), a.image_prefix)
        if imgs:
            fm.append("images:")
            fm += [f"  - {json.dumps(x, ensure_ascii=False)}" for x in imgs]
        old = to_old_path(get("old_url"))
        if old:
            fm += ["redirect_from:", f"  - {json.dumps(old, ensure_ascii=False)}"]
        fm.append("---")
        body = get("description") or ""

        path = Path(a.out) / cat / f"{slug}.md"
        if a.dry_run:
            print(path)
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(fm) + "\n" + body + "\n", encoding="utf-8")
    print("تمام شد:", len(rows), "ردیف پردازش شد.")


if __name__ == "__main__":
    main()
