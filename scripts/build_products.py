#!/usr/bin/env python3
"""
ساخت فایل‌های .md محصولات غریبی از روی products.csv.
اجرا:   python build_products.py products.csv
خروجی: _products/<category>/<folder-name>.md  +  mapping_report.csv
"""
import sys, re, html, csv, os
import pandas as pd

CSV = sys.argv[1] if len(sys.argv) > 1 else "products.csv"
OUT = "_products"
SAMPLES_OUT = os.path.join(OUT, "samples") # پوشه خروجی برای محصولات نمونه
IMG_ROOT = "/assets/images/products"

# مسیری که پوشه‌های عکس در آن قرار دارند
RAW_IMAGES_DIR = r"C:\Users\unes shojaei\Documents\GitHub\gharibii.ir\assets\images\raw\01"

# ═══════════════════════════════════════════════════════════════════
MERMAID_DRESS_ID  = 45329
PONNY_SWIMSUIT_ID = 45427
MERMAID_DRESS_FAKE_ID  = 99901
PONNY_SWIMSUIT_FAKE_ID = 99902
FAKE_ID_SOURCE = {
    MERMAID_DRESS_FAKE_ID:  MERMAID_DRESS_ID,
    PONNY_SWIMSUIT_FAKE_ID: PONNY_SWIMSUIT_ID,
}
# ═══════════════════════════════════════════════════════════════════

MAP = {
 "baby-formal-bodysuit":45335, "ballet-dance-dress":45430, "batgirl-cape-mask":45410,
 "batman-muscle-jumpsuit":45328, "batman-wings":45361, "beauty-and-the-beast-dress":45330,
 "bikini-elsa-swimsuit":45372, "black-spiderman-superman-gloves":45388, "boy-avenger-swimsuit":45366,
 "boys-character-tshirt":45360, "boys-magic-wand":45364, "bts-bunny-moving-ear-hat-":45423,
 "bts-panda-moving-ear-hat":45426, "captain-america-cape-mask":45408, "cat-mask":45414,
 "character-cap":45368, "character-cap-2":45412,
 "chrome-formal-dress":45442, "cinderella-angel-dress":45333, "cinderella-new-design-dress":45440,
 "colored-hair-tinsel":45362, "cotton-comfort-set":45351, "crown-and-tinsel":45365,
 "disney-cinderella-dress":45353, "disney-mermaid-dress":45352, "elsa-ballet-dress":45338,
 "elsa-frozen-1-long-sleeve-dress":45343, "elsa-frozen-2-dress":45393, "elsa-frozen-cape-mask":45404,
 "elsa-frozen-collection-2026":45448, "elsa-frozen-dress-with-cape":45437,
 "elsa-long-sleeve-lace-dress":45436,
 "elsa-swimsuit":45372,
 "fake-nails":45392, "frozen-2-elsa-anna-dress":8, "girls-ballet-gymnastics-bodysuit":45394,
 "girls-ballet-shoes":45433, "girls-cotton-top":45348, "girls-formal-skirt":45350,
 "girls-magic-wand":45363, "girls-tutu-ballet-skirt":45349,
 "glitter-mermaid-dress":45329,
 "mermaid-dress":MERMAID_DRESS_FAKE_ID,
 "halloween-ballet-dress":45342, "halloween-witch-formal-dress":45420,
 "halloween-witch-hat":45402,
 "halloween-witch-hat-2":45395,
 "witch-halloween-hat-tinsel":45395,
 "harry-potter-full-set":45441, "hello-kitty-lace-dress":45424, "holographic-angel-wings":45369,
 "hulk-cape-mask":45411, "hulk-muscle-jumpsuit":7, "incredibles-cape-mask":45406,
 "iron-man-web-shooter-gloves":45387, "jasmine-ballet-dress":45337, "jasmine-formal-dress":45340,
 "kpop-huntrix-rumi":45445, "kpop-huntrix-rumi-2":45447, "ladybug-bikini":45428, "ladybug-dress":45370,
 "long-skirt-peach-princess":45371, "mermaid-3-piece-swimsuit":45422,
 "mermaid-keychain":3, "mermaid-princess-bag":2, "minnie-mouse-formal-dress":45346,
 "moana-2-collection-2026":45444, "moana-dress":45421,
 "moana-necklace":45415, "moana-necklace-2":45415,
 "moana-two-piece-dress":4,
 "my-little-pony-lace-dress":45427,
 "ponny-swimsuit":PONNY_SWIMSUIT_FAKE_ID,
 "ninja-turtles-cape-mask":45405,
 "original-elsa-frozen-dress":45438, "paw-patrol-dress":45359, "paw-patrol-swimsuit":45367,
 "peach-princess-dress":5, "pirate-hat":45413,
 "princess-accessory-set":45446, "princess-anna-dress":45322,
 "princess-gloves":1, "princess-gloves-2":1,
 "princess-lace-crown":45417, "rainbow-lace-dress":45358,
 "rapunzel-ballet-dress":45339, "rapunzel-disney-dress":45439, "rapunzel-formal-dress":45347,
 "sleeping-beauty-dress":45331, "sleeping-beauty-dress-2":45341, "snow-white-dress":45332,
 "sofia-ballet-dress":45344, "sofia-formal-dress":45345, "spiderman-hero-cape-mask":45327,
 "spiderman-muscle-suit":45390, "spiderman-web-shooter-gloves":45386,
 "stage-moving-ear-hat":45425, "superman-cape-mask":45407, "thor-cape-mask":45434,
 "tinkerbell-formal-dress":45355, "unicorn-formal-dress":45354, "wednesday-formal-dress":6,
}

EXTRA = {
 "paw-patrol-cap":(45396,"character-cap"), "elsa-frozen-cap":(45397,"character-cap"),
 "lol-cap":(45398,"character-cap"), "batman-cap":(45399,"character-cap"),
 "iron-man-cap":(45400,"character-cap"), "ladybug-cap":(45401,"character-cap"),
 "minnie-mouse-cap":(45403,"character-cap"), "mcqueen-cap":(45409,"character-cap"),
 "princess-braid-crown":(45416,"princess-lace-crown"), "princess-hair-crown":(45375,"princess-lace-crown"),
 "princess-braid-hair-clip":(45418,"princess-lace-crown"), "elsa-frozen-braid-wig":(45419,"princess-lace-crown"),
 "fake-nails-sofia":(45391,"fake-nails"), "spiderman-black-muscle-jumpsuit":(45378,"spiderman-muscle-suit"),
 "bts-unicorn-moving-ear-hat":(45326,None), "princess-ballet-dress":(45336,None),
 "character-bags":(45357,None), "black-cat-jumpsuit":(45373,None), "harry-potter-wand":(45374,None),
 "iron-man-muscle-jumpsuit":(45377,None), "flash-muscle-jumpsuit":(45379,None),
 "spiderman-light-face-mask":(45380,None), "iron-man-face-mask":(45381,None),
 "hulk-face-mask":(45382,None), "batman-face-mask":(45383,None), "venom-muscle-jumpsuit":(45384,None),
 "ladybug-face-mask":(45385,None), "captain-america-web-shooter-gloves":(45389,None),
 "unicorn-lace-dress":(45429,None), "angel-ballet-dress":(45431,None), "ballet-dance-dress-2":(45432,None),
}

STUBS = {
 "boys-moana-set":"ست پسرانه موانا", "girl-avenger-swimsuit":"مایو لباسی اونجر دخترانه",
 "hawaiian-shirt":"پیراهن هاوایی", "linen-long-dress":"پیراهن بلند کتان",
}

def category_of(folder):
    f = folder
    if any(k in f for k in ("bag","shoes")): return "bags-shoes"
    if any(k in f for k in ("wand","crown","tinsel","clip","wig","braid")): return "wands-crowns"
    if any(k in f for k in ("gloves","cape-mask","mask","hat","cap","necklace","keychain","nails","wings","accessory")):
        return "accessories"
    if any(k in f for k in ("batman","hulk","spiderman","boy","harry-potter","ninja","hawaiian","iron-man","venom","flash","black-cat","muscle")): return "boys"
    return "girls"

def gender_of(folder, cat):
    boys_kw = ("batman","hulk","spiderman","boy","harry-potter","ninja","iron-man","superman","captain","thor","incredibles","pirate","venom","flash","black-cat","mcqueen")
    if any(k in folder for k in boys_kw): return "boys"
    if cat in ("girls",): return "girls"
    return "unisex" if cat=="accessories" else "girls"

def clean_title(t):
    t = re.sub(r"\s*[-–]?\s*فروشگاه\s*غریبی(\s*کیش)?", "", str(t))
    return re.sub(r"\s+", " ", t).strip(" -")

def html_to_md(s):
    if not isinstance(s, str): return ""
    s = s.replace("\\t", "")
    s = re.sub(r"<img[^>]*>", "", s)
    s = re.sub(r"<li[^>]*>", "\n- ", s)
    s = re.sub(r"</(p|ul|ol|div)>", "\n", s)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in s.split("\n")]
    out, prev_blank = [], False
    for l in lines:
        if not l:
            if not prev_blank and out: out.append("")
            prev_blank = True
        else:
            out.append(l); prev_blank = False
    return "\n".join(out).strip()

def yq(x):
    return '"' + str(x).replace('\\','\\\\').replace('"','\\"') + '"'

# خواندن CSV
df = pd.read_csv(CSV, encoding="utf-8-sig")
main = df[df["title"].notna()].drop_duplicates("id").set_index("id")

def opts(r):
    res = []
    for n in (1,2):
        name, vals = r.get(f"productOptionName{n}"), r.get(f"productOptionValues{n}")
        if isinstance(name,str) and isinstance(vals,str):
            vals = re.sub(r":(rgb\([^)]*\)|#[0-9a-fA-F]+)", "", vals)
            v = [x.strip() for x in vals.split(",")]
            res.append((name.strip(), [x for x in v if x]))
    return res

report, used = [], set()
os.makedirs(OUT, exist_ok=True)

entries = {}
id2name = {}
for folder, pid in MAP.items():
    if pid in id2name:
        entries[id2name[pid]]["folders"].append(folder)
    else:
        id2name[pid] = folder
        entries[folder] = {"id": pid, "folders": [folder], "needs_folder": False}
for name, (pid, shared) in EXTRA.items():
    entries[name] = {"id": pid, "folders": [shared] if shared else [name], "needs_folder": shared is None}

def write_product(name, e):
    source_id = FAKE_ID_SOURCE.get(e["id"], e["id"])
    r = main.loc[source_id]
    cat = category_of(name); gen = gender_of(name, cat)
    used.add(source_id)
    
    # 🔽 تبدیل قیمت به تومان با کاما 🔽
    raw_price = str(r['price']).strip()
    try:
        price_int = int(float(raw_price))
        formatted_price = f"{price_int:,}"
    except (ValueError, TypeError):
        formatted_price = "0"

    fm = ["---","layout: product",
          f"title: {yq(clean_title(r['title']))}",
          f"slug: {yq(name)}",
          f"category: {cat}", f"gender: {gen}",
          f"price: {yq(formatted_price)}", # مقدار همراه با کاما
          "currency: IRT",                # واحد پول تومان
    ]
    fm.append("images_dirs: [" + ", ".join(yq(IMG_ROOT + "/" + f + "/") for f in e["folders"]) + "]")
    if e["needs_folder"]: fm.append("needs_folder: true   # برای این محصول پوشه‌ی عکس بساز: " + e["folders"][0])
    fm.append(f"webzi_id: {e['id']}")
    if e["id"] in FAKE_ID_SOURCE:
        fm.append(f"fake_id: true   # id فرضی — منبع داده: {source_id}")
    if isinstance(r.get("slug"), str): fm.append(f"old_slug: {yq(r['slug'])}")
    if isinstance(r.get("images"), str):
        fm.append("webzi_images: [" + ", ".join(yq(x.strip()) for x in r["images"].split(",") if x.strip()) + "]")
    o = opts(r)
    if o:
        fm.append("options:")
        for n, v in o:
            fm.append(f"  - name: {yq(n)}"); fm.append("    values: [" + ", ".join(yq(x) for x in v) + "]")
    if isinstance(r.get("tags"), str):
        fm.append("tags: [" + ", ".join(yq(t.strip()) for t in r["tags"].split(",") if t.strip() and len(t.strip()) <= 40 and "فروشگاه غریبی" not in t) + "]")
    fm.append("---")
    d = os.path.join(OUT, cat); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name + ".md"), "w", encoding="utf-8") as f:
        f.write("\n".join(fm) + "\n\n" + html_to_md(r.get("description")) + "\n")
    
    if e["id"] in FAKE_ID_SOURCE:
        status = f"id فرضی (منبع: {source_id})"
    elif e["needs_folder"]:
        status = "نیاز به پوشه‌ی عکس"
    elif len(e["folders"]) > 1:
        status = "چند پوشه → یک محصول"
    else:
        status = "ok"
    report.append([name, cat, e["id"], clean_title(r["title"]), "|".join(e["folders"]), status])

# ساخت محصولات اصلی از CSV
for name, e in entries.items(): write_product(name, e)

# ساخت اسکلت محصولات STUBS
for folder, t in STUBS.items():
    cat = category_of(folder); d = os.path.join(OUT, cat); os.makedirs(d, exist_ok=True)
    fm = ["---","layout: product",f"title: {yq(t)}",f"folder: {yq(folder)}",f"category: {cat}",
          f"gender: {gender_of(folder,cat)}",'price: "0"',"currency: IRT",
          f"images_dirs: [{yq(IMG_ROOT + '/' + folder + '/')}]","needs_review: true","---"]
    with open(os.path.join(d, folder + ".md"), "w", encoding="utf-8") as f:
        f.write("\n".join(fm) + "\n\n")
    report.append([folder, cat, "", t, folder, "NOT FOUND در CSV - اسکلت"])

# =========================================================================
# 🚨 بررسی پوشه‌های عکس در سیستم و ساخت محصول نمونه در صورت نیاز
# =========================================================================
print("Scanning images folder for unmapped products...")
if os.path.isdir(RAW_IMAGES_DIR):
    existing_folders = [d for d in os.listdir(RAW_IMAGES_DIR) if os.path.isdir(os.path.join(RAW_IMAGES_DIR, d))]
    all_known_names = set(MAP.keys()) | set(EXTRA.keys()) | set(STUBS.keys())
    
    os.makedirs(SAMPLES_OUT, exist_ok=True)
    
    for folder in existing_folders:
        clean_folder = re.sub(r'\s*\(\d+\)$', '', folder).strip()
        
        if clean_folder not in all_known_names and folder not in all_known_names:
            print(f"Found new unmapped folder: {folder} -> Creating sample product.")
            cat = category_of(clean_folder)
            gen = gender_of(clean_folder, cat)
            
            fm = [
                "---",
                "layout: product",
                f"title: {yq(clean_folder + ' (محصول نمونه)')}",
                f"slug: {yq(clean_folder)}",
                f"category: {cat}",
                f"gender: {gen}",
                'price: "0"',     # 🔽 قیمت نمونه 🔽
                "currency: IRT",  # 🔽 واحد پول 🔽
                f"images_dirs: [{yq(IMG_ROOT + '/' + folder + '/')}]",
                "needs_review: true",
                "# ⚠️ این محصول در فایل CSV وجود نداشت و به صورت خودکار ساخته شده است.",
                "# لطفا اطلاعات، قیمت و توضیحات را به صورت دستی وارد کنید.",
                "---",
                "",
                "توضیحات محصول را اینجا بنویسید...",
            ]
            
            with open(os.path.join(SAMPLES_OUT, clean_folder + ".md"), "w", encoding="utf-8") as f:
                f.write("\n".join(fm) + "\n")
            
            report.append([clean_folder, cat, "", clean_folder + " (نمونه)", folder, "فولدر یتیم - ساخت Sample"])
else:
    print(f"WARNING: Images directory not found at {RAW_IMAGES_DIR}. Skipping orphan scan.")

# =========================================================================

for pid, r in main.iterrows():
    if pid not in used:
        report.append(["", "", str(pid), clean_title(r["title"]), "", "بدون md!"])

with open("mapping_report.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f); w.writerow(["md_name","category","webzi_id","title","image_folders","status"]); w.writerows(report)
print(f"done: {len(entries)+len(STUBS)} main md files, and sample files in {SAMPLES_OUT}")