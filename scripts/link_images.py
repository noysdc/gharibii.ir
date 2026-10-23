#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
link_images.py — لینک‌کردن دقیق عکس‌ها به فایل‌های md محصولات

قانون: برای فایل  _products/<category>/<name>.md
       پوشه‌ی عکس  assets/images/products/<category>/<name>/  است.

کار اسکریپت (به ترتیب دسته‌ها و فایل‌ها):
  1. هر دسته‌بندی در _products را می‌گردد و برای هر md پوشه‌ی هم‌نامش را پیدا می‌کند.
  2. عکس‌های پوشه را (ترتیب طبیعی: 1,2,...,10) در فیلد images: همان md می‌نویسد.
  3. لینک‌های شکسته (فایلی که وجود ندارد) را گزارش می‌دهد و درست می‌کند.
  4. عکس‌های دوتایی (محتوای یکسان) را گزارش می‌دهد.

پیش‌فرض فقط «گزارش» می‌دهد (Dry-run). برای اعمال تغییرات --apply بزنید.

    python scripts/link_images.py                 # فقط گزارش
    python scripts/link_images.py --apply         # md ها را اصلاح کن
    python scripts/link_images.py --apply --move-dupes   # کپی‌های اضافه را به _dupes_trash ببر

خروجی: scripts/link_report.csv
"""
import argparse, csv, hashlib, os, re, shutil, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS_MD = ROOT / "_products"
IMG_ROOT = ROOT / "assets" / "images" / "products"
URL_PREFIX = "/assets/images/products"
IMG_EXT = {".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif"}

# پوشه‌ی md با پوشه‌ی عکس گاهی نام متفاوت دارد (در پروژه‌ی شما هر دو وجود دارند)
CATEGORY_ALIASES = {
    "wands-crowns": ["wands-crowns", "crown-wand"],
    "crown-wand": ["crown-wand", "wands-crowns"],
}


# ───────────────────────── ابزارها ─────────────────────────
def natural_key(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def list_images(folder):
    """عکس‌های اصلی پوشه؛ thumbnail ها (-t.webp) و نسخه‌ی غیر-webp تکراری حذف می‌شوند."""
    files = [p for p in folder.iterdir()
             if p.is_file() and p.suffix.lower() in IMG_EXT and not p.stem.endswith("-t")]
    webp_stems = {p.stem for p in files if p.suffix.lower() == ".webp"}
    files = [p for p in files if p.suffix.lower() == ".webp" or p.stem not in webp_stems]
    return sorted(files, key=lambda p: natural_key(p.name))


def to_url(path):
    return "/" + path.relative_to(ROOT).as_posix()


def url_to_path(url):
    return ROOT / url.lstrip("/")


# ───────────────────────── خواندن/نوشتن front matter ─────────────────────────
def split_md(text):
    """-> (eol, lines, end_index)  ؛ end_index = اندیس خط --- پایانی"""
    eol = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(eol)
    if not lines or lines[0].strip() != "---":
        return eol, lines, None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return eol, lines, i
    return eol, lines, None


def find_images_block(lines, end):
    """(start, stop) خطوط فیلد images: ؛ stop انحصاری. None اگر وجود نداشت."""
    for i in range(1, end):
        if re.match(r"^images\s*:", lines[i]):
            j = i + 1
            while j < end and (re.match(r"^\s+-\s", lines[j]) or lines[j].strip() == ""):
                j += 1
            # خط‌های خالی انتهای بلوک جزو بلوک نیستند
            while j > i + 1 and lines[j - 1].strip() == "":
                j -= 1
            return i, j
    return None


def current_images(lines, block):
    if not block:
        return []
    s, e = block
    out = []
    first = re.sub(r"^images\s*:\s*", "", lines[s]).strip()
    if first.startswith("["):  # حالت inline: images: ["a", "b"]
        out += [x.strip(" \"'") for x in first.strip("[]").split(",") if x.strip(" \"'")]
    for l in lines[s + 1:e]:
        m = re.match(r"^\s+-\s+(.*)$", l)
        if m:
            out.append(m.group(1).strip().strip("\"'"))
    return out


def get_images_dirs(lines, end):
    for i in range(1, end):
        m = re.match(r"^images_dirs\s*:\s*\[(.*)\]", lines[i])
        if m:
            return [x.strip(" \"'") for x in m.group(1).split(",") if x.strip(" \"'")]
    return []


# ───────────────────────── پیدا کردن پوشه‌ی عکس ─────────────────────────
def candidate_folders(cat, name, dirs_field):
    """به ترتیب اولویت: پوشه‌ی استاندارد، alias دسته، پوشه‌ی بدون دسته، images_dirs."""
    cands = []
    for c in CATEGORY_ALIASES.get(cat, [cat]):
        cands.append((IMG_ROOT / c / name, "category/name" if c == cat else "alias-category"))
    cands.append((IMG_ROOT / name, "flat (بدون دسته)"))
    for d in dirs_field:
        p = url_to_path(d.rstrip("/"))
        cands.append((p, "images_dirs"))
    seen, out = set(), []
    for p, how in cands:
        if p not in seen:
            seen.add(p)
            out.append((p, how))
    return out


def pick_folder(cat, name, dirs_field):
    found = []
    for p, how in candidate_folders(cat, name, dirs_field):
        if p.is_dir() and list_images(p):
            found.append((p, how))
    return found  # اولی بهترین است؛ بقیه کپی‌های احتمالی


# ───────────────────────── برنامه‌ی اصلی ─────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="تغییرات را روی md ها اعمال کن")
    ap.add_argument("--move-dupes", action="store_true",
                    help="عکس‌های تکراریِ بدون استفاده را به _dupes_trash منتقل کن (حذف نمی‌کند)")
    args = ap.parse_args()

    if not PRODUCTS_MD.is_dir():
        sys.exit(f"❌ پوشه‌ی _products پیدا نشد: {PRODUCTS_MD}")

    rows, stats = [], defaultdict(int)
    referenced = set()

    for cat_dir in sorted(p for p in PRODUCTS_MD.iterdir() if p.is_dir()):
        cat = cat_dir.name
        print(f"\n📂 {cat}")
        for md in sorted(cat_dir.glob("*.md"), key=lambda p: natural_key(p.name)):
            name = md.stem
            raw = md.read_bytes()
            has_bom = raw.startswith(b"\xef\xbb\xbf")
            text = raw.decode("utf-8-sig")
            eol, lines, end = split_md(text)
            if end is None:
                print(f"   ⚠️  {name}: front matter ندارد، رد شد")
                rows.append([cat, name, "no-frontmatter", "", 0, 0, ""])
                stats["no-frontmatter"] += 1
                continue

            block = find_images_block(lines, end)
            old = current_images(lines, block)
            broken = [u for u in old if not u.startswith("http") and not url_to_path(u).is_file()]

            found = pick_folder(cat, name, get_images_dirs(lines, end))
            if not found:
                status = "no-folder" if not old else ("broken" if broken else "kept-no-folder")
                if old and not broken:
                    referenced.update(old)
                print(f"   ❌ {name}: پوشه‌ی عکس پیدا نشد"
                      + (f" (لینک شکسته: {len(broken)})" if broken else ""))
                rows.append([cat, name, status, "", len(old), len(broken), ""])
                stats[status] += 1
                continue

            folder, how = found[0]
            extra = [str(p.relative_to(ROOT)) for p, _ in found[1:]]
            imgs = list_images(folder)
            new = [to_url(p) for p in imgs]
            referenced.update(new)

            if new == old:
                status = "ok"
                print(f"   ✅ {name}: {len(new)} عکس (بدون تغییر)")
            else:
                status = "fixed" if old else "linked"
                print(f"   🔗 {name}: {len(old)} → {len(new)} عکس"
                      + (f" | شکسته بود: {len(broken)}" if broken else "")
                      + (f" | منبع: {how}" if how != "category/name" else ""))
                if args.apply:
                    block_lines = ["images:"] + [f"  - {u}" for u in new]
                    if block:
                        lines[block[0]:block[1]] = block_lines
                    else:
                        lines[end:end] = block_lines
                    out = eol.join(lines)
                    md.write_bytes((b"\xef\xbb\xbf" if has_bom else b"") + out.encode("utf-8"))
            if extra:
                print(f"      ⚠️  همین عکس‌ها جای دیگر هم هست: {', '.join(extra)}")
            rows.append([cat, name, status, str(folder.relative_to(ROOT)), len(new), len(broken), " | ".join(extra)])
            stats[status] += 1

    # ───── تکراری‌ها ─────
    print("\n🔍 بررسی عکس‌های تکراری (محتوای یکسان) ...")
    by_hash = defaultdict(list)
    if IMG_ROOT.is_dir():
        for p in IMG_ROOT.rglob("*"):
            if p.is_file() and p.suffix.lower() in IMG_EXT and not p.stem.endswith("-t"):
                by_hash[(p.stat().st_size, md5(p))].append(p)
    dup_groups = [g for g in by_hash.values() if len(g) > 1]
    unused_dupes = []
    for g in dup_groups:
        keep = [p for p in g if to_url(p) in referenced]
        drop = [p for p in g if to_url(p) not in referenced]
        if keep:  # حداقل یک نسخه استفاده می‌شود؛ بقیه اضافه‌اند
            unused_dupes += drop
        print(f"   • {len(g)} نسخه: " + "  ,  ".join(str(p.relative_to(ROOT)) for p in g))
    print(f"   مجموع گروه‌های تکراری: {len(dup_groups)} | فایل اضافه‌ی بی‌استفاده: {len(unused_dupes)}")

    if args.move_dupes and unused_dupes:
        if not args.apply:
            print("   (برای انتقال، --apply را هم بزنید)")
        else:
            trash = ROOT / "_dupes_trash"
            for p in unused_dupes:
                dest = trash / p.relative_to(IMG_ROOT)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(p), str(dest))
            print(f"   📦 {len(unused_dupes)} فایل به _dupes_trash منتقل شد (بعد از بررسی پوشه را پاک کنید)")

    # ───── گزارش ─────
    rep = ROOT / "scripts" / "link_report.csv"
    with open(rep, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["category", "md", "status", "image_folder", "images", "broken_links_before", "duplicate_folders"])
        w.writerows(rows)

    print("\n" + "=" * 50)
    for k, v in sorted(stats.items()):
        print(f"  {k:16} {v}")
    print(f"  گزارش کامل: {rep.relative_to(ROOT)}")
    if not args.apply:
        print("\n💡 این فقط گزارش بود. برای اعمال:  python scripts/link_images.py --apply")


if __name__ == "__main__":
    main()
