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

    # ۱. پیدا کردن محصولات بدون عکس
    empty_products = []
    for md in (ROOT / "_products").glob("*/*.md"):
        content = md.read_text(encoding='utf-8')
        title = re.search(r'title:\s*"(.*?)"', content)
        slug = re.search(r'slug:\s*"(.*?)"', content)
        has_images = bool(re.search(r'images:\s*\n\s*-', content))
        
        if title and slug and not has_images:
            empty_products.append({
                'file': md,
                'cat': md.parent.name,
                'title': title.group(1),
                'slug': slug.group(1)
            })

    print(f"\n📸 {len(empty_products)} محصول بدون عکس پیدا شد.")
    
    # ۲. پیدا کردن پوشه‌های باقیمانده
    leftover_folders = []
    # (فرض میکنیم پوشه‌هایی که الان توی raw هستن و قبلا کپی نشدن، همونایی هستن که اسکریپت خودکار رد کرد)
    # برای سادگی، هر پوشه‌ای که عکس داره و به هیچ محصولی وصل نیست رو میاریم
    for folder in IMAGES_SRC.iterdir():
        if not folder.is_dir(): continue
        images = [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.gif'}]
        if images:
            leftover_folders.append((folder, images))

    if not leftover_folders:
        print("🎉 هیچ پوشه‌ای باقی نمانده است!")
        return

    print(f"⚠️ {len(leftover_folders)} پوشه عکس برای بررسی دستی وجود دارد.")
    
    # ۳. حلقه تعاملی
    for folder, images in leftover_folders:
        print("\n" + "="*60)
        print(f"📁 پوشه: {folder.name} ({len(images)} عکس)")
        print("-" * 60)
        
        for i, p in enumerate(empty_products):
            print(f"  {i+1}) [{p['cat']}] {p['title']}")
            
        print("  0) رد کردن (Skip)")
        
        try:
            choice = input("\n👉 شماره محصول مورد نظر را بزنید (یا 0 برای رد کردن): ")
            if choice.strip() == '0' or choice.strip() == '':
                continue
            
            idx = int(choice) - 1
            if 0 <= idx < len(empty_products):
                target = empty_products[idx]
                
                # کپی عکس‌ها
                dest_dir = IMAGES_DEST / target['cat'] / target['slug']
                dest_dir.mkdir(parents=True, exist_ok=True)
                
                paths = []
                for i, img in enumerate(sorted(images), 1):
                    ext = img.suffix.lower()
                    if ext not in ['.jpg', '.png', '.webp']: ext = '.jpg'
                    new_name = f"{i}{ext}"
                    shutil.copy2(img, dest_dir / new_name)
                    paths.append(f"/assets/images/products/{target['cat']}/{target['slug']}/{new_name}")
                    
                # آپدیت فایل md
                content = target['file'].read_text(encoding='utf-8')
                yaml_imgs = "images:\n" + "\n".join([f"  - {p}" for p in paths])
                content = re.sub(r'images:\s*\[\]', yaml_imgs, content)
                target['file'].write_text(content, encoding='utf-8')
                
                print(f"✅ عکس‌ها به {target['slug']} وصل شدند.")
                
                # حذف محصول از لیست تا دوباره نشون داده نشه
                empty_products.pop(idx)
            else:
                print("❌ شماره نامعتبر است.")
        except ValueError:
            print("❌ لطفاً یک عدد وارد کنید.")

    print("\n🎉 تمام شد! حالا می‌تونید دکمه را بزنید.")

if __name__ == '__main__':
    main()