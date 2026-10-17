#!/usr/bin/env python3
import re
from pathlib import Path
import yaml

HERE = Path(__file__).parent
ROOT = HERE.parent
PRODUCTS_DIR = ROOT / "_products"
PRICE_GROUPS_FILE = ROOT / "_data" / "price_groups.yml"

def main():
    # ۱. خواندن گروه‌های قیمتی
    with PRICE_GROUPS_FILE.open(encoding='utf-8') as f:
        data = yaml.safe_load(f)
        groups = data.get('groups', {})

    # ساخت نقشه: قیمت -> اسم گروه
    price_to_tier = {}
    for tier_name, tier_info in groups.items():
        price_to_tier[tier_info['price']] = tier_name

    print(f"📦 {len(price_to_tier)} گروه قیمتی بارگذاری شد.\n")
    
    updated_count = 0

    # ۲. آپدیت فایل‌های محصولات
    for md_file in PRODUCTS_DIR.glob("*/*.md"):
        content = md_file.read_text(encoding='utf-8')
        
        # پیدا کردن قیمت فعلی
        price_match = re.search(r'^price:\s*(\d+)', content, re.M)
        if not price_match:
            continue
            
        current_price = int(price_match.group(1))
        
        # اگه این قیمت توی گروه‌های ما بود
        if current_price in price_to_tier:
            tier_name = price_to_tier[current_price]
            
            # اضافه کردن فیلد price_group و پاک کردن price اصلی (یا نگه داشتنش به عنوان فال‌بک)
            # برای اینکه قیمت همیشه از روی گروه خونده بشه، فیلد price_group رو اضافه میکنیم
            if 'price_group:' not in content:
                content = content.replace(
                    f'price: {current_price}',
                    f'price: {current_price}\nprice_group: "{tier_name}"'
                )
                md_file.write_text(content, encoding='utf-8')
                updated_count += 1
                print(f"  ✓ {md_file.name} -> {tier_name}")

    print(f"\n🎉 {updated_count} فایل محصول آپدیت شدند.")

if __name__ == '__main__':
    main()