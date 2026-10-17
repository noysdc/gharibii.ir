#!/usr/bin/env python3
import os
import shutil
import re
from pathlib import Path

# ═══════════════════════════════════════════
# تنظیمات مسیرها
# ═══════════════════════════════════════════
HERE = Path(__file__).parent
ROOT = HERE.parent
IMAGES_SRC = ROOT / "assets" / "images" / "raw" / "010101"
IMAGES_DEST = ROOT / "assets" / "images" / "products"

# ═══════════════════════════════════════════
# کلمات کلیدی برای تشخیص هوشمند
# ═══════════════════════════════════════════
KEYWORDS = {
    'elsa': ['السا', 'elsa'],
    'anna': ['آنا', 'انا', 'anna'],
    'cinderella': ['سیندرلا', 'cinderella'],
    'snow-white': ['سفید برفی', 'سفیدبرفی'],
    'rapunzel': ['راپونزل', 'گیسوکمند'],
    'ariel': ['آریل', 'پری دریایی', 'mermaid'],
    'jasmine': ['جاسمین', 'yasmin'],
    'sofia': ['سوفیا', 'sofia'],
    'batman': ['بتمن', 'batman'],
    'spiderman': ['اسپایدرمن', 'spiderman', 'اسپایدر'],
    'hulk': ['هالک', 'hulk'],
    'venom': ['ونوم', 'venom'],
    'ironman': ['آیرون من', 'ironman', 'مردان آهنین'],
    'superman': ['سوپرمن', 'superman'],
    'flash': ['فلش', 'flash'],
    'thor': ['ثور', 'thor'],
    'harry-potter': ['هری پاتر', 'harry-potter'],
    'moana': ['مووانا', 'moana'],
    'mickey-mouse': ['میکی موس', 'mickey'],
    'unicorn': ['تکشاخ', 'یونیکورن', 'unicorn'],
    'frozen': ['فروزن', 'frozen'],
    'ladybug': ['دخترکفشدوزکی', 'کفشدوزکی', 'ladybug'],
    'paw-patrol': ['سگهای نگهبان', 'سگ هاي نگهبان', 'paw-patrol'],
    'mcqueen': ['مک کویین', 'mcqueen'],
    'wings': ['بال', 'wings'],
    'cape': ['شنل', 'cape'],
    'mask': ['ماسک', 'mask'],
    'hat': ['کلاه', 'hat'],
    'bag': ['کیف', 'bag'],
    'shoes': ['کفش', 'shoes'],
    'crown': ['تاج', 'crown'],
    'wand': ['عصا', 'wand'],
    'gloves': ['دستکش', 'gloves'],
    'swimsuit': ['مایو', 'swimsuit'],
    'dress': ['پیراهن', 'پیرهن', 'لباس', 'dress', 'costume'],
    'shirt': ['تیشرت', 'تی شرت', 'tshirt'],
    'skirt': ['دامن', 'skirt'],
    'set': ['ست', 'set'],
}

def normalize(text):
    text = text.replace('ي', 'ی').replace('ك', 'ک').replace('\u200c', ' ')
    text = re.sub(r'[^\w\s]', ' ', text.lower())
    for word in ['فروشگاه غریبی کیش', 'فروشگاه غریبی', 'فروشگاه', 'کیش', 'فروش']:
        text = text.replace(word, '')
    return " ".join(text.split())

def extract_keys(text):
    """استخراج کلمات کلیدی (مثل السا، بتمن) از یک متن"""
    norm_text = normalize(text)
    found = set()
    for eng, farsi_list in KEYWORDS.items():
        for f in farsi_list:
            if f in norm_text:
                found.add(eng)
                break
    return found

def main():
    if not IMAGES_SRC.exists():
        print(f"❌ پوشه پیدا نشد: {IMAGES_SRC}")
        print("   لطفا پوشه 010101 را داخل assets/images/raw کپی کنید.")
        return

    # ۱. خواندن محصولات
    products = []
    for md in (ROOT / "_products").glob("*/*.md"):
        content = md.read_text(encoding='utf-8')
        title = re.search(r'title:\s*"(.*?)"', content)
        slug = re.search(r'slug:\s*"(.*?)"', content)
        if title and slug:
            products.append({
                'file': md,
                'cat': md.parent.name,
                'title': title.group(1),
                'slug': slug.group(1),
                'keys': extract_keys(title.group(1)),
                'has_images': bool(re.search(r'images:\s*\n\s*-', content))
            })
    
    print(f"✅ {len(products)} محصول آماده بررسی است.\n")

    matched_count = 0
    skipped_count = 0
    skipped_folders = []

    # ۲. بررسی پوشه‌های عکس
    for folder in IMAGES_SRC.iterdir():
        if not folder.is_dir(): continue
        
        images = [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.gif'}]
        if not images: continue

        folder_keys = extract_keys(folder.name)
        
        # اگه پوشه هیچ کلمه کلیدی نداشت، رد شو
        if not folder_keys:
            skipped_folders.append(folder.name)
            continue
            
        # پیدا کردن بهترین محصول (بیشترین کلمات مشترک)
        best_p = None
        max_overlap = 0
        
        for p in products:
            if not p['keys']: continue
            
            # تعداد کلمات مشترک بین اسم پوشه و اسم محصول
            overlap = len(folder_keys & p['keys'])
            
            # شرط برنده شدن: باید حداقل ۲ کلمه مشترک باشه، یا ۱ کلمه که خیلی خاص باشه (مثل بتمن)
            if overlap > max_overlap:
                max_overlap = overlap
                best_p = p

        # شرط عبور
        if max_overlap >= 2 or (max_overlap == 1 and len(folder_keys) == 1 and len(best_p['keys']) <= 2):
            # اگر محصول از قبل عکس داشت، ازش بگذر
            if best_p.get('has_images'):
                print(f"  - از {best_p['slug']} گذشتیم (از قبل عکس دارد)")
                skipped_count += 1
                continue

            dest_dir = IMAGES_DEST / best_p['cat'] / best_p['slug']
            dest_dir.mkdir(parents=True, exist_ok=True)

            paths = []
            for i, img in enumerate(sorted(images), 1):
                ext = img.suffix.lower()
                if ext not in ['.jpg', '.png', '.webp']: ext = '.jpg'
                new_name = f"{i}{ext}"
                shutil.copy2(img, dest_dir / new_name)
                paths.append(f"/assets/images/products/{best_p['cat']}/{best_p['slug']}/{new_name}")

            # آپدیت فایل .md
            content = best_p['file'].read_text(encoding='utf-8')
            yaml_imgs = "images:\n" + "\n".join([f"  - {p}" for p in paths])
            content = re.sub(r'images:\s*\[\]', yaml_imgs, content)
            best_p['file'].write_text(content, encoding='utf-8')

            print(f"  ✓ [{max_overlap} تطبیق] {folder.name[:30]} -> {best_p['slug']} ({len(images)} عکس)")
            matched_count += 1
            
            # حذف محصول از لیست تا دوباره استفاده نشه
            products.remove(best_p)
        else:
            skipped_folders.append(folder.name)

    print(f"\n🎉 {matched_count} پوشه جدید کپی و به فایل‌ها وصل شدند.")
    if skipped_count > 0:
        print(f"⏭️ {skipped_count} پوشه به دلیل داشتن عکس قبلی نادیده گرفته شدند.")
    
    print(f"\n⚠️ {len(skipped_folders)} پوشه نامشخص رد شدند (برای کار دستی):")
    for f in skipped_folders:
        print(f"  - {f}")

if __name__ == '__main__':
    main()