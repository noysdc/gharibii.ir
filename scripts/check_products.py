#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_products.py — فقط «گزارش» می‌دهد؛ هیچ فایلی را تغییر نمی‌دهد.

  • عکس: پیدا نشد / خالی / خراب / بدون عکس / نام‌فایل مشکل‌دار / تکراری
  • تکراری‌ها: slug، old_slug، webzi_id، عنوان یکسان یا خیلی شبیه، عکس مشترک بین محصولات،
               آپشن+قیمت یکسان با عنوان شبیه
  • لینک: old_slug مشکل‌دار (تکراری، شبیه slug محصول دیگر، فاصله/حرف بزرگ)، لینک‌های داخل متن
          (با --online لینک‌های http(s) واقعاً باز می‌شوند؛ aliexpress معمولاً ربات را رد می‌کند)
  • نشانگرهای خودتان: needs_review / needs_folder / fake_id / بدون قیمت

اجرا (از ریشه‌ی ریپو):
    python scripts/check_products.py
    python scripts/check_products.py --online
خروجی: scripts/check_report.md  و  scripts/check_report.csv
"""
import argparse, csv, difflib, glob, hashlib, os, re, sys, urllib.request, urllib.error
from collections import defaultdict
import yaml

IMG_EXT = {".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif", ".svg"}
SEV = {"high": "🔴 مهم", "medium": "🟠 بررسی کن", "low": "🟡 هشدار"}


def norm_title(t):
    t = str(t).replace("\u200c", "").replace("|", " ")
    return re.sub(r"\s+", " ", t).strip().lower()

def read_fm(path):
    t = open(path, encoding="utf-8", newline="").read().replace("\r\n", "\n")
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", t, re.S)
    if not m:
        return None, t
    try:
        return (yaml.safe_load(m.group(1) + "\n") or {}), m.group(2)
    except Exception as e:
        return {"__yaml_error__": str(e)}, m.group(2)

def to_list(v):
    if v is None: return []
    return list(v) if isinstance(v, (list, tuple)) else [v]

def file_md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def image_problem(path):
    """None اگر سالم بود، وگرنه شرح مشکل."""
    try:
        size = os.path.getsize(path)
        if size == 0:
            return "فایل خالی (۰ بایت)"
        with open(path, "rb") as f:
            head = f.read(16)
        ext = os.path.splitext(path)[1].lower()
        ok = True
        if ext in (".jpg", ".jpeg"): ok = head[:3] == b"\xff\xd8\xff"
        elif ext == ".png": ok = head[:4] == b"\x89PNG"
        elif ext == ".webp": ok = head[:4] == b"RIFF" and head[8:12] == b"WEBP"
        elif ext == ".gif": ok = head[:4] == b"GIF8"
        if not ok:
            return "محتوای فایل با پسوندش جور نیست (احتمالاً خراب)"
        if size < 100 and ext != ".svg":
            return f"حجم بسیار کم ({size} بایت)، احتمالاً خراب"
        try:
            from PIL import Image
            with Image.open(path) as im:
                im.verify()
        except ImportError:
            pass
        except Exception:
            return "باز نمی‌شود (خراب)"
    except OSError as e:
        return f"خطا در خواندن: {e}"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="ریشه‌ی ریپو (جایی که assets و _products هست)")
    ap.add_argument("--dir", default="_products")
    ap.add_argument("--out", default="scripts/check_report")
    ap.add_argument("--online", action="store_true", help="لینک‌های http(s) داخل متن را آنلاین بررسی کن")
    ap.add_argument("--similar", type=float, default=0.9, help="آستانه‌ی شباهت عنوان (۰ تا ۱)")
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    pdir = os.path.join(root, args.dir)
    files = sorted(glob.glob(os.path.join(pdir, "**", "*.md"), recursive=True))
    if not files:
        print("هیچ فایل محصولی در", pdir, "پیدا نشد. اسکریپت را از ریشه‌ی ریپو اجرا کنید."); sys.exit(1)
    assets_ok = os.path.isdir(os.path.join(root, "assets"))

    issues = []   # (sev, type, slug, file, detail)
    def add(sev, typ, p, detail):
        issues.append((sev, typ, p["slug"], p["rel"], detail))

    prods = []
    for f in files:
        fm, body = read_fm(f)
        rel = os.path.relpath(f, pdir).replace("\\", "/")
        if fm is None:
            prods.append(dict(slug=rel, rel=rel, fm={}, body="", bad=True)); continue
        slug = str(fm.get("slug") or os.path.splitext(os.path.basename(f))[0])
        prods.append(dict(slug=slug, rel=rel, fm=fm, body=body, bad=False, file=f))

    # ---------------------------------------------------------- ساختار و نشانگرها
    for p in prods:
        fm = p["fm"]
        if p.get("bad"):
            add("high", "فایل بدون front matter", p, "ابتدای فایل باید --- باشد"); continue
        if "__yaml_error__" in fm:
            add("high", "خطای YAML", p, fm["__yaml_error__"].replace("\n", " ")[:200]); continue
        stem = os.path.splitext(os.path.basename(p["rel"]))[0]
        if fm.get("slug") and str(fm["slug"]) != stem:
            add("low", "slug با نام فایل فرق دارد", p, f"slug={fm['slug']} | فایل={stem}")
        if not fm.get("slug"):
            add("low", "slug ندارد", p, f"از نام فایل استفاده می‌شود ({stem})")
        if re.search(r"[^A-Za-z0-9_\-.]", p["slug"]):
            add("medium", "slug کاراکتر غیرمجاز دارد", p, p["slug"])
        for k in fm:
            if re.search(r"\s", str(k)):
                add("medium", "نام فیلد front matter فاصله دارد (احتمالاً غلط‌املایی)", p, f"«{k}» — شاید «{re.sub(chr(32), '_', str(k))}» منظور بوده")
        price = str(fm.get("price", "")).replace(",", "").strip()
        if price in ("", "0", "None"):
            add("medium", "قیمت ندارد", p, f"price={fm.get('price')!r}")
        for k, label in (("needs_review", "علامت needs_review"), ("needs_folder", "علامت needs_folder"),
                         ("fake_id", "علامت fake_id (id فرضی)")):
            if fm.get(k) is True:
                add("low", label, p, "خودتان این علامت را گذاشته‌اید")
        if "(محصول نمونه)" in str(fm.get("title", "")):
            add("medium", "محصول نمونه/ناقص", p, str(fm.get("title")))

    # ---------------------------------------------------------- عکس‌ها
    img_hash = defaultdict(list)       # md5 -> [(slug, path)]
    img_path_use = defaultdict(set)    # path -> {slug}
    prod_imgs = {}
    for p in prods:
        if p.get("bad") or "__yaml_error__" in p["fm"]:
            continue
        fm = p["fm"]
        imgs = [str(x) for x in to_list(fm.get("images"))]
        dirs = [str(x) for x in to_list(fm.get("images_dirs"))]
        prod_imgs[p["slug"]] = imgs
        for x in imgs:
            img_path_use[x].add(p["slug"])
        if len(imgs) != len(set(imgs)):
            add("low", "عکس تکراری داخل همین محصول", p, "یک مسیر چند بار آمده")
        for x in imgs:
            if re.search(r"[\s\u0600-\u06FF]", x):
                add("medium", "نام/مسیر عکس فاصله یا حرف فارسی دارد", p, x)
            if os.path.splitext(x)[1].lower() not in IMG_EXT:
                add("medium", "پسوند عکس نامعتبر", p, x)
        if not assets_ok:
            continue
        found_any = False
        for x in imgs:
            ap_ = os.path.join(root, x.lstrip("/").replace("/", os.sep))
            if not os.path.isfile(ap_):
                add("high", "عکس پیدا نشد", p, x)
                continue
            found_any = True
            pr = image_problem(ap_)
            if pr:
                add("high", "عکس خراب", p, f"{x} — {pr}")
            else:
                img_hash[file_md5(ap_)].append((p["slug"], x))
        for d in dirs:
            dp = os.path.join(root, d.strip("/").replace("/", os.sep))
            if not os.path.isdir(dp):
                add("high" if not imgs else "medium", "پوشه‌ی عکس پیدا نشد", p, d)
                continue
            inside = [n for n in os.listdir(dp) if os.path.splitext(n)[1].lower() in IMG_EXT]
            if not inside:
                add("high" if not imgs else "medium", "پوشه‌ی عکس خالی است", p, d)
            else:
                found_any = True
                for n in inside:
                    rel_ = d.rstrip('/') + '/' + n
                    if rel_ in imgs or rel_.lstrip('/') in [i.lstrip('/') for i in imgs]:
                        continue   # قبلاً از لیست images بررسی شده
                    full = os.path.join(dp, n)
                    pr = image_problem(full)
                    if pr:
                        add("high", "عکس خراب", p, f"{rel_} — {pr}")
                    else:
                        img_hash[file_md5(full)].append((p["slug"], rel_))
        if not imgs and not dirs:
            add("high", "هیچ عکسی تعریف نشده", p, "نه images دارد نه images_dirs")
        elif not found_any:
            add("high", "هیچ عکس قابل‌استفاده‌ای ندارد", p, "همه‌ی مسیرها مشکل دارند")
    if not assets_ok:
        issues.append(("low", "بررسی عکس انجام نشد", "-", "-",
                       "پوشه‌ی assets در ریشه پیدا نشد؛ اسکریپت را از ریشه‌ی ریپو اجرا کنید یا --root بدهید"))

    # ---------------------------------------------------------- تکراری‌ها
    by_slug = defaultdict(list)
    for p in prods: by_slug[p["slug"]].append(p)
    for s, lst in by_slug.items():
        if len(lst) > 1:
            for p in lst:
                add("high", "slug تکراری", p, "همراه با: " + ", ".join(x["rel"] for x in lst if x is not p))

    def group(field, label, sev, transform=str):
        g = defaultdict(list)
        for p in prods:
            if p.get("bad") or "__yaml_error__" in p["fm"]: continue
            v = p["fm"].get(field)
            for x in (to_list(v) if field == "webzi_images" else [v]):
                if x not in (None, "", []):
                    g[transform(x)].append(p)
        for k, lst in g.items():
            uniq = {id(x): x for x in lst}.values()
            if len(uniq) > 1:
                for p in uniq:
                    add(sev, label, p, f"{k} — همراه با: " + ", ".join(x["slug"] for x in uniq if x is not p))
    group("old_slug", "old_slug تکراری (تداخل ریدایرکت)", "high")
    group("webzi_id", "webzi_id تکراری", "medium")
    # عکس وبزی مشترک — یک ردیف برای هر محصول، با تعداد عکس مشترک
    wb = defaultdict(set)
    for p in prods:
        if p.get("bad") or "__yaml_error__" in p["fm"]: continue
        for x in to_list(p["fm"].get("webzi_images")):
            wb[str(x)].add(p["slug"])
    shared = defaultdict(lambda: defaultdict(int))
    for x, owners in wb.items():
        if len(owners) > 1:
            for o in owners:
                for o2 in owners:
                    if o != o2: shared[o][o2] += 1
    for s_, others in shared.items():
        add("medium", "عکس وبزی مشترک با محصول دیگر", by_slug[s_][0],
            "؛ ".join(f"{k} ({v} عکس مشترک)" for k, v in sorted(others.items())))

    # پوشه‌ی عکس مشترک (images_dirs یکسان در چند محصول)
    dirs_use = defaultdict(list)
    for p in prods:
        if p.get("bad") or "__yaml_error__" in p["fm"]: continue
        for d in to_list(p["fm"].get("images_dirs")):
            dirs_use[str(d).strip("/")].append(p)
    for d, lst in dirs_use.items():
        if len(lst) > 1:
            for p in lst:
                add("medium", "پوشه‌ی عکس (images_dirs) مشترک بین چند محصول", p,
                    f"{d}/ — همراه با: " + ", ".join(x["slug"] for x in lst if x is not p))

    # old_slug برابر slug یک محصول دیگر
    all_slugs = {p["slug"] for p in prods}
    for p in prods:
        if p.get("bad") or "__yaml_error__" in p["fm"]: continue
        o = p["fm"].get("old_slug")
        if o:
            o = str(o)
            if o in all_slugs and o != p["slug"]:
                add("high", "old_slug برابر slug محصول دیگر", p, o)
            if o == p["slug"]:
                add("medium", "old_slug برابر slug فعلی (ریدایرکت بی‌معنی)", p, o)
            if re.search(r"\s|[A-Z]", o):
                add("medium", "old_slug فاصله/حرف بزرگ دارد", p, o)
        elif p["fm"].get("webzi_id"):
            add("low", "webzi_id دارد ولی old_slug ندارد (ریدایرکت ساخته نمی‌شود؟)", p, str(p["fm"].get("webzi_id")))

    # عنوان یکسان / شبیه
    valid = [p for p in prods if not p.get("bad") and "__yaml_error__" not in p["fm"]]
    nt = {p["slug"]: norm_title(p["fm"].get("title", "")) for p in valid}
    byt = defaultdict(list)
    for p in valid: byt[nt[p["slug"]]].append(p)
    for t, lst in byt.items():
        if t and len(lst) > 1:
            for p in lst:
                add("high", "عنوان دقیقاً یکسان", p, "همراه با: " + ", ".join(x["slug"] for x in lst if x is not p))
    seen_pairs = set()
    for i in range(len(valid)):
        for j in range(i + 1, len(valid)):
            a, b = valid[i], valid[j]
            ta, tb = nt[a["slug"]], nt[b["slug"]]
            if not ta or not tb or ta == tb: continue
            if a["fm"].get("category") != b["fm"].get("category"): continue
            r = difflib.SequenceMatcher(None, ta, tb).ratio()
            wa, wb_ = set(ta.split()), set(tb.split())
            jac = len(wa & wb_) / max(1, len(wa | wb_))
            if r >= args.similar and jac >= 0.8:
                seen_pairs.add((a["slug"], b["slug"]))
                add("medium", "عنوان خیلی شبیه", a, f"{b['slug']} (شباهت {int(r*100)}٪) | «{a['fm'].get('title')}» ↔ «{b['fm'].get('title')}»")

    # آپشن + قیمت یکسان با عنوان نسبتاً شبیه
    def sig(p):
        return (str(p["fm"].get("price")), repr(p["fm"].get("options")))
    bysig = defaultdict(list)
    for p in valid:
        if p["fm"].get("options"): bysig[sig(p)].append(p)
    for k, lst in bysig.items():
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                a, b = lst[i], lst[j]
                if (a["slug"], b["slug"]) in seen_pairs: continue
                ca = norm_title(str(a["fm"].get("title", "")).split("|")[0])
                cb = norm_title(str(b["fm"].get("title", "")).split("|")[0])
                r = difflib.SequenceMatcher(None, ca, cb).ratio()
                ja, jb = set(ca.split()), set(cb.split())
                if (r >= 0.75 and len(ja & jb) / max(1, len(ja | jb)) >= 0.6
                        and a["fm"].get("category") == b["fm"].get("category")):
                    add("medium", "قیمت و آپشن‌ها یکسان + عنوان شبیه (احتمال تکراری)", a,
                        f"{b['slug']} | «{a['fm'].get('title')}» ↔ «{b['fm'].get('title')}»")

    # عکس مشترک بین محصولات (مسیر یکسان / محتوای یکسان) — یک ردیف برای هر محصول
    path_share = defaultdict(lambda: defaultdict(int))
    for pth, slugs in img_path_use.items():
        if len(slugs) > 1:
            for s1 in slugs:
                for s2 in slugs:
                    if s1 != s2: path_share[s1][s2] += 1
    for s1, others in path_share.items():
        add("medium", "همین مسیر عکس در چند محصول", by_slug[s1][0],
            "؛ ".join(f"{k} ({v} عکس)" for k, v in sorted(others.items())))
    hash_share = defaultdict(lambda: defaultdict(int))
    for h, lst in img_hash.items():
        owners = {s_ for s_, _ in lst}
        if len(owners) > 1:
            for s1 in owners:
                for s2 in owners:
                    if s1 != s2: hash_share[s1][s2] += 1
    for s1, others in hash_share.items():
        if s1 in path_share and set(others) <= set(path_share[s1]):
            continue   # قبلاً به‌خاطر مسیر یکسان گزارش شده
        add("medium", "عکس با محتوای یکسان (فایل‌های مختلف) در چند محصول", by_slug[s1][0],
            "؛ ".join(f"{k} ({v} عکس)" for k, v in sorted(others.items())))

    # ---------------------------------------------------------- لینک‌های داخل متن
    url_re = re.compile(r"\]\(([^)]*)\)|href=[\"']([^\"']*)[\"']|(https?://[^\s)<>\"']+)")
    online_cache = {}
    for p in valid:
        urls = []
        for m in url_re.finditer(p["body"]):
            u = (m.group(1) or m.group(2) or m.group(3) or "").strip()
            urls.append(u)
        for u in dict.fromkeys(urls):
            if u == "":
                add("high", "لینک خالی در متن", p, "[…]() بدون آدرس"); continue
            if re.search(r"\s", u):
                add("medium", "لینک فاصله دارد", p, u)
            if u.startswith("http://"):
                add("low", "لینک http (ناامن)", p, u)
            if u.startswith("/") and assets_ok:
                tgt = os.path.join(root, u.lstrip("/").split("#")[0].split("?")[0].replace("/", os.sep))
                if "." in os.path.basename(tgt) and not os.path.exists(tgt):
                    add("high", "لینک داخلی به فایلی که وجود ندارد", p, u)
            if args.online and u.startswith(("http://", "https://")):
                host = re.sub(r"^https?://", "", u).split("/")[0].lower()
                if "aliexpress" in host:
                    add("low", "لینک AliExpress — خودکار بررسی نمی‌شود (ربات را رد می‌کند)", p, u); continue
                if u not in online_cache:
                    try:
                        req = urllib.request.Request(u, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
                        online_cache[u] = urllib.request.urlopen(req, timeout=8).status
                    except urllib.error.HTTPError as e:
                        online_cache[u] = e.code
                    except Exception as e:
                        online_cache[u] = f"خطا: {type(e).__name__}"
                st = online_cache[u]
                if not (isinstance(st, int) and st < 400):
                    add("high", "لینک آنلاین باز نمی‌شود", p, f"{u} → {st}")

    # ---------------------------------------------------------- خروجی
    order = {"high": 0, "medium": 1, "low": 2}
    issues.sort(key=lambda x: (order[x[0]], x[1], x[2]))
    os.makedirs(os.path.dirname(os.path.join(root, args.out)) or ".", exist_ok=True)
    base = os.path.join(root, args.out)
    with open(base + ".csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh); w.writerow(["اهمیت", "نوع مشکل", "slug", "فایل", "جزئیات"])
        for s, t, sl, fl, d in issues: w.writerow([SEV[s], t, sl, fl, d])
    by_type = defaultdict(list)
    for it in issues: by_type[(it[0], it[1])].append(it)
    lines = [f"# گزارش بررسی محصولات", "",
             f"تعداد محصول: {len(prods)} | تعداد مورد: {len(issues)}",
             "", "(فقط گزارش است؛ هیچ فایلی تغییر نکرده)", ""]
    if not issues:
        lines.append("✅ مشکلی پیدا نشد.")
    for (sev, typ), lst in sorted(by_type.items(), key=lambda x: (order[x[0][0]], x[0][1])):
        lines += [f"## {SEV[sev]} — {typ} ({len(lst)})", ""]
        for _, _, sl, fl, d in lst:
            lines.append(f"- `{fl}` — {d}")
        lines.append("")
    open(base + ".md", "w", encoding="utf-8").write("\n".join(lines))

    print(f"محصول‌ها: {len(prods)} | موارد: {len(issues)}")
    cnt = defaultdict(int)
    for s, t, *_ in issues: cnt[(s, t)] += 1
    for (s, t), c in sorted(cnt.items(), key=lambda x: (order[x[0][0]], x[0][1])):
        print(f"  {SEV[s]} {t}: {c}")
    print("گزارش:", base + ".md", "|", base + ".csv")

if __name__ == "__main__":
    main()
