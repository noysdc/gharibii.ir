#!/usr/bin/env python3
import os
import re
from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
ROOT = HERE.parent
IMAGES_DIR = ROOT / "assets" / "images" / "products"
PRODUCTS_DIR = ROOT / "_products"

def process_images():
    print("🔄 شروع تبدیل عکس‌ها به WebP...\n")
    
    converted_count = 0
    updated_md_count = 0

    # ۱. پیدا کردن همه عکس‌های محصولات
    for file_path in IMAGES_DIR.rglob("*"):
        if not file_path.is_file(): continue
        
        # فقط فرمت‌های عکس (به جز webp)
        if file_path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp']:
            new_path = file_path.with_suffix('.webp')
            
            try:
                # تبدیل و ذخیره با کیفیت ۸۰ (تعادل حجم و کیفیت)
                img = Image.open(file_path).convert("RGB")
                img.save(new_path, "WEBP", quality=80)
                
                # حذف فایل اصلی
                file_path.unlink()
                converted_count += 1
                print(f"  ✓ {file_path.name} -> {new_path.name}")
                
                # ۲. آپدیت فایل .md مربوطه (تغییر پسوند در مسیر)
                # مسیر نسبی برای پیدا کردن فایل md
                rel_path = file_path.relative_to(IMAGES_DIR)
                # ساخت مسیر جدید برای جایگزینی در فایل md
                old_url = f"/assets/images/products/{rel_path.as_posix()}"
                new_url = f"/assets/images/products/{new_path.relative_to(IMAGES_DIR).as_posix()}"
                
                # پیدا کردن فایل md
                slug = file_path.parent.name
                category = file_path.parent.parent.name
                md_file = PRODUCTS_DIR / category / f"{slug}.md"
                
                if md_file.exists():
                    content = md_file.read_text(encoding='utf-8')
                    if old_url in content:
                        content = content.replace(old_url, new_url)
                        md_file.write_text(content, encoding='utf-8')
                        updated_md_count += 1
                        
            except Exception as e:
                print(f"  ❌ خطا در {file_path.name}: {e}")

    print(f"\n🎉 تبدیل تمام شد!")
    print(f"📸 {converted_count} عکس به WebP تبدیل شدند.")
    print(f"📝 {updated_md_count} فایل .md آپدیت شدند.")

if __name__ == '__main__':
    process_images()