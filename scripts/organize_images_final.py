#!/usr/bin/env python3
import os
import re
import shutil
from pathlib import Path

# مسیر مبدا (عکس‌های خام)
IMAGES_SRC = Path(r"C:\Users\unes shojaei\Documents\GitHub\gharibii.ir\assets\images\raw\01")

# مسیر مقصد (پوشه محصولات)
IMAGES_DEST = Path(r"C:\Users\unes shojaei\Documents\GitHub\gharibii.ir\assets\images\products")

# مسیر فایل‌های md
MD_DIR = Path(r"C:\Users\unes shojaei\Documents\GitHub\gharibii.ir\_products")

def clean_name(name):
    # فقط حروف انگلیسی، اعداد و خط تیره را نگه می‌دارد (حذف فاصله‌های اضافی و پرانتز)
    return re.sub(r'[^a-zA-Z0-9-]', '', name.lower().replace(' ', ''))

def main():
    if not IMAGES_SRC.exists():
        print(f"❌ پوشه عکس‌ها پیدا نشد: {IMAGES_SRC}")
        return
    if not MD_DIR.exists():
        print(f"❌ پوشه محصولات پیدا نشد: {MD_DIR}")
        return

    # ۱. لیست تمام پوشه‌های عکس در پوشه raw/01
    folders_in_raw = [d for d in IMAGES_SRC.iterdir() if d.is_dir()]
    
    # ۲. پیدا کردن تمام فایل‌های md
    md_files = list(MD_DIR.rglob("*.md"))
    
    print(f"🔍 تعداد {len(md_files)} فایل محصول و {len(folders_in_raw)} پوشه عکس پیدا شد.\n")

    success_count = 0

    for md_file in md_files:
        text = md_file.read_text(encoding='utf-8')
        
        # پیدا کردن slug (نام محصول) از فایل md
        slug_match = re.search(r'slug:\s*["\']?([^"\'\n]+)', text)
        if not slug_match: 
            continue
        slug = slug_match.group(1).strip()
        
        # پیدا کردن category (دسته‌بندی) از فایل md
        cat_match = re.search(r'category:\s*["\']?([^"\'\n]+)', text)
        category = cat_match.group(1).strip() if cat_match else "unknown"

        # ۳. گشتن دنبال پوشه‌ای که نامش با slug مطابقت داشته باشد
        matched_folder = None
        for folder in folders_in_raw:
            # اگر نام پوشه دقیقا با slug یکی بود، یا نسخه تمیز شده‌شان یکی بود
            if folder.name == slug or clean_name(folder.name) == clean_name(slug):
                matched_folder = folder
                break

        # اگر پوشه پیدا شد
        if matched_folder:
            # لیست عکس‌ها
            images = [f for f in matched_folder.iterdir() if f.is_file() and f.suffix.lower() in {'.webp', '.jpg', '.jpeg', '.png'}]
            
            if not images:
                continue

            # ساختن پوشه مقصد
            dest_folder = IMAGES_DEST / category / slug
            dest_folder.mkdir(parents=True, exist_ok=True)

            web_paths = []
            # کپی عکس‌ها با شماره
            for i, img in enumerate(sorted(images), 1):
                ext = img.suffix.lower()
                new_name = f"{i}{ext}"
                shutil.copy2(img, dest_folder / new_name)
                web_paths.append(f"/assets/images/products/{category}/{slug}/{new_name}")

            # آپدیت فایل md
            yaml_images = "images:\n" + "\n".join([f"  - {p}" for p in web_paths])
            
            if re.search(r'^images:', text, re.MULTILINE):
                text = re.sub(r'^images:\s*\n(?:\s*-\s*.*\n)*', yaml_images + "\n", text, flags=re.MULTILINE)
            else:
                parts = text.split('---', 2)
                if len(parts) >= 3:
                    text = parts[0] + '---' + parts[1] + '\n' + yaml_images + '\n---' + parts[2]
            
            md_file.write_text(text, encoding='utf-8')
            
            print(f"✅ {len(images)} عکس کپی شد برای: {slug} -> {category}/{slug}")
            success_count += 1
        else:
            print(f"⚠️ پوشه عکسی برای این محصول پیدا نشد: {slug}")

    print(f"\n🎉 عملیات تمام شد. {success_count} محصول با موفقیت لینک شدند.")

if __name__ == '__main__':
    main()