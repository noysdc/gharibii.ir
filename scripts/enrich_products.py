#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
enrich_products.py — به‌روزرسانی خودکار فایل‌های محصول (_products/**/*.md)

چه چیزهایی ساخته می‌شود (فقط روی فایل‌های محصول):
  1. عنوان (title)  : برای slugهایی که در product_catalog.TITLES عنوان دارند.
  2. هشتگ‌ها (tags) : از نوع محصول + شخصیت + مخاطب؛ هشتگ‌های شخصی را در  extra_tags  بنویسید.
  3. توضیحات (body) : فقط بین  <!-- AUTO:START -->  و  <!-- AUTO:END -->
  4. سایز/رنگ (options): نام گزینه‌ها و قالب سایزها یکدست می‌شود.
  5. description    : متای گوگل.

ویرایش دستی شما هرگز پاک نمی‌شود:
  • هر چیزی بیرون از نشانگرهای AUTO دست‌نخورده می‌ماند.
  • اگر title / tags / description یا متن داخل بلوک AUTO را خودتان تغییر دهید، اسکریپت آن بخش را
    تشخیص می‌دهد (با auto_sig در front matter) و دیگر بازنویسی نمی‌کند.
  • قفل صریح:   lock: [title, tags, description, options, body]   یا   lock: all
  • کل فایل را کنار بگذار:   auto: false
  • بازگشت به حالت خودکار برای یک محصول:   --only مسیر --force

اجرا:
    python scripts/enrich_products.py --dry-run          # فقط گزارش
    python scripts/enrich_products.py                    # اعمال روی همه
    python scripts/enrich_products.py --only girls/snow-white-dress.md
    python scripts/enrich_products.py --only girls/snow-white-dress.md --force
    python scripts/enrich_products.py --report scripts/report.csv
"""
import argparse, csv, glob, hashlib, json, os, re, sys
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import product_catalog as C

START, END = "<!-- AUTO:START -->", "<!-- AUTO:END -->"
MANUAL_BODY_MIN = 600           # بدنه‌ی دستیِ بلندتر از این، دست نمی‌خورد
MAX_TAGS = 18          # شامل ۲ هشتگ فروشگاه

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

def kind_group(kind):
    return C.KIND_GROUP.get(kind["key"], "accessory")

def occasions_for(slug, kind, char, fm):
    """مناسبت‌های مرتبط با محصول (حداکثر ۶) بر اساس نوع، شخصیت و مخاطب."""
    g = kind_group(kind)
    k = kind["key"]
    gender = fm.get("gender", "unisex")
    ck = char["key"].split("|")[0] if char else ""
    hallo = ck in C.HALLOWEEN_CHARS
    winter = ck in C.WINTER_CHARS

    if g == "swim":
        occ = ["pool", "travel", "photo", "gift"]
    elif k.startswith("ballet-shoes"):
        occ = ["ballet", "stage", "gift"]
    elif g == "carry":
        occ = ["daily", "travel", "gift"]
    elif g == "daily":
        if k.startswith("skirt") and "ballet" in slug:
            occ = ["ballet", "stage", "party", "photo", "gift"]
        elif k.startswith("skirt"):
            occ = ["party", "nowruz", "photo", "gift"]
        elif k.startswith("shirt"):
            occ = ["travel", "party", "photo", "gift"]
        else:
            occ = ["daily", "party", "gift"]
    elif g == "costume":
        if k.startswith("gymnastics"):
            occ = ["ballet", "stage", "gift"]
        elif k.startswith("bodysuit"):
            occ = ["birthday", "photo", "party", "gift"]
        elif k.startswith("muscle") or k.startswith("jumpsuit"):
            occ = ["birthday", "halloween", "roleplay", "party", "photo"]
        elif "comfort-set" in k and "comfort" in slug:
            occ = ["daily", "travel", "gift"]
        elif "harry-potter" in slug and k.startswith("moana-set"):
            occ = ["birthday", "halloween", "stage", "roleplay", "photo"]
        elif k.startswith("ballet"):
            occ = ["ballet", "stage", "birthday", "photo", "party"]
            if hallo: occ.insert(2, "halloween")
        elif k.startswith(("formal", "lace")):
            occ = (["birthday", "halloween", "party", "photo", "roleplay"] if hallo
                   else ["birthday", "party", "nowruz", "wedding", "photo", "yalda"])
        elif k.startswith("long-dress") and "linen" in slug:
            occ = ["party", "nowruz", "travel", "photo"]
        else:
            occ = (["birthday", "halloween", "party", "photo", "roleplay"] if hallo
                   else ["birthday", "party", "nowruz", "photo", "roleplay"])
        if winter and "christmas" not in occ:
            occ.insert(2, "christmas")
        occ.append("gift")
    else:  # accessory
        if k.startswith(("face-mask", "cape-mask", "wings", "web-shooter")) or hallo:
            occ = ["birthday", "halloween", "roleplay", "photo", "party"]
        elif k.startswith(("crown", "hair-clip", "wig", "tinsel", "accessory-set", "gloves", "necklace", "nails")):
            occ = ["birthday", "party", "nowruz", "photo", "roleplay"]
        elif k.startswith("wand"):
            occ = ["birthday", "halloween", "roleplay", "photo"]
        elif k.startswith(("cap", "hat", "moving-ear")):
            occ = ["daily", "party", "birthday"]
        elif k.startswith("keychain"):
            occ = ["gift", "daily", "birthday"]
        else:
            occ = ["birthday", "party", "photo", "roleplay"]
        occ.append("gift")
    seen, out = set(), []
    for o in occ:
        if o not in seen:
            seen.add(o); out.append(o)
    # gift همیشه آخر
    if "gift" in out:
        out.remove("gift"); out.append("gift")
    return out[:6]

def make_tags(fm, kind, char, title, old_tags, slug=""):
    gender = fm.get("gender", "unisex")
    aud = C.AUDIENCE_FA.get(gender, "")
    g = kind_group(kind)
    core = title_core(title)
    tags = [core]
    if char:
        tags += [f"{kind['name']} {char['name']}", f"{kind['name']} {char['name']} {aud}".strip()]
        tags += char["tags"][:3]
    else:
        tags.append(f"{kind['name']} {aud}".strip())
    tags += kind["tags"][:2]
    # مناسبت‌ها: هشتگ اصلی هر مناسبت + هشتگ ترکیبی («لباس هالووین پسرانه»)
    for o in occasions_for(slug, kind, char, fm):
        d = C.OCCASIONS[o]
        tags.append(d["tags"][0])
        if d["combo"] and g == "costume":
            tags.append(f"لباس {d['combo']} {aud}".strip())
        elif d["combo"] and g == "accessory":
            tags.append(f"اکسسوری {d['combo']}")
    for o in occasions_for(slug, kind, char, fm):
        tags += C.OCCASIONS[o]["tags"][1:2]
    kept = [t for t in (old_tags or []) if t in C.KEEP_TAGS]
    seen, body = set(), []
    for t in tags:
        t = re.sub(r"\s+", " ", str(t)).strip()
        if t and t not in seen:
            seen.add(t); body.append(t)
    cap = MAX_TAGS - len(C.STORE_TAGS)
    missing = [t for t in kept if t not in body[:cap]]
    body = body[:cap - len(missing)]
    out = body + [t for t in kept if t not in body]
    out += [t for t in C.STORE_TAGS if t not in out]
    return out

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
    fmt = dict(ch=ch, c=cname, w=world, k=kind["name"])
    gname = kind_group(kind)
    grp = C.GROUP_TEXT[gname]

    intro = pick(kind["templates"], slug, "t").format(**fmt)
    if not intro.endswith((".", "!", "؛", "؟")):
        intro += "."
    occ_sentence = pick(kind["occ"], slug, "o")
    detail = pick(grp["detail"], slug, "d").format(**fmt)
    extra = pick(C.GROUP_EXTRA[gname], slug, "x").format(**fmt)
    style = grp["style"].get(gender, grp["style"]["unisex"])
    gift = pick(C.GIFT, slug, "g")

    occ_keys = occasions_for(slug, kind, char, fm)
    occ_lines = [C.OCCASIONS[o]["text"].format(**fmt) for o in occ_keys if C.OCCASIONS[o]["text"]]

    specs = [f"- **نوع محصول:** {kind['name']}"]
    if char:
        specs.append(f"- **تم / شخصیت:** {char['name']}")
    specs.append(f"- **مناسب برای:** {C.AUDIENCE_FA.get(gender, 'کودکان')}")
    has_size = False
    for o in options or []:
        label = {"اندازه": "سایزبندی", "سن و سال": "سن و سال", "رنگ": "رنگ‌بندی"}.get(o["name"], o["name"])
        specs.append(f"- **{label}:** {compact_values(o['values'])}")
        if o["name"] in ("اندازه", "سن و سال"):
            has_size = True

    guide = [style]
    if has_size:
        guide.insert(0, pick(C.SIZE_ADVICE, slug, "s"))
    guide += [gift, C.ORDER_LINE]

    lines = [START, "",
             "## درباره‌ی این محصول", "", intro, "", occ_sentence + " " + detail, "", extra, "",
             "## مناسب چه مناسبت‌هایی؟", ""] + [f"- {x}" for x in occ_lines] + ["",
             "## مشخصات", ""] + specs + ["",
             "## راهنمای انتخاب و ست کردن", ""] + [g + "\n" for g in guide] + [END]
    return "\n".join(lines)


# ------------------------------------------------------------------ file i/o
FM_RE = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.S)
BLOCK_RE = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
ALL_FIELDS = {"title", "tags", "description", "options", "body"}

def h(s):
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:8]

def parse_sig(v):
    d = {}
    for part in str(v or "").split(";"):
        if "=" in part:
            k, x = part.split("=", 1)
            d[k.strip()] = x.strip()
    return d

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

def get_lock(fm):
    v = fm.get("lock")
    if v in (None, False, ""):
        return set()
    if isinstance(v, str):
        v = [x.strip() for x in v.split(",")]
    v = {str(x).strip() for x in v}
    return set(ALL_FIELDS) if "all" in v else v & ALL_FIELDS

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
    flags, kept = [], []

    if fm.get("auto") is False:
        return None, ["auto: false — دست نخورد"]
    if "(محصول نمونه)" in old_title or PLACEHOLDER_BODY in body:
        return None, ["محصول نمونه/ناقص — دست نخورد"]

    lock = get_lock(fm)
    sig = parse_sig(fm.get("auto_sig"))
    new_sig = dict(sig)

    def user_edited(key, current):
        """اگر مقدار فعلی با آخرین مقدارِ تولیدشده‌ی اسکریپت فرق کند، یعنی خودتان ویرایش کرده‌اید."""
        return (not args.force) and key in sig and h(current) != sig[key]

    # ---- شخصیت و نوع
    forced = C.TITLES.get(slug)
    forced_char = None
    if isinstance(forced, tuple):
        forced, forced_char = forced
    char = char_by_key(forced_char) if forced_char else find_char(slug)
    kind = find_kind(slug)
    gen_title = None
    if forced:
        gen_title = forced.replace(" | ", C.TITLE_SEP)
    elif args.retitle:
        aud = C.AUDIENCE_FA.get(fm.get("gender", "unisex"), "")
        gen_title = f"{kind['name']} {char['name'] if char else ''} {C.TITLE_SEP.strip()} {aud}".replace("  ", " ").strip()
    elif not char:
        flags.append("شخصیت شناسایی نشد (توضیح عمومی)")

    # ---- options (همیشه یکدست می‌شود، مگر قفل باشد)
    opts_old = fm.get("options")
    if "options" in lock:
        opts_new, opts_changed = opts_old, False
        kept.append("options(lock)")
    else:
        opts_new, opts_changed = normalize_options(opts_old)

    # ---- title
    new_title = old_title
    if gen_title is not None:
        if "title" in lock:
            kept.append("title(lock)")
        elif user_edited("t", old_title):
            kept.append("title(ویرایش دستی)")
        else:
            new_title = gen_title
            new_sig["t"] = h(gen_title)
    title_for_text = new_title

    # ---- tags
    extras = [str(x) for x in (fm.get("extra_tags") or [])]
    cur_tags = [str(x) for x in (fm.get("tags") or [])]
    gen_tags = make_tags(fm, kind, char, title_for_text, cur_tags, slug)
    gen_tags = gen_tags + [e for e in extras if e not in gen_tags]
    new_tags = gen_tags
    if "tags" in lock:
        new_tags = cur_tags; kept.append("tags(lock)")
    elif cur_tags and user_edited("g", "|".join(cur_tags)):
        new_tags = cur_tags; kept.append("tags(ویرایش دستی)")
    else:
        new_sig["g"] = h("|".join(gen_tags))

    # ---- description (متای گوگل)
    cur_desc = str(fm.get("description", "") or "")
    gen_desc = make_meta_description(fm, kind, char, title_for_text, slug)
    new_desc = gen_desc
    if "description" in lock:
        new_desc = cur_desc; kept.append("description(lock)")
    elif cur_desc and user_edited("d", cur_desc):
        new_desc = cur_desc; kept.append("description(ویرایش دستی)")
    else:
        new_sig["d"] = h(gen_desc)

    # ---- body
    body_note = ""
    new_body = body
    if "body" in lock:
        body_note = "قفل (lock)"; kept.append("body(lock)")
    elif START in body and END in body:
        cur_block = BLOCK_RE.search(body).group(0)
        if user_edited("b", cur_block):
            body_note = "ویرایش دستیِ داخل بلوک حفظ شد"; kept.append("body(ویرایش دستی)")
        else:
            auto = build_auto_block(fm, slug, kind, char, opts_new)
            new_body = BLOCK_RE.sub(lambda m: auto, body, count=1)
            new_sig["b"] = h(auto)
            body_note = "بازنویسی بین نشانگر"
    elif "auto_sig" in fm or len(body.strip()) >= MANUAL_BODY_MIN:
        body_note = "توضیح دستی حفظ شد"
    else:
        legacy = clean_legacy(body, old_title)
        auto = build_auto_block(fm, slug, kind, char, opts_new)
        new_body = "\n" + auto + "\n"
        if legacy:
            new_body += "\n## نکات مهم\n\n" + "\n".join(f"- {x}" for x in legacy) + "\n"
        new_sig["b"] = h(auto)
        body_note = "ساخته شد" + (f" + {len(legacy)} نکته‌ی قبلی" if legacy else "")

    # ---- front matter text edits
    fmt = fm_text
    if new_title != old_title:
        fmt = set_scalar(fmt, "title", f"title: {dq(new_title)}") or fmt
    tag_line = f"tags: [{', '.join(dq(x) for x in new_tags)}]\n"
    tag_pat = re.compile(r"^tags:[^\n]*\n(?:[ \t]+-[^\n]*\n)*", re.M)
    if tag_pat.search(fmt):
        fmt = tag_pat.sub(lambda m: tag_line, fmt, count=1)
    else:
        fmt = insert_before(fmt, r"^images:", tag_line)
    desc_line = f"description: {dq(new_desc)}\n"
    desc_pat = re.compile(r"^description:[^\n]*\n", re.M)
    if desc_pat.search(fmt):
        fmt = desc_pat.sub(lambda m: desc_line, fmt, count=1)
    else:
        fmt = re.sub(r"^(title:[^\n]*\n)", lambda m: m.group(1) + desc_line, fmt, count=1, flags=re.M)
    if opts_old and opts_changed:
        opt_pat = re.compile(r"^options:\n(?:[ \t]+[^\n]*\n)+", re.M)
        fmt = opt_pat.sub(lambda m: options_block(opts_new), fmt, count=1)
    sig_line = 'auto_sig: "' + ";".join(f"{k}={v}" for k, v in sorted(new_sig.items())) + '"\n'
    sig_pat = re.compile(r"^auto_sig:[^\n]*\n", re.M)
    if sig_pat.search(fmt):
        fmt = sig_pat.sub(lambda m: sig_line, fmt, count=1)
    else:
        fmt = insert_before(fmt, r"^images:", sig_line)

    head = "---\n" + fmt.rstrip("\n") + "\n---\n"
    out = head + ("\n" + body.lstrip("\n") if body_note in ("توضیح دستی حفظ شد", "قفل (lock)") else new_body)
    if crlf:
        out = out.replace("\n", "\r\n")

    info = dict(slug=slug, old_title=old_title, new_title=new_title,
                old_tags=len(cur_tags), new_tags=len(new_tags),
                options_changed=opts_changed, body=body_note, char=char["name"] if char else "",
                kind=kind["name"], kept_manual=", ".join(kept), flags="; ".join(flags))
    return (out, info), flags


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="_products")
    ap.add_argument("--only", help="فقط یک فایل، مثل girls/snow-white-dress.md")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--retitle", action="store_true", help="برای محصولاتی که عنوان دستی ندارند هم عنوان بسازد")
    ap.add_argument("--force", action="store_true", help="ویرایش‌های دستی را نادیده بگیر و دوباره تولید کن (lock حفظ می‌شود)")
    ap.add_argument("--report")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.dir, "**", "*.md"), recursive=True))
    if args.only:
        files = [f for f in files if f.replace("\\", "/").endswith(args.only.replace("\\", "/"))]
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
    kept_rows = [r for r in rows if r["kept_manual"]]
    if kept_rows:
        print(f"ویرایش دستی/قفل حفظ شد در {len(kept_rows)} فایل:")
        for r in kept_rows:
            print("  -", r["slug"], "→", r["kept_manual"])
    if args.report:
        with open(args.report, "w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["file", "slug", "old_title", "new_title", "old_tags", "new_tags",
                                               "options_changed", "body", "char", "kind", "kept_manual", "flags"])
            w.writeheader(); w.writerows(rows)
        print("گزارش:", args.report)

if __name__ == "__main__":
    main()
