#!/usr/bin/env python3
import os
import re
from pathlib import Path

# ═══════════════════════════════════════════
# تنظیمات مسیرها
# ═══════════════════════════════════════════
HERE = Path(__file__).parent
ROOT = HERE.parent

# مسیر دقیق پوشه عکس‌های شما
IMAGES_SRC = Path(r"C:\Users\unes shojaei\Documents\GitHub\gharibii.ir\assets\images\raw\01")

# پوشه‌ای که فایل‌های md در آن ساخته شده‌اند
PRODUCTS_MD_DIR = ROOT / "_products"

# لینک پایه‌ای که در سایت استفاده می‌شود (از فایل build_products.py شما)
IMG_URL_BASE = "/assets/images/raw/01"

# ═══════════════════════════════════════════

def clean_folder_name(folder):
    """
    پاکسازی نام فولدر برای تطبیق دقیق با نام فایل md.
    مثلا: pirate-hat (1) -> pirate-hat
    """
    name = re.sub(r'\s*\(\d+\)$', '', folder).strip()
    return name

def main():
    if not IMAGES_SRC.exists():
        print(f"❌ پوشه عکس‌ها پیدا نشد در مسیر: {IMAGES_SRC}")
        return

    if not PRODUCTS_MD_DIR.exists():
        print(f"❌ پوشه محصولات پیدا نشد در مسیر: {PRODUCTS_MD_DIR}")
        print("ابتدا اسکریپت build_products.py را اجرا کنید.")
        return

    # ۱. پیدا کردن همه فایل‌های md
    md_files = list(PRODUCTS_MD_DIR.rglob("*.md"))
    print(f"✅ {len(md_files)} فایل محصول پیدا شد.")

    # ۲. پیدا کردن پوشه‌های عکس
    image_folders = [d for d in IMAGES_SRC.iterdir() if d.is_dir()]
    print(f"✅ {len(image_folders)} پوشه عکس پیدا شد.\n")
    print("-" * 50)

    linked_count = 0
    unmatched_folders = []
    missing_folders = []

    # ایجاد یک دیکشنری از فولدرها برای جستجوی سریع‌تر
    # کلید: نام تمیز شده (مثل pirate-hat) | مقدار: نام واقعی (مثل pirate-hat (1))
    folders_dict = {clean_folder_name(f.name): f.name for f in image_folders}

    for md_path in md_files:
        content = md_path.read_text(encoding='utf-8')
        
        # استخراج slug از فایل md
        slug_match = re.search(r'slug:\s*"(.*?)"', content)
        if not slug_match:
            continue
        slug = slug_match.group(1)

        # آیا پوشه‌ای با این نام برای این محصول وجود دارد؟
        if slug in folders_dict:
            actual_folder_name = folders_dict[slug]
            folder_path = IMAGES_SRC / actual_folder_name
            
            # لیست کردن عکس‌های داخل پوشه
            images = sorted([
                f.name for f in folder_path.iterdir() 
                if f.is_file() and f.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
            ])
            
            if not images:
                print(f"⚠️ پوشه {actual_folder_name} خالی است.")
                continue

            # ساخت مسیرهای وب برای فرانت‌متر
            web_paths = [f"{IMG_URL_BASE}/{actual_folder_name}/{img}" for img in images]
            
            # ساخت متن YAML
            yaml_images = "images:\n" + "\n".join([f"  - {p}" for p in web_paths])
            
            # بررسی اینکه آیا از قبل فیلد images دارد یا نه
            if re.search(r'^images:', content, re.MULTILINE):
                # اگر داشت، جایگزینش کن
                content = re.sub(r'^images:\s*\n(?:\s*-\s*.*\n)*', yaml_images + "\n", content, flags=re.MULTILINE)
            else:
                # اگر نداشت، قبل از خط --- دوم اضافه کن
                parts = content.split('---', 2)
                if len(parts) >= 3:
                    content = parts[0] + '---' + parts[1] + '\n' + yaml_images + '\n---' + parts[2]
            
            # ذخیره تغییرات
            md_path.write_text(content, encoding='utf-8')
            
            # حذف از لیست فولدرهای منتظر (تا در لیست unmapped ها نیاید)
            del folders_dict[slug]
            
            print(f"🔗 لینک شد: {md_path.name}  <-->  {actual_folder_name} ({len(images)} عکس)")
            linked_count += 1
        else:
            missing_folders.append(slug)

    print("-" * 50)
    print(f"\n🎉 {linked_count} محصول با موفقیت به پوشه عکس‌هایشان لینک شدند.")

    # ۳. گزارش پوشه‌هایی که عکس دارند اما فایل md ندارند
    if folders_dict:
        print(f"\n⚠️ {len(folders_dict)} پوشه عکس وجود دارد که فایل محصولی برایشان پیدا نشد:")
        print("(این‌ها همان محصولات نمونه‌ای هستند که باید در بخش samples بررسی کنید)")
        for folder_name in folders_dict.values():
            print(f"  - {folder_name}")

    # ۴. گزارش محصولاتی که فایل md دارند اما پوشه عکس ندارند
    if missing_folders:
        print(f"\nℹ️ {len(missing_folders)} محصول فایل md دارند اما پوشه عکسی برایشان یافت نشد:")
        for name in missing_folders:
            print(f"  - {name}")

if __name__ == '__main__':
    main()