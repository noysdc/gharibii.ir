#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
انتقال نهایی عکس‌های محصولات (نسخهٔ جدید)

کار این اسکریپت:
  ۱. هر پوشه‌ی عکس داخل  assets/images/raw/01  را با فایل‌های .md محصولات تطبیق می‌دهد
     (بر اساس slug، فیلد folder، نام فایل md یا images_dirs).
  ۲. عکس‌ها را به  assets/images/products/<category>/<slug>/  منتقل می‌کند (جابه‌جایی، نه کپی)،
     با نام‌های <slug>-1.webp ، <slug>-2.webp ، ... (اگر فقط یک عکس باشد <slug>.webp)  و در md زیر کلید  images:  لینک می‌دهد.
  ۳. عکس‌هایی که منتقل شدند از پوشه raw حذف می‌شوند؛ آن‌هایی که منتقل نشدند همان‌جا می‌مانند.
  ۴. پوشه‌هایی که هیچ md ای ندارند: یک md نمونه در  _products/samples/  ساخته می‌شود
     (قیمت 0 و needs_review) و عکس‌ها به آن وصل می‌شوند تا بعداً مشخصات را وارد کنید.

اجرا:
    python organize_images_final.py             # اجرای واقعی
    python organize_images_final.py --dry-run   # فقط گزارش، بدون هیچ تغییری
"""
import csv
import difflib
import os
import re
import shutil
import stat
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

try:
    from PIL import Image, ImageOps
except ImportError:  # بدون Pillow هم کار می‌کند (فقط تبدیل به webp انجام نمی‌شود)
    Image = None
    ImageOps = None
try:  # اختیاری: پشتیبانی از عکس‌های HEIC/HEIF (آیفون)  →  pip install pillow-heif
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

# ───────────────────────── تنظیمات ─────────────────────────
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                                   # ریشه‌ی ریپو (پوشه‌ی بالاتر از scripts)
RAW_DIR = ROOT / "assets" / "images" / "raw" / "01"  # پوشه‌ی عکس‌های خام
DEST_ROOT = ROOT / "assets" / "images" / "products"  # مقصد نهایی عکس‌ها
MD_ROOT = ROOT / "_products"                         # md محصولات
SAMPLES_DIR = MD_ROOT / "samples"                    # md نمونه‌ها
URL_PREFIX = "/assets/images/products"
REPORT_CSV = HERE / "images_transfer_report.csv"
MAP_CSV = HERE / "folder_map.csv"   # نگاشت دستی: نام پوشه → slug محصول

CONVERT_TO_WEBP = True   # عکس‌ها هنگام انتقال به webp تبدیل شوند (نیاز به Pillow)
WEBP_QUALITY = 80
LOW_RES_MIN_WIDTH = 700  # عکسی که پس از برش ۳:۴ کمتر از این عرض داشته باشد در گالری مات دیده می‌شود
LOWRES = []              # (مسیر مقصد، عرض، ارتفاع)
MAKE_THUMBS = True       # کنار هر عکس webp یک <name>-t.webp کوچک هم ساخته شود (برای کارت‌ها/جستجو؛ سایت را سریع می‌کند)
THUMB_SIZE = (540, 720)
THUMB_QUALITY = 78
IMG_EXT = {".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif", ".heic", ".heif"}
JUNK_FILES = {"desktop.ini", "thumbs.db", ".ds_store"}
EOL = "\r\n"             # مثل بقیه‌ی md های پروژه

DRY_RUN = "--dry-run" in sys.argv
ALIASES = {}
PLANNED = {}  # فقط برای اجرای آزمایشی: شماره‌ی بعدی هر پوشه


# ───────────────────────── کمک‌تابع‌ها ─────────────────────────
def norm(name):
    """نام را برای مقایسه تمیز می‌کند: حروف کوچک، فاصله/زیرخط → خط تیره، فقط a-z 0-9 -"""
    if re.search(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]", str(name)):
        return ""  # نام شامل حروف فارسی/عربی است → نام انگلیسی نیست
    s = re.sub(r"\s*\(\d+\)\s*$", "", str(name)).strip().lower()  # «name (1)» → name
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"[^a-z0-9-]", "", s)
    return re.sub(r"-+", "-", s).strip("-")


def pnorm(name):
    """نرمال‌سازی نام فارسی برای مقایسه: یکسان‌سازی ی/ک، حذف «فروشگاه غریبی کیش»، علائم و فاصله‌های اضافه."""
    s = str(name)
    s = s.replace("ي", "ی").replace("ك", "ک").replace("ۀ", "ه").replace("\u200c", " ").replace("\u200f", "").replace("\u200e", "")
    s = re.sub(r"[\u064B-\u065F\u0670]", "", s)
    s = re.sub(r"\s*\(\d+\)\s*$", "", s).lower()
    for w in ("فروشگاه غریبی کیش", "فروشگاه غریبی", "غریبی کیش"):
        s = s.replace(w, " ")
    s = re.sub(r"[^\w]+|_", " ", s)
    return " ".join(s.split())


def natural_key(p):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", str(p).lower())]


def read_text(path):
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return f.read()


def write_text(path, text, bom=False):
    with open(path, "w", encoding="utf-8-sig" if bom else "utf-8", newline="") as f:
        f.write(text)


def has_bom(path):
    with open(path, "rb") as f:
        return f.read(3) == b"\xef\xbb\xbf"


def repair_frontmatter(text):
    """
    فایل‌هایی که خط بستن «---» فرانت‌متر را گم کرده‌اند (باگ اسکریپت قدیمی) ترمیم می‌کند.
    اگر فایل سالم باشد همان متن را برمی‌گرداند.
    """
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return text, False
    if any(l.strip() == "---" for l in lines[1:]):
        return text, False
    eol = "\r\n" if "\r\n" in text else "\n"
    # محل پایان: بعد از بلوک images: ؛ وگرنه آخرین خط شبیه فرانت‌متر
    cut = None
    for i in range(1, len(lines)):
        if re.match(r"^images:\s*(\[.*\])?\s*(#.*)?$", lines[i].rstrip("\r\n")):
            j = i + 1
            while j < len(lines) and re.match(r"^\s+-\s", lines[j]):
                j += 1
            cut = j
            break
    if cut is None:
        cut = 1
        for i in range(1, len(lines)):
            s = lines[i].rstrip("\r\n")
            if s.strip() == "" or re.match(r"^[A-Za-z_][\w-]*:", s) or re.match(r"^\s+\S", s) or s.startswith("#"):
                if s.strip() != "":
                    cut = i + 1
            else:
                break
    lines[cut:cut] = ["---" + eol]
    if cut + 1 < len(lines) and lines[cut + 1].strip() != "":
        lines[cut + 1:cut + 1] = [eol]
    return "".join(lines), True


def load_md(path):
    """متن md را می‌خواند و در صورت نیاز فرانت‌متر ناقص را در حافظه ترمیم می‌کند."""
    text, _ = repair_frontmatter(read_text(path))
    return text


def split_frontmatter(text):
    """(lines, پایان فرانت‌متر) را برمی‌گرداند؛ اگر فرانت‌متر نبود None."""
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return lines, None
    for j in range(1, len(lines)):
        if lines[j].strip() == "---":
            return lines, j
    return lines, None


def fm_value(lines, end, key):
    """مقدار ساده‌ی یک کلید فرانت‌متر (بدون کوتیشن و کامنت)."""
    for line in lines[1:end]:
        m = re.match(rf"^{re.escape(key)}:\s*(.*?)\s*$", line.rstrip("\r\n"))
        if not m:
            continue
        v = m.group(1)
        if v[:1] in "\"'":
            q = v[0]
            k = v.find(q, 1)
            return v[1:k] if k > 0 else v[1:]
        return re.split(r"\s+#", v)[0].strip()
    return ""


def yq(x):
    return '"' + str(x).replace("\\", "\\\\").replace('"', '\\"') + '"'


def category_of(folder):
    f = folder
    if any(k in f for k in ("bag", "shoes")):
        return "bags-shoes"
    if any(k in f for k in ("wand", "crown", "tinsel", "clip", "wig", "braid")):
        return "crown-wand"
    if any(k in f for k in ("gloves", "cape-mask", "mask", "hat", "cap", "necklace", "keychain", "nails", "wings", "accessory")):
        return "accessories"
    if any(k in f for k in ("batman", "hulk", "spiderman", "boy", "harry-potter", "ninja", "hawaiian",
                            "iron-man", "venom", "flash", "black-cat", "muscle")):
        return "boys"
    return "girls"


def gender_of(folder, cat):
    boys_kw = ("batman", "hulk", "spiderman", "boy", "harry-potter", "ninja", "iron-man", "superman", "captain",
               "thor", "incredibles", "pirate", "venom", "flash", "black-cat", "mcqueen")
    if any(k in folder for k in boys_kw):
        return "boys"
    if cat == "girls":
        return "girls"
    return "unisex" if cat == "accessories" else "girls"


# ───────────────────────── ایندکس md ها ─────────────────────────
PIDX = {}  # نام فارسی نرمال‌شده (title / old_slug) → مجموعه‌ی md های اصلی (غیر نمونه)


def index_products():
    """نگاشت  نام-نرمال‌شده → لیست md ها (با اولویت‌بندی)."""
    idx = {}
    PIDX.clear()
    for md in sorted(MD_ROOT.rglob("*.md")):
        try:
            text = load_md(md)
        except Exception:
            continue
        lines, end = split_frontmatter(text)
        if end is None:
            continue
        keys = []  # (اولویت، کلید)
        for pr, val in ((1, fm_value(lines, end, "slug")), (1, fm_value(lines, end, "folder")), (2, md.stem)):
            k = norm(val)
            if k:
                keys.append((pr, k))
        d = fm_value(lines, end, "images_dirs").strip("[]\"' /")
        k = norm(d.split("/")[-1]) if d else ""
        if k:
            keys.append((3, k))
        for pr, k in keys:
            idx.setdefault(k, []).append((pr, md.parent.name == "samples", md))
        if md.parent.name != "samples":
            for fk in ("title", "old_slug"):
                pk = pnorm(fm_value(lines, end, fk))
                if pk and re.search(r"[\u0600-\u06FF]", pk):
                    PIDX.setdefault(pk, set()).add(md)
    return idx


def pick_product(idx, key):
    """بهترین md برای یک نام پوشه؛ اگر مبهم بود (None, 'ambiguous')."""
    cands = idx.get(key)
    if not cands:
        return None, "none"
    cands = sorted(cands, key=lambda c: (c[0], c[1]))  # اولویت کمتر بهتر؛ غیر-sample بهتر
    best = cands[0]
    ties = {c[2] for c in cands if (c[0], c[1]) == (best[0], best[1])}
    if len(ties) > 1:
        return None, "ambiguous"
    return best[2], "ok"


# ───────────────────────── ویرایش images: در md ─────────────────────────
IMAGES_KEY = re.compile(r"^images:\s*(\[.*\])?\s*(#.*)?$")


def existing_images(lines, end):
    """(ایندکس شروع، ایندکس پایان، لیست لینک‌های فعلی) برای کلید images:"""
    for i in range(1, end):
        s = lines[i].rstrip("\r\n")
        m = IMAGES_KEY.match(s)
        if not m:
            continue
        items, j = [], i + 1
        if m.group(1):
            inner = m.group(1).strip()[1:-1]
            items = [x.strip().strip("\"'") for x in inner.split(",") if x.strip()]
        while j < end:
            mm = re.match(r"^\s+-\s*(.+?)\s*$", lines[j].rstrip("\r\n"))
            if not mm:
                break
            items.append(mm.group(1).strip("\"'"))
            j += 1
        return i, j, items
    return None, None, []


def rewrite_md(md, new_urls, dest_url_dir):
    """لینک عکس‌های جدید را به md اضافه می‌کند (بدون پاک کردن لینک‌های قبلی)."""
    text = load_md(md)
    bom = has_bom(md)
    eol = "\r\n" if "\r\n" in text else "\n"
    lines, end = split_frontmatter(text)
    if end is None:
        raise ValueError("فرانت‌متر ندارد")

    i, j, old = existing_images(lines, end)
    merged = old + [u for u in new_urls if u not in old]
    block = ["images:" + eol] + [f"  - {u}" + eol for u in merged]

    if i is not None:
        lines[i:j] = block
    else:
        add = []
        if lines[end - 1].strip() != "":
            add.append(eol)
        lines[end:end] = add + block

    # لینک پوشه‌ی عکس را اصلاح و پرچم «پوشه بساز» را حذف می‌کنیم (دیگر پوشه ساخته شده)
    end = next(k for k in range(1, len(lines)) if lines[k].strip() == "---")
    out = []
    for k, line in enumerate(lines):
        if 0 < k < end and line.startswith("images_dirs:"):
            line = f"images_dirs: [{yq(dest_url_dir)}]" + eol
        if 0 < k < end and re.match(r"^needs_folder:", line):
            continue
        out.append(line)
    write_text(md, "".join(out), bom)
    return merged


def make_sample_md(folder_key, cat, gen, urls):
    dest_dir = f"{URL_PREFIX}/{cat}/{folder_key}/"
    fm = [
        "---",
        "layout: product",
        f"title: {yq(folder_key + ' (محصول نمونه)')}",
        f"slug: {yq(folder_key)}",
        f"category: {cat}",
        f"gender: {gen}",
        'price: "0"',
        "currency: IRT",
        f"images_dirs: [{yq(dest_dir)}]",
        "needs_review: true",
        "# ⚠️ این محصول در فایل CSV وجود نداشت و به صورت خودکار ساخته شده است.",
        "# لطفا اطلاعات، قیمت و توضیحات را به صورت دستی وارد کنید.",
        "",
        "images:",
    ] + [f"  - {u}" for u in urls] + ["---", "", "توضیحات محصول را اینجا بنویسید...", ""]
    # (عکس‌ها داخل فرانت‌متر قرار می‌گیرند تا جکیل آن‌ها را بخواند)
    return EOL.join(fm)


# ───────────────────────── انتقال عکس‌ها ─────────────────────────
def _num_of(stem, base):
    if stem.isdigit():
        return int(stem)
    if stem == base:
        return 1
    m = re.match(rf"^{re.escape(base)}-(\d+)$", stem)
    return int(m.group(1)) if m else 0


def next_number(dest_dir, known_urls):
    base = dest_dir.name
    nums = [0]
    if dest_dir.exists():
        for f in dest_dir.iterdir():
            if f.is_file():
                nums.append(_num_of(f.stem, base))
    for u in known_urls:
        if Path(u).parent.name == base:
            nums.append(_num_of(Path(u).stem, base))
    return max(nums) + 1


def image_basename(base, number, single):
    """اسم عکس: اگر فقط یک عکس باشد «slug» ، وگرنه «slug-1»، «slug-2» ..."""
    return base if single else f"{base}-{number}"


def _note_size(dst, size):
    """عکس‌های کم‌وضوح را ثبت می‌کند (پس از برش ۳:۴ که سایت نمایش می‌دهد)."""
    w, h = size
    eff_w = min(w, h * 3 / 4)
    if eff_w < LOW_RES_MIN_WIDTH:
        LOWRES.append((dst, w, h))


def make_thumb(dst):
    """تامبنیل <name>-t.webp کنار عکس اصلی می‌سازد (همان منطق make_thumbs.py)."""
    if not MAKE_THUMBS or Image is None or dst.suffix.lower() != ".webp" or dst.stem.endswith("-t"):
        return
    try:
        with Image.open(dst) as im:
            im = ImageOps.exif_transpose(im)
            alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
            im = im.convert("RGBA" if alpha else "RGB")
            th = ImageOps.fit(im, THUMB_SIZE, Image.LANCZOS, centering=(0.5, 0.5))
            th.save(dst.with_name(dst.stem + "-t.webp"), "WEBP", quality=THUMB_QUALITY, method=4)
    except Exception as e:
        print(f"   ⚠️ تامبنیل ساخته نشد ({dst.name}): {e}")


def put_image(src, dest_dir, name):
    """یک عکس را به مقصد می‌نویسد (webp یا کپی عادی) و مسیر مقصد را برمی‌گرداند. منبع را دست نمی‌زند."""
    ext = src.suffix.lower()
    if CONVERT_TO_WEBP and Image is not None and ext not in (".webp", ".gif"):
        dst = dest_dir / f"{name}.webp"
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            _note_size(dst, im.size)
            has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
            im = im.convert("RGBA" if has_alpha else "RGB")
            im.save(dst, "WEBP", quality=WEBP_QUALITY)
    else:
        if ext in (".jpeg", ".jpe", ".jfif"):
            ext = ".jpg"
        if ext == "":
            ext = ".jpg"
        dst = dest_dir / f"{name}{ext}"
        if Image is not None:
            try:
                with Image.open(src) as _im:
                    _note_size(dst, _im.size)
            except Exception:
                pass
        shutil.copy2(src, dst)
    if not dst.exists() or dst.stat().st_size == 0:
        raise IOError("فایل مقصد ساخته نشد")
    make_thumb(dst)
    return dst


def is_candidate(p):
    """آیا این فایل احتمالاً عکس است؟ (پسوند شناخته‌شده یا بدون پسوند)"""
    if p.name.lower() in JUNK_FILES:
        return False
    ext = p.suffix.lower()
    return ext in IMG_EXT or ext == ""


def collect_images(folder):
    """همه‌ی عکس‌های داخل پوشه (حتی زیرپوشه‌ها) به ترتیب طبیعی."""
    out = []
    for dirpath, _dirs, files in os.walk(folder):
        for f in files:
            p = Path(dirpath) / f
            if is_candidate(p):
                out.append(p)
    return sorted(out, key=lambda p: natural_key(p.relative_to(folder).as_posix()))


def describe_folder(folder):
    """توضیح کوتاه محتوای پوشه‌ای که عکسی در آن پیدا نشد."""
    exts, subdirs = {}, 0
    for dirpath, dirs, files in os.walk(folder):
        subdirs += len(dirs)
        for f in files:
            e = Path(f).suffix.lower() or "(بدون پسوند)"
            exts[e] = exts.get(e, 0) + 1
    if not exts:
        return "پوشه خالی است" + (f" ({subdirs} زیرپوشه‌ی خالی)" if subdirs else "")
    return "فایل‌ها: " + "، ".join(f"{e}×{c}" for e, c in sorted(exts.items()))


def _clear_attrs(path):
    """ویندوز: ویژگی‌های Read-only/Hidden/System را برمی‌دارد (پوشه‌های دارای desktop.ini معمولاً Read-only هستند)."""
    try:
        if os.name == "nt":
            import ctypes
            ctypes.windll.kernel32.SetFileAttributesW(str(path), 0x80)  # NORMAL
        else:
            os.chmod(path, stat.S_IRWXU)
    except Exception:
        pass


def _force_remove(path, is_dir):
    fn = os.rmdir if is_dir else os.unlink
    try:
        fn(path)
    except PermissionError:
        _clear_attrs(path)
        fn(path)


def prune(folder):
    """پوشه‌های خالی (یا فقط حاوی desktop.ini …) را از پایین به بالا پاک می‌کند."""
    try:
        for dirpath, dirs, files in os.walk(folder, topdown=False):
            d = Path(dirpath)
            if any(is_candidate(d / f) for f in files):
                continue
            if any((d / x).exists() for x in dirs):
                continue
            for f in files:
                if f.lower() in JUNK_FILES:
                    _force_remove(d / f, False)
            if not any(d.iterdir()):
                _force_remove(d, True)
        p = folder.parent
        while p != RAW_DIR and p.exists() and not any(p.iterdir()):
            _force_remove(p, True)
            p = p.parent
    except Exception as e:
        print(f"   ⚠️ پوشه‌ی خالی پاک نشد ({folder.name}): {e}\n"
              f"      (احتمالاً پوشه در Explorer یا برنامه‌ی دیگری باز است؛ آن را ببندید و دوباره اجرا کنید، یا دستی پاک کنید. عکس‌ها سالم منتقل شده‌اند.)")


def find_image_folders(idx):
    """
    هر پوشه‌ی سطح اول raw/01 یک محصول است و همه‌ی عکس‌های داخلش (حتی زیرپوشه‌ها) مال همان محصول.
    اگر پوشه خودش عکس مستقیم ندارد و اسمش هم با md ای نمی‌خورد (مثلاً پوشه‌ی دسته‌بندی)،
    زیرپوشه‌هایش هر کدام یک محصول جدا حساب می‌شوند.
    """
    found, empty = [], []
    loose = sum(1 for f in RAW_DIR.iterdir() if f.is_file() and is_candidate(f) and f.suffix.lower() in IMG_EXT)
    for d in sorted((x for x in RAW_DIR.iterdir() if x.is_dir()), key=lambda x: natural_key(x.name)):
        imgs = collect_images(d)
        if not imgs:
            empty.append((d, describe_folder(d)))
            continue
        direct = [p for p in imgs if p.parent == d]
        if direct or norm(d.name) in idx:
            found.append((d, imgs))
        else:
            for dirpath, _dirs, _files in os.walk(d):
                leaf = Path(dirpath)
                if leaf == d:
                    continue
                li = collect_images(leaf)
                if [p for p in li if p.parent == leaf]:
                    found.append((leaf, [p for p in li]))
    return found, empty, loose


def load_aliases():
    """folder_map.csv: ستون‌های folder و slug؛ ردیف‌هایی که slug دارند اعمال می‌شوند."""
    out = {}
    if not MAP_CSV.exists():
        return out
    try:
        with open(MAP_CSV, "r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                fo, sl = (row.get("folder") or "").strip(), (row.get("slug") or "").strip()
                if fo and sl:
                    out[fo] = sl
    except Exception as e:
        print(f"⚠️ خواندن {MAP_CSV.name} ممکن نشد: {e}")
    return out


def save_todo(todo):
    """پوشه‌های ردشده را به folder_map.csv اضافه می‌کند (slug را خودتان پر کنید)."""
    present = {d.name for d in RAW_DIR.iterdir() if d.is_dir()} if RAW_DIR.exists() else set()
    if not todo and not MAP_CSV.exists():
        return
    rows, seen = [], set()
    if MAP_CSV.exists():
        try:
            with open(MAP_CSV, "r", encoding="utf-8-sig", newline="") as f:
                for r in csv.DictReader(f):
                    fo = (r.get("folder") or "").strip()
                    if fo:
                        if not (r.get("slug") or "").strip() and fo not in present:
                            continue  # ردیف خالی مربوط به پوشه‌ای که دیگر در raw/01 نیست
                        rows.append([r.get("folder", ""), r.get("slug", ""), r.get("suggestions", ""), r.get("images", "")])
                        seen.add(fo)
        except Exception:
            pass
    added = 0
    for fo, (sug, n) in todo.items():
        if fo not in seen:
            rows.append([fo, "", sug, n])
            added += 1
    try:
        with open(MAP_CSV, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(["folder", "slug", "suggestions", "images"])
            w.writerows(rows)
        if added:
            print(f"📝 {added} پوشه به {MAP_CSV.name} اضافه شد؛ ستون slug را پر کنید و دوباره اجرا کنید.")
    except Exception as e:
        print(f"⚠️ نوشتن {MAP_CSV.name} ممکن نشد: {e}")


# ───────────────────────── برنامه‌ی اصلی ─────────────────────────
def main():
    tag = "  [آزمایشی - هیچ تغییری اعمال نمی‌شود]" if DRY_RUN else ""
    print("=" * 62)
    print("  انتقال عکس‌های محصولات" + tag)
    print("=" * 62)

    if not RAW_DIR.exists():
        print(f"❌ پوشه عکس‌های خام پیدا نشد: {RAW_DIR}")
        return
    if not MD_ROOT.exists():
        print(f"❌ پوشه محصولات پیدا نشد: {MD_ROOT}")
        return
    if CONVERT_TO_WEBP and Image is None:
        print("⚠️ کتابخانه Pillow نصب نیست؛ عکس‌ها با فرمت اصلی منتقل می‌شوند.")
        print("   (برای تبدیل خودکار به webp:  pip install pillow)\n")

    # ترمیم md هایی که خط بستن فرانت‌متر (---) را گم کرده‌اند
    fixed = 0
    for md in sorted(MD_ROOT.rglob("*.md")):
        try:
            _, changed = repair_frontmatter(read_text(md))
        except Exception:
            continue
        if changed:
            fixed += 1
            if not DRY_RUN:
                fixed_text, _ = repair_frontmatter(read_text(md))
                write_text(md, fixed_text, has_bom(md))
    if fixed:
        print(f"🔧 {fixed} فایل md فرانت‌متر ناقص داشت (خط --- پایانی گم شده بود)"
              + (" و ترمیم شد.\n" if not DRY_RUN else "؛ در اجرای واقعی ترمیم می‌شود.\n"))

    idx = index_products()
    ALIASES.clear()
    ALIASES.update(load_aliases())
    print(f"📂 پوشه‌ی عکس‌ها: {RAW_DIR}")
    if ALIASES:
        print(f"🗺️ {len(ALIASES)} نگاشت دستی از {MAP_CSV.name} خوانده شد.")
    folders, empty, loose = find_image_folders(idx)
    print(f"🔍 {len(folders)} پوشه عکس در raw/01 و {sum(len(v) for v in idx.values())} کلید محصول پیدا شد.")
    if loose:
        print(f"ℹ️ {loose} عکس بدون پوشه مستقیم داخل raw/01 هست؛ رد شد (باید داخل پوشه‌ی هر محصول باشد).")
    print()

    report = []
    todo = {}
    for d, why in empty:
        only_junk = all(f.lower() in JUNK_FILES for _dp, _dn, fs in os.walk(d) for f in fs)
        if only_junk and not DRY_RUN:
            prune(d)
            if not d.exists():
                print(f"🧹 پوشه‌ی خالی «{d.name}» پاک شد.")
                continue
        print(f"⚠️ «{d.name}» هیچ عکس قابل‌استفاده‌ای ندارد؛ همان‌جا ماند — {why}")
        report.append([d.name, "عکس پیدا نشد", "", "", 0, 0, why])
    if empty:
        print()
    stats = dict(matched=0, samples=0, skipped=0, moved=0, left=0)

    for folder, images in folders:
        alias = ALIASES.get(folder.name, "")
        key = norm(alias) if alias else norm(folder.name)
        md, status = None, "none"
        if alias:
            print(f"   🗺️ «{folder.name}» طبق folder_map.csv → {key}")
        if key:
            md, status = pick_product(idx, key)
        else:
            # نام فارسی: فقط اگر دقیقاً با عنوان (title) یا old_slug یک md اصلی بخورد وصل می‌شود
            hits = PIDX.get(pnorm(folder.name), set())
            if len(hits) == 1:
                md, status = next(iter(hits)), "ok"
                print(f"   🔤 «{folder.name}» با عنوان فارسی md تطبیق داده شد.")
            else:
                near = difflib.get_close_matches(pnorm(folder.name), list(PIDX.keys()), n=3, cutoff=0.55)
                names = sorted({m.stem for m in hits} | {m.stem for k in near for m in PIDX[k]})
                sug = " | ".join(names)
                why = ("چند md با این عنوان فارسی مطابقت دارد" if len(hits) > 1 else "نام پوشه انگلیسی نیست")
                print(f"⚠️ «{folder.name}» اسم انگلیسی ندارد؛ همان‌جا ماند."
                      + (f" 💡 شبیه: {sug}" if sug else ""))
                report.append([folder.name, "رد شد", "", "", 0, len(images), why + (f" | شبیه: {sug}" if sug else "")])
                todo[folder.name] = (sug, len(images))
                stats["skipped"] += 1
                stats["left"] += len(images)
                continue
        if status == "ambiguous":
            print(f"⚠️ «{folder.name}» با چند md یکسان مطابقت دارد؛ همان‌جا ماند.")
            report.append([folder.name, "رد شد", "", "", 0, len(images), "چند md مطابق است"])
            todo[folder.name] = ("", len(images))
            stats["skipped"] += 1
            stats["left"] += len(images)
            continue

        created_sample = False
        if md is None:
            # هیچ md ای نیست → محصول نمونه
            cat = category_of(key)
            gen = gender_of(key, cat)
            md = SAMPLES_DIR / f"{key}.md"
            created_sample = True
            slug_dir = key
            known = []
            near = difflib.get_close_matches(key, list(idx.keys()), n=2, cutoff=0.85)
            if near:
                print(f"   💡 «{folder.name}» شبیه محصول(های) موجود است: {', '.join(near)} — اگر اشتباه تایپی است، نام پوشه را اصلاح کنید.")
        else:
            text = load_md(md)
            lines, end = split_frontmatter(text)
            _, _, known = existing_images(lines, end)
            # دسته و نام پوشه را از لینک‌های قبلی، وگرنه از فرانت‌متر می‌گیریم
            cat = slug_dir = None
            for u in known:
                if u.startswith(URL_PREFIX + "/"):
                    parts = u[len(URL_PREFIX) + 1:].split("/")
                    if len(parts) >= 3:
                        cat, slug_dir = parts[0], parts[1]
                        break
            if not cat:
                cat = fm_value(lines, end, "category") or md.parent.name
                if cat == "samples":
                    cat = category_of(key)
                slug_dir = norm(fm_value(lines, end, "slug") or fm_value(lines, end, "folder") or md.stem) or key

        dest_dir = DEST_ROOT / cat / slug_dir
        dest_url_dir = f"{URL_PREFIX}/{cat}/{slug_dir}/"
        n = max(next_number(dest_dir, known), PLANNED.get(dest_dir, 0))
        single = (n == 1 and len(images) == 1)  # تنها عکس محصول → بدون شماره

        label = "🆕 نمونه" if created_sample else "✅"
        print(f"{label} «{folder.name}» ← {md.relative_to(ROOT).as_posix()}  ({len(images)} عکس → {cat}/{slug_dir}/)")

        if DRY_RUN:
            PLANNED[dest_dir] = n + len(images)
            for k, img in enumerate(images):
                print(f"      {img.name}  →  {image_basename(slug_dir, n + k, single)}")
            report.append([folder.name, "نمونه (آزمایشی)" if created_sample else "وصل (آزمایشی)",
                           md.relative_to(ROOT).as_posix(), cat, len(images), 0, ""])
            stats["samples" if created_sample else "matched"] += 1
            stats["moved"] += len(images)
            continue

        dest_dir.mkdir(parents=True, exist_ok=True)
        done = []      # (src, dst, url)
        failed = []
        for img in images:
            try:
                dst = put_image(img, dest_dir, image_basename(slug_dir, n, single))
                done.append((img, dst, f"{URL_PREFIX}/{cat}/{slug_dir}/{dst.name}"))
                n += 1
            except Exception as e:
                failed.append(img)
                hint = "  (برای HEIC/AVIF:  pip install pillow-heif)" if img.suffix.lower() in (".heic", ".heif", ".avif") else ""
                print(f"   ❌ {img.name}: {e}  (همان‌جا ماند){hint}")

        if not done:
            try:
                dest_dir.rmdir()  # اگر تازه ساخته شده و خالی است پاک شود
                dest_dir.parent.rmdir()
            except OSError:
                pass
            report.append([folder.name, "ناموفق", md.relative_to(ROOT).as_posix(), cat, 0, len(images), "هیچ عکسی منتقل نشد"])
            stats["skipped"] += 1
            stats["left"] += len(images)
            continue

        urls = [u for _, _, u in done]
        try:
            if created_sample:
                SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
                write_text(md, make_sample_md(key, cat, gender_of(key, cat), urls))
                idx.setdefault(key, []).append((2, True, md))
            else:
                rewrite_md(md, urls, dest_url_dir)
        except Exception as e:
            # md ننوشته شد → عکس‌های تازه را برمی‌گردانیم و منبع را حفظ می‌کنیم
            print(f"   ❌ نوشتن md ناموفق بود ({e}); هیچ عکسی از raw حذف نشد.")
            for _, dst, _ in done:
                try:
                    dst.unlink()
                except Exception:
                    pass
            report.append([folder.name, "ناموفق", md.relative_to(ROOT).as_posix(), cat, 0, len(images), f"خطای md: {e}"])
            stats["skipped"] += 1
            stats["left"] += len(images)
            continue

        # فقط حالا که هم عکس و هم md سالم‌اند، منبع را حذف می‌کنیم
        for src, _, _ in done:
            try:
                src.unlink()
            except Exception as e:
                print(f"   ⚠️ حذف نشد: {src.name} ({e})")
        prune(folder)

        stats["samples" if created_sample else "matched"] += 1
        stats["moved"] += len(done)
        stats["left"] += len(failed)
        report.append([folder.name, "نمونه ساخته شد" if created_sample else "وصل شد",
                       md.relative_to(ROOT).as_posix(), cat, len(done), len(failed), ""])

    save_todo(todo)

    if not DRY_RUN:
        try:
            with open(REPORT_CSV, "w", encoding="utf-8-sig", newline="") as f:
                w = csv.writer(f)
                w.writerow(["folder", "result", "md", "category", "moved", "left_in_raw", "note"])
                w.writerows(report)
        except Exception as e:
            print(f"⚠️ گزارش CSV نوشته نشد: {e}")

    print()
    print("=" * 62)
    print(f"🎉 تمام شد{' (آزمایشی)' if DRY_RUN else ''}")
    print(f"   محصولات موجود که عکس گرفتند : {stats['matched']}")
    print(f"   محصول نمونه‌ی جدید          : {stats['samples']}")
    print(f"   عکس منتقل‌شده                : {stats['moved']}")
    print(f"   پوشه‌های ردشده               : {stats['skipped'] + len(empty)}")
    print(f"   عکس‌های باقی‌مانده در raw     : {stats['left']}")
    if not DRY_RUN:
        print(f"   گزارش: {REPORT_CSV.name}")
    print("=" * 62)
    if LOWRES:
        print(f"\n🔎 {len(LOWRES)} عکس کم‌وضوح است (عرض مؤثر < {LOW_RES_MIN_WIDTH}px) و در گالری/موبایل ممکن است مات دیده شود:")
        for dst, w, h in sorted(LOWRES, key=lambda t: min(t[1], t[2] * 3 / 4))[:20]:
            print(f"   {w}×{h}  {dst.relative_to(ROOT).as_posix()}")
        if len(LOWRES) > 20:
            print(f"   ... و {len(LOWRES) - 20} مورد دیگر (لیست کامل: images_low_res.csv)")
        try:
            with open(HERE / "images_low_res.csv", "w", encoding="utf-8-sig", newline="") as f:
                w_ = csv.writer(f)
                w_.writerow(["file", "width", "height"])
                for dst, w, h in LOWRES:
                    w_.writerow([dst.relative_to(ROOT).as_posix(), w, h])
        except Exception:
            pass
        print("   راه‌حل: عکس بزرگ‌تر (حداقل ۹۰۰×۱۲۰۰) جایگزین کنید.")


if __name__ == "__main__":
    main()
