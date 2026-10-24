#!/usr/bin/env python3
"""
همگام‌سازی گروه‌های قیمتی (جایگزین analyze_prices.py + map_prices.py)

کارها:
  1) گروه‌های موجود در _data/price_groups.yml را هرگز حذف یا تغییر نام نمی‌دهد.
  2) هر قیمتی که حداقل MIN_COUNT محصول داشته باشد و گروه ندارد، گروه جدید می‌گیرد
     با نام ثابت  p_<قیمت>  (مثلاً p_1298000).
  3) محصولی که قیمتش با یک گروه برابر است:  price_group را می‌نویسد و price را خالی می‌کند
     تا با تغییر عدد گروه، قیمت محصول هم عوض شود.

دست نمی‌زند به:
  - price: 0  (قیمت دستی ← تماس بگیرید)
  - out_of_stock: true  یا  price_group: "out_of_stock"
  - محصولاتی که قیمتشان عدد معتبر نیست

اجرا:
  python sync_price_groups.py          ← فقط گزارش (هیچ فایلی عوض نمی‌شود)
  python sync_price_groups.py --apply  ← اعمال تغییرات
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS_DIR = ROOT / "_products"
GROUPS_FILE = ROOT / "_data" / "price_groups.yml"
MIN_COUNT = 2  # حداقل تعداد محصول هم‌قیمت برای ساخت گروه جدید

APPLY = "--apply" in sys.argv

FM_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)
PRICE_RE = re.compile(r'^price:[ \t]*(.*?)[ \t]*$', re.M)


def field(fm, name):
    m = re.search(rf'^{name}:[ \t]*(.*?)[ \t]*$', fm, re.M)
    if not m:
        return None
    return m.group(1).strip().strip('"').strip("'")


def parse_price(raw):
    """'5,998,000' / 5998000 / '۵٬۹۹۸٬۰۰۰' -> int ؛ خالی یا نامعتبر -> None"""
    if raw is None:
        return None
    raw = raw.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))
    raw = re.sub(r"[,،٬\s]", "", raw)
    return int(raw) if raw.isdigit() else None


def load_groups():
    with GROUPS_FILE.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("groups", {})


def read_products():
    items = []
    for md in sorted(PRODUCTS_DIR.glob("*/*.md")):
        text = md.read_text(encoding="utf-8")
        m = FM_RE.match(text)
        if not m:
            continue
        fm = m.group(1)
        items.append({
            "path": md,
            "text": text,
            "fm": fm,
            "price_raw": field(fm, "price"),
            "price": parse_price(field(fm, "price")),
            "group": field(fm, "price_group"),
            "oos": (field(fm, "out_of_stock") or "").lower() == "true",
        })
    return items


def main():
    groups = load_groups()
    products = read_products()

    price_to_key = {
        g["price"]: k for k, g in groups.items()
        if not g.get("out_of_stock") and g.get("price")
    }

    # ---- ۱) گروه‌های جدید ----
    counts = defaultdict(int)
    for p in products:
        if p["oos"] or p["group"] == "out_of_stock":
            continue
        if p["price"] and p["price"] not in price_to_key:
            counts[p["price"]] += 1

    new_groups = {}
    for price, c in sorted(counts.items(), key=lambda x: -x[1]):
        if c >= MIN_COUNT:
            key = f"p_{price}"
            new_groups[key] = {"price": price, "count": c}
            price_to_key[price] = key

    print(f"گروه‌های موجود: {len(groups)}  |  گروه جدید: {len(new_groups)}")
    for k, g in new_groups.items():
        print(f"  + {k}: {g['price']:,} تومان ({g['count']} محصول)")

    # ---- ۲) اتصال محصولات ----
    changed, skipped = 0, []
    for p in products:
        name = p["path"].relative_to(PRODUCTS_DIR)
        if p["oos"] or p["group"] == "out_of_stock":
            continue
        if p["price_raw"] is not None and p["price"] == 0:
            continue  # قیمت دستی 0 ← تماس بگیرید
        if p["price"] is None:
            bad_price = p["price_raw"] not in (None, "")
            bad_group = p["group"] not in (None, "") and p["group"] not in groups
            if bad_price or bad_group:
                skipped.append((name, p["price_raw"], p["group"]))
            continue
        key = price_to_key.get(p["price"])
        if not key:
            continue  # قیمت یکتا؛ همان قیمت اختصاصی می‌ماند

        fm = p["fm"]
        fm = re.sub(r'^price_formatted:.*\n?', "", fm, flags=re.M)
        fm = re.sub(r'^price_group:.*\n?', "", fm, flags=re.M)
        fm = PRICE_RE.sub('price: ""\nprice_group: "%s"' % key, fm, count=1)
        if fm != p["fm"]:
            changed += 1
            print(f"  ✓ {name} -> {key}")
            if APPLY:
                p["path"].write_text(
                    p["text"].replace(p["fm"], fm, 1), encoding="utf-8")

    for name, pr, gr in skipped:
        print(f"  ⚠ بررسی دستی: {name}  price={pr!r}  price_group={gr!r}")

    # ---- ۳) نوشتن yml (فقط اضافه کردن) ----
    if APPLY and new_groups:
        with GROUPS_FILE.open("a", encoding="utf-8") as f:
            for k, g in new_groups.items():
                f.write(f'\n  {k}:\n    label: "{g["count"]} محصول هم‌قیمت"\n'
                        f'    price: {g["price"]}\n')

    mode = "اعمال شد" if APPLY else "فقط گزارش (برای اعمال: --apply)"
    print(f"\n{changed} محصول تغییر می‌کند/کرد — {mode}")


if __name__ == "__main__":
    main()
