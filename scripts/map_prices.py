#!/usr/bin/env python3
import re
from pathlib import Path
import yaml

HERE = Path(__file__).parent
ROOT = HERE.parent
PRODUCTS_DIR = ROOT / "_products"
PRICE_GROUPS_FILE = ROOT / "_data" / "price_groups.yml"

def format_currency(number):
    """تبدیل 4998000 به 4,998,000"""
    return f"{number:,}"

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
            
            # پاک کردن فیلدهای قبلی (اگه وجود دارن)
            content = re.sub(r'\nprice_group:.*', '', content)
            content = re.sub(r'\nprice_formatted:.*', '', content)
            
            # ساخت قیمت با کاما
            formatted_price = format_currency(current_price)
            
            # اضافه کردن فیلدهای جدید
            content = content.replace(
                f'price: {current_price}',
                f'price: {current_price}\nprice_group: "{tier_name}"\nprice_formatted: "{formatted_price}"'
            )
            md_file.write_text(content, encoding='utf-8')
            updated_count += 1
            print(f"  ✓ {md_file.name} -> {tier_name} ({formatted_price})")
            
        # اگه محصول توی گروه‌ها نبود، فقط قیمت فرمت شده رو بهش اضافه کن
        else:
            if 'price_formatted:' not in content:
                formatted_price = format_currency(current_price)
                content = content.replace(
                    f'price: {current_price}',
                    f'price: {current_price}\nprice_formatted: "{formatted_price}"'
                )
                md_file.write_text(content, encoding='utf-8')

    print(f"\n🎉 {updated_count} فایل محصول با گروه قیمتی آپدیت شدند.")

if __name__ == '__main__':
    main()