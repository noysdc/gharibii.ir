#!/usr/bin/env python3
import os
import shutil
import re
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
IMAGES_SRC = ROOT / "assets" / "images" / "raw" / "010101"
IMAGES_DEST = ROOT / "assets" / "images" / "products"

def normalize(text):
    text = text.replace('ي', 'ی').replace('ك', 'ک').replace('\u200c', ' ')
    text = re.sub(r'[^\w\s]', ' ', text.lower())
    for word in ['فروشگاه غریبی کیش', 'فروشگاه غریبی', 'فروشگاه', 'کیش', 'فروش']:
        text = text.replace(word, '')
    return " ".join(text.split())

def main():
    if not IMAGES_SRC.exists():
        print(f"❌ پوشه پیدا نشد: {IMAGES_SRC}")
        return

    # ۱. خواندن همه محصولات (چه عکس دار، چه بی عکس)
    products = []
    for md in (ROOT / "_products").glob("*/*.md"):
        content = md.read_text(encoding='utf-8')
        title = re.search(r'title:\s*"(.*?)"', content)
        slug = re.search(r'slug:\s*"(.*?)"', content)
        has_images = bool(re.search(r'images:\s*\n\s*-', content))
        
        if title and slug:
            products.append({
                'file': md,
                'cat': md.parent.name,
                'title': title.group(1),
                'slug': slug.group(1),
                'norm': normalize(title.group(1)),
                'has_images': has_images
            })

    matched_count = 0
    print("🔍 شروع تطبیق هوشمند پوشه‌ها...\n")

    # ۲. بررسی پوشه‌ها
    for folder in IMAGES_SRC.iterdir():
        if not folder.is_dir(): continue
        
        images = [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.gif'}]
        if not images: continue

        folder_norm = normalize(folder.name)
        
        # پیدا کردن محصولی که اسمش با اسم پوشه همخوانی داره
        best_p = None
        max_score = 0
        for p in products:
            # محاسبه امتیاز تطبیق (شباهت کلمات)
            common = set(folder_norm.split()) & set(p['norm'].split())
            score = len(common) / max(len(folder_norm.split()), 1)
            
            # اگه کلمه کلیدی دقیقاً توی اسم محصول بود
            if folder_norm in p['norm'] or p['norm'] in folder_norm:
                score += 1

            if score > max_score:
                max_score = score
                best_p = p

        # اگر امتیاز قابل قبول بود (حداقل 0.3 یا 1 کلمه مشترک)
        if max_score >= 0.3 and best_p:
            if best_p['has_images']:
                # اگه عکس داره، ازش بگذر
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

            content = best_p['file'].read_text(encoding='utf-8')
            yaml_imgs = "images:\n" + "\n".join([f"  - {p}" for p in paths])
            content = re.sub(r'images:\s*\[\]', yaml_imgs, content)
            best_p['file'].write_text(content, encoding='utf-8')
            
            print(f" ✅ پوشه '{folder.name}' -> {best_p['slug']} ({len(images)} عکس)")
            matched_count += 1
            best_p['has_images'] = True # آپدیت وضعیت

    print(f"\n🎉 {matched_count} پوشه با موفقیت وصل شدند.")

if __name__ == '__main__':
    main()