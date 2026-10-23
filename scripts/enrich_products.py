#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
enrich_products.py — به‌روزرسانی خودکار فایل‌های محصول (_products/**/*.md)

کارهایی که انجام می‌دهد (فقط روی فایل‌های محصول):
  1. عنوان (title)  : اگر برای slug در product_catalog.TITLES عنوان تعریف شده باشد.
                      (محصول جدید با عنوان خودتان دست‌نخورده می‌ماند؛ برای ساخت خودکار از --retitle استفاده کنید.)
  2. هشتگ‌ها (tags) : از نوع محصول + شخصیت + مخاطب + مناسبت‌ها ساخته می‌شود.
  3. توضیحات (body) : فقط بین نشانگرهای  <!-- AUTO:START -->  و  <!-- AUTO:END -->  بازنویسی می‌شود.
                      هر چیزی که بیرون از نشانگرها بنویسید (مثلاً «نکات مهم») هرگز دست نمی‌خورد.
                      توضیحات دستی بلند (بیش از ۶۰۰ نویسه) و بدون نشانگر، دست‌نخورده می‌ماند.
  4. سایز/رنگ (options): اسم گزینه‌ها یکدست و قالب سایزها یکسان می‌شود (عدد/سن‌ها دست‌نمی‌خورند).
  5. description    : متای توضیحات برای گوگل (در front matter).

اجرا:
    python scripts/enrich_products.py --dry-run          # فقط گزارش، بدون نوشتن
    python scripts/enrich_products.py                    # اعمال روی همه
    python scripts/enrich_products.py --only girls/snow-white-dress.md
    python scripts/enrich_products.py --report scripts/report.csv
"""
import argparse, csv, glob, hashlib, json, os, re, sys
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import product_catalog as C

START, END = "<!-- AUTO:START -->", "<!-- AUTO:END -->"
MANUAL_BODY_MIN = 600           # بدنه‌ی دستیِ بلندتر از این، دست نمی‌خورد
MAX_TAGS = 12

NUM_WORDS = {"یک": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5, "شش": 6, "هفت": 7, "هشت": 8,
             "نه": 9, "ده": 10, "یازده": 11, "دوازده": 12, "سیزده": 13, "چهارده": 14,
             "پانزده": 15, "شانزده": 16}
OPTION_RENAME = {"آبی": "اندازه", "اندازهS": "اندازه", "سایز": "اندازه"}
SIZE_NAMES = {"اندازه", "سایز", "اندازهS"}
TYPO = {"پبراهن": "پیراهن", "ناخص": "ناخن", "شاملل": "شامل"}
PLACEHOLDER_BODY = "توضیحات محصول را اینجا بنویسید"


# ------------------------------------------------------------------ helpers
def tokens(slug):
    return "-" + slug.strip("-").lower() + "-"

def match_key(slug, keys):
    t = tokens(slug)
    return any(("-" + k + "-") in t for k in keys.split("|"))

def pick(options, slug, salt=""):
    h = int(hashlib.md5((slug + salt).encode()).hexdigest(), 16)
    return options[h % len(options)]

def find_char(slug):
    for key, name, world, tags in C.CHARS:
        if match_key(slug, key):
            return {"key": key, "name": name, "world": world, "tags": tags}
    return None

def char_by_key(key):
    for k, name, world, tags in C.CHARS:
        if k.split("|")[0] == key:
            return {"key": k, "name": name, "world": world, "tags": tags}
    return None

def find_kind(slug):
    ov = getattr(C, "KIND_OVERRIDE", {}).get(slug)
    if ov:
        slug = ov
    for key, name, tags, templates, occ in C.KINDS:
        if match_key(slug, key):
            return {"key": key, "name": name, "tags": tags, "templates": templates, "occ": occ}
    k = C.KINDS[-1]
    return {"key": k[0], "name": k[1], "tags": k[2], "templates": k[3], "occ": k[4]}

def dq(s):
    return json.dumps(s, ensure_ascii=False)

def strip_marks(s):
    return re.sub(r"[\u064B-\u065F\u0670]", "", s)

def fa_digits_to_en(s):
    return s.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789"))


# ------------------------------------------------------------------ options
def words_to_digits(s):
    for w, n in sorted(NUM_WORDS.items(), key=lambda x: -len(x[0])):
        s = re.sub(rf"(?<![\u0600-\u06FF]){w}(?![\u0600-\u06FF])", str(n), s)
    return s

def norm_age(a):
    a = fa_digits_to_en(words_to_digits(a))
    a = re.sub(r"^\s*(?:سن|مناسب)\s*", "", a).strip()
    a = re.sub(r"\s*(?:سال|ساله)\s*$", "", a).strip()
    a = re.sub(r"(\d)\s*-\s*(\d)", r"\1 تا \2", a)
    a = re.sub(r"(\d)تا(\d)", r"\1 تا \2", a)
    a = re.sub(r"\s+", " ", a)
    return a

def norm_size_value(v):
    v = strip_marks(str(v)).strip()
    if v.lower() in {"s", "m", "l", "xl", "xxl", "3xl", "4xl", "5xl"}:
        return v.upper()
    v1 = re.sub(r"\s+", " ", v)
    m = re.match(r"^(?:سایز\s*)?(?P<s>[A-Za-z0-9]{1,4})\s*-\s*(?:مناسب\s*)?(?P<a>.+)$", v1)
    if m and re.search(r"[\dآ-ی]", m["a"]):
        s, a = m["s"].upper(), norm_age(m["a"])
        if re.search(r"\d", a):
            return f"{s} - مناسب {a} سال"
    m = re.match(r"^(?P<a>.+?)\s*-\s*(?P<s>[A-Za-z]{1,4}|\d{2,3})$", v1)
    if m and re.search(r"(?:سال|تا)", m["a"]):
        a = norm_age(m["a"])
        if re.search(r"\d", a):
            return f"{m['s'].upper()} - مناسب {a} سال"
    return v1

def normalize_options(options):
    """returns (new_options, changed)"""
    if not options:
        return options, False
    new, changed = [], False
    for o in options:
        name = str(o.get("name", "")).strip()
        nname = OPTION_RENAME.get(name, name)
        vals = list(o.get("values") or [])
        if nname == "اندازه":
            vals2 = [norm_size_value(v) for v in vals]
        else:
            vals2 = [re.sub(r"\s+", " ", strip_marks(str(v))).strip() for v in vals]
        seen, vals3 = set(), []
        for v in vals2:
            if v and v not in seen:
                seen.add(v); vals3.append(v)
        if nname != name or vals3 != [str(v) for v in vals]:
            changed = True
        new.append({"name": nname, "values": vals3})
    return new, changed

def options_block(options):
    lines = ["options:"]
    for o in options:
        lines.append(f"  - name: {dq(o['name'])}")
        lines.append(f"    values: [{', '.join(dq(v) for v in o['values'])}]")
    return "\n".join(lines) + "\n"

def compact_values(vals):
    if len(vals) >= 4 and all(re.fullmatch(r"\d{1,3}", str(v)) for v in vals):
        n = [int(v) for v in vals]
        if n == list(range(n[0], n[0] + len(n))):
            return f"از {n[0]} تا {n[-1]}"
    return "، ".join(str(v) for v in vals)


# ------------------------------------------------------------------ content
def title_core(title):
    return re.split(r"\s*[|\-–]\s*", title)[0].strip() if "|" in title else title.strip()

def make_tags(fm, kind, char, title, old_tags):
    gender = fm.get("gender", "unisex")
    aud = C.AUDIENCE_FA.get(gender, "")
    cat = fm.get("category", "")
    tags = []
    core = title_core(title)
    tags.append(core)
    if char:
        tags.append(f"{kind['name']} {char['name']}")
        tags.append(f"{kind['name']} {char['name']} {aud}".strip())
        tags += char["tags"][:3]
    else:
        tags.append(f"{kind['name']} {aud}".strip())
    tags += kind["tags"][:3]
    if cat == "accessories" or cat == "crown-wand":
        tags += ["هدیه کودک", "اکسسوری تم"]
    if cat in ("girls", "boys"):
        tags += ["تم تولد", "لباس شخصیتی کودک"]
    tags += [t for t in (old_tags or []) if t in C.KEEP_TAGS]
    tags += C.STORE_TAGS
    seen, out = set(), []
    for t in tags:
        t = re.sub(r"\s+", " ", str(t)).strip()
        if t and t not in seen:
            seen.add(t); out.append(t)
    return out[:MAX_TAGS]

def make_meta_description(fm, kind, char, title, slug=""):
    core = title_core(title)
    occ = pick(kind["occ"], slug, "o")
    if char and char["name"] not in core:
        return f"{core} با طراحی الهام‌گرفته از {char['name']}. {occ} سفارش از {C.STORE_NAME}."
    return f"{core}؛ {occ} سفارش از {C.STORE_NAME}."

def clean_legacy(body, old_title):
    """خطوط توضیح قدیمی که واقعیت‌های محصول هستند را نگه می‌دارد."""
    out = []
    for line in body.replace("\r", "").split("\n"):
        t = line.strip()
        t = re.sub(r"^[-•*✔️✔\s]+", "", t).strip()
        for a, b in TYPO.items():
            t = t.replace(a, b)
        t = re.sub(r"(?<![\u0600-\u06FF])باس(?![\u0600-\u06FF])", "باید", t)
        if not t:
            continue
        if PLACEHOLDER_BODY in t or t in ("ویژگی ها", "ویژگی‌ها", "ویژگی‌ها:"):
            continue
        if t.startswith("#"):
            continue
        if "فروشگاه غریبی" in t:           # تکرار عنوان با نام فروشگاه
            continue
        if old_title and t == old_title.strip():
            continue
        if t not in out:
            out.append(t)
    return out

def build_auto_block(fm, slug, kind, char, options):
    gender = fm.get("gender", "unisex")
    ch = C.CHILD_FA.get(gender, "کودک شما")
    cname = char["name"] if char else "شخصیت‌های محبوب"
    world = char["world"] if char else C.GENERIC_WORLD
    tpl = pick(kind["templates"], slug, "t")
    occ = pick(kind["occ"], slug, "o")
    intro = tpl.format(ch=ch, c=cname, w=world, k=kind["name"])
    if not intro.endswith((".", "!", "؛", "؟")):
        intro += "."
    specs = [f"- **نوع محصول:** {kind['name']}"]
    if char:
        specs.append(f"- **تم / شخصیت:** {char['name']}")
    specs.append(f"- **مناسب برای:** {C.AUDIENCE_FA.get(gender, 'کودکان')}")
    for o in options or []:
        label = {"اندازه": "سایزبندی", "سن و سال": "سن و سال", "رنگ": "رنگ‌بندی"}.get(o["name"], o["name"])
        specs.append(f"- **{label}:** {compact_values(o['values'])}")
    lines = [START, "", intro, "", occ, "", "## مشخصات", ""] + specs + ["", END]
    return "\n".join(lines)


# ------------------------------------------------------------------ file i/o
FM_RE = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.S)

def set_scalar(fm_text, key, value_line):
    pat = re.compile(rf"^{key}:.*\n", re.M)
    if pat.search(fm_text):
        return pat.sub(lambda m: value_line + "\n", fm_text, count=1)
    return None

def insert_before(fm_text, anchor_pat, text):
    m = re.search(anchor_pat, fm_text, re.M)
    if m:
        return fm_text[:m.start()] + text + fm_text[m.start():]
    return fm_text + text

def process(path, args):
    raw = open(path, encoding="utf-8", newline="").read()
    crlf = "\r\n" in raw
    t = raw.replace("\r\n", "\n")
    m = FM_RE.match(t)
    if not m:
        return None, ["بدون front matter"]
    fm_text, body = m.group(1) + "\n", m.group(2)
    fm = yaml.safe_load(fm_text) or {}
    slug = str(fm.get("slug") or os.path.splitext(os.path.basename(path))[0])
    old_title = str(fm.get("title", ""))
    flags = []

    if "(محصول نمونه)" in old_title or PLACEHOLDER_BODY in body or fm.get("needs_review") is True and "محصول نمونه" in old_title:
        return None, ["محصول نمونه/ناقص — دست نخورد"]

    # ---- title / character override
    forced = C.TITLES.get(slug)
    forced_char = None
    if isinstance(forced, tuple):
        forced, forced_char = forced
    char = char_by_key(forced_char) if forced_char else find_char(slug)
    kind = find_kind(slug)
    new_title = old_title
    if forced:
        new_title = forced.replace(" | ", C.TITLE_SEP)
    elif args.retitle:
        aud = C.AUDIENCE_FA.get(fm.get("gender", "unisex"), "")
        new_title = f"{kind['name']} {char['name'] if char else ''} {C.TITLE_SEP.strip()} {aud}".replace("  ", " ").strip()
    elif not char:
        flags.append("شخصیت شناسایی نشد (توضیح عمومی)")

    # ---- options
    opts_old = fm.get("options")
    opts_new, opts_changed = normalize_options(opts_old)

    # ---- tags
    new_tags = make_tags(fm, kind, char, new_title, fm.get("tags"))

    # ---- front matter text edits
    fmt = fm_text
    fmt = set_scalar(fmt, "title", f"title: {dq(new_title)}") or fmt
    tag_line = f"tags: [{', '.join(dq(x) for x in new_tags)}]\n"
    tag_pat = re.compile(r"^tags:[^\n]*\n(?:[ \t]+-[^\n]*\n)*", re.M)
    if tag_pat.search(fmt):
        fmt = tag_pat.sub(lambda m: tag_line, fmt, count=1)
    else:
        fmt = insert_before(fmt, r"^images:", tag_line)
    desc_line = f"description: {dq(make_meta_description(fm, kind, char, new_title, slug))}\n"
    desc_pat = re.compile(r"^description:[^\n]*\n", re.M)
    if desc_pat.search(fmt):
        fmt = desc_pat.sub(lambda m: desc_line, fmt, count=1)
    else:
        fmt = re.sub(r"^(title:[^\n]*\n)", lambda m: m.group(1) + desc_line, fmt, count=1, flags=re.M)
    if opts_old and opts_changed:
        opt_pat = re.compile(r"^options:\n(?:[ \t]+[^\n]*\n)+", re.M)
        fmt = opt_pat.sub(lambda m: options_block(opts_new), fmt, count=1)

    # ---- body
    body_note = ""
    if START in body and END in body:
        auto = build_auto_block(fm, slug, kind, char, opts_new)
        new_body = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda m: auto, body, flags=re.S)
        body_note = "بازنویسی بین نشانگر"
    elif len(body.strip()) >= MANUAL_BODY_MIN:
        new_body = body
        body_note = "توضیح دستی حفظ شد"
    else:
        legacy = clean_legacy(body, old_title)
        auto = build_auto_block(fm, slug, kind, char, opts_new)
        new_body = "\n" + auto + "\n"
        if legacy:
            new_body += "\n## نکات مهم\n\n" + "\n".join(f"- {x}" for x in legacy) + "\n"
        body_note = "ساخته شد" + (f" + {len(legacy)} نکته‌ی قبلی" if legacy else "")

    head = "---\n" + fmt.rstrip("\n") + "\n---\n"
    out = head + ("\n" + body.lstrip("\n") if body_note == "توضیح دستی حفظ شد" else new_body)
    if crlf:
        out = out.replace("\n", "\r\n")

    info = dict(slug=slug, old_title=old_title, new_title=new_title,
                old_tags=len(fm.get("tags") or []), new_tags=len(new_tags),
                options_changed=opts_changed, body=body_note, char=char["name"] if char else "",
                kind=kind["name"], flags="; ".join(flags))
    return (out, info), flags


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="_products")
    ap.add_argument("--only")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--retitle", action="store_true", help="برای محصولاتی که عنوان دستی ندارند هم عنوان بسازد")
    ap.add_argument("--report")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.dir, "**", "*.md"), recursive=True))
    if args.only:
        files = [f for f in files if f.replace("\\", "/").endswith(args.only)]
    rows, skipped = [], []
    for f in files:
        res, flags = process(f, args)
        if res is None:
            skipped.append((f, flags)); continue
        out, info = res
        info["file"] = f
        rows.append(info)
        if not args.dry_run:
            with open(f, "w", encoding="utf-8", newline="") as fh:
                fh.write(out)
    print(f"{'[dry-run] ' if args.dry_run else ''}پردازش‌شده: {len(rows)} | ردشده: {len(skipped)}")
    for f, fl in skipped:
        print("  - رد شد:", f, fl)
    if args.report:
        with open(args.report, "w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["file", "slug", "old_title", "new_title", "old_tags", "new_tags",
                                               "options_changed", "body", "char", "kind", "flags"])
            w.writeheader(); w.writerows(rows)
        print("گزارش:", args.report)

if __name__ == "__main__":
    main()
