import os
import re

# ===================== تنظیمات =====================
ROOT = r"C:\Users\unes shojaei\Documents\GitHub\gharibii.ir\assets\images\raw\01"

# حالا واقعی است (False با F بزرگ)
DRY_RUN = False

EXTENSION = ".webp"
# ====================================================

def clean_filename(filename):
    # جدا کردن نام و پسوند
    stem, ext = os.path.splitext(filename)
    
    # ۱. تبدیل پرانتز به خط تیره: name (1) -> name-1
    stem = re.sub(r'\s*\((\d+)\)$', r'-\1', stem)
    
    # ۲. تبدیل آندرلاین به خط تیره: name_1 -> name-1
    stem = re.sub(r'_(\d+)$', r'-\1', stem)
    
    # ۳. تبدیل فاصله به خط تیره: name 1 -> name-1
    stem = re.sub(r'\s+(\d+)$', r'-\1', stem)
    
    # ۴. پاک کردن خط تیره‌های تکراری: name--1 -> name-1
    stem = re.sub(r'-+', '-', stem)
    stem = stem.strip('-')
    
    # ۵. برگرداندن نام جدید با پسوند اصلی (حفظ حروف بزرگ و کوچک پسوند)
    return f"{stem}{ext}"

def unique_target_path(directory, filename):
    stem, ext = os.path.splitext(filename)
    candidate = os.path.join(directory, filename)
    counter = 2
    while os.path.exists(candidate):
        candidate = os.path.join(directory, f"{stem}-{counter}{ext}")
        counter += 1
    return candidate

def main():
    root = os.path.abspath(ROOT)
    
    if not os.path.isdir(root):
        print("\n[ERROR] پوشه پیدا نشد!")
        return

    print("=" * 50)
    print("حالت:", "پیش‌نمایش (بدون تغییر)" if DRY_RUN else "تغییر نام واقعی")
    print("پوشه اصلی:", root)
    print("=" * 50)

    planned = []
    
    for dirpath, _, filenames in os.walk(root):
        # بررسی پسوند بدون توجه به بزرگ یا کوچک بودن حروف (webp یا WEBP)
        webps = sorted(f for f in filenames if f.lower().endswith(EXTENSION))
        if not webps:
            continue

        for old in webps:
            old_path = os.path.join(dirpath, old)
            new_name = clean_filename(old)
            
            if old == new_name:
                continue

            target = os.path.join(dirpath, new_name)
            
            if os.path.exists(target):
                target = unique_target_path(dirpath, new_name)
                new_name = os.path.basename(target)

            planned.append((old_path, target))
            print(f"  {old}  ->  {new_name}")

    print(f"\nتعداد فایل‌هایی که باید تغییر کنند: {len(planned)}")

    if DRY_RUN:
        print("\nپیش‌نمایش بود. برای اجرای واقعی، DRY_RUN = False کن.")
        return

    if not planned:
        print("هیچ فایلی برای تغییر پیدا نشد. (شاید نام‌ها از قبل درست هستند یا پسوند آن‌ها webp نیست).")
        return

    if input("\nبرای اجرای تغییر نام، کلمه RENAME را تایپ کنید: ").strip() != "RENAME":
        print("لغو شد.")
        return

    ok = fail = 0
    for old_path, target in planned:
        try:
            if os.path.exists(target):
                target = unique_target_path(os.path.dirname(target), os.path.basename(target))
            
            os.rename(old_path, target)
            print(f"OK: {os.path.basename(old_path)} -> {os.path.basename(target)}")
            ok += 1
        except OSError as e:
            print(f"FAIL: {os.path.basename(old_path)} | {e}")
            fail += 1

    print(f"\nپایان کار. موفق: {ok} | ناموفق: {fail}")

if __name__ == "__main__":
    main()