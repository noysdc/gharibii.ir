#!/usr/bin/env python3
import re
from pathlib import Path
from collections import Counter

HERE = Path(__file__).parent
ROOT = HERE.parent
PRODUCTS_DIR = ROOT / "_products"
OUTPUT_FILE = ROOT / "_data" / "price_groups.yml"

def main():
    print("📦 در حال تحلیل قیمت محصولات...\n")
    price_counts = Counter()
    
    # ۱. خواندن همه قیمت‌ها
    for md in PRODUCTS_DIR.glob("*/*.md"):
        content = md.read_text(encoding='utf-8')
        # پیدا کردن فیلد price
        match = re.search(r'^price:\s*(\d+)', content, re.M)
        if match:
            price = int(match.group(1))
            price_counts[price] += 1

    # ۲. پیدا کردن قیمت‌های پرتکرار (حداقل ۲ بار تکرار)
    popular_prices = [(p, c) for p, c in price_counts.most_common() if c >= 2]
    
    print("💰 قیمت‌های پرتکرار:")
    print("-" * 40)
    for p, c in popular_prices:
        print(f"  {p:>12,} تومان  ({c} محصول)")
    print("-" * 40)

    # ۳. ساخت فایل YAML
    yaml_lines = [
        "# گروه‌های قیمتی (به صورت خودکار ساخته شده)",
        "# هر محصول به یکی از این گروه‌ها اشاره می‌کنه",
        "",
        "groups:"
    ]

    for i, (p, c) in enumerate(popular_prices, 1):
        yaml_lines.append(f"  tier_{i}:")
        yaml_lines.append(f'    label: "{c} محصول هم‌قیمت"')
        yaml_lines.append(f"    price: {p}")
        yaml_lines.append("")

    # گروه ثابت «اتمام موجودی» (با اجرای مجدد اسکریپت پاک نشود)
    yaml_lines += [
        "  out_of_stock:",
        '    label: "اتمام موجودی"',
        "    out_of_stock: true",
        "    price: 0",
        "",
    ]

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text("\n".join(yaml_lines), encoding='utf-8')
    
    print(f"\n✅ فایل ساخته شد: {OUTPUT_FILE}")
    print(f"📊 {len(popular_prices)} گروه قیمتی ساخته شد.")

if __name__ == '__main__':
    main()