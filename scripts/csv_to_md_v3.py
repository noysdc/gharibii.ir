#!/usr/bin/env python3
import csv
import re
import json
from pathlib import Path
from datetime import datetime

HERE = Path(__file__).parent
ROOT = HERE.parent

CATEGORY_MAP = {
    '3229': 'girls', '3244': 'girls', '3231': 'girls', '3487': 'girls',
    '3306': 'girls', '3316': 'girls', '3318': 'girls', '3358': 'girls',
    '3237': 'boys', '3357': 'boys', '3456': 'boys', '3267': 'boys',
    '3251': 'bags-shoes', '3476': 'bags-shoes',
    '3248': 'accessories', '3259': 'accessories', '3283': 'accessories',
    '3369': 'accessories', '3375': 'accessories',
}

# دیکشنری اصلاح شده (کلمات عمومی مثل دخترانه و پسرانه حذف شدند تا اسم اصلی پیدا بشه)
FARSI_TO_ENG = {
    'پیراهن': 'dress', 'پیرهن': 'dress', 'لباس': 'costume', 'تیشرت': 'tshirt',
    'تی شرت': 'tshirt', 'شنل': 'cape', 'ماسک': 'mask', 'کلاه': 'hat',
    'کفش': 'shoes', 'کیف': 'bag', 'تاج': 'crown', 'عصا': 'wand',
    'دستکش': 'gloves', 'تل': 'headband', 'بال': 'wings', 'دامن': 'skirt',
    'شلوار': 'pants', 'شلوارک': 'shorts', 'ست': 'set', 'مایو': 'swimsuit',
    'السا': 'elsa', 'آنا': 'anna', 'انا': 'anna', 'سیندرلا': 'cinderella',
    'سفید برفی': 'snow-white', 'راپونزل': 'rapunzel', 'آریل': 'ariel',
    'پری دریایی': 'mermaid', 'جاسمین': 'jasmine', 'سوفیا': 'sofia',
    'بتمن': 'batman', 'اسپایدرمن': 'spiderman', 'هالک': 'hulk',
    'ونوم': 'venom', 'آیرون من': 'ironman', 'سوپرمن': 'superman',
    'هری پاتر': 'harry-potter', 'مووانا': 'moana', 'مووآنا': 'moana',
    'میکی موس': 'mickey-mouse', 'یونیکورن': 'unicorn', 'تکشاخ': 'unicorn',
    'مجلسی': 'formal', 'هالووین': 'halloween',
    'کریسمس': 'christmas', 'دیزنی': 'disney', 'مجیک': 'magic',
    'فروزن': 'frozen', 'تینکربل': 'tinkerbell', 'دخترکفشدوزکی': 'ladybug',
    'سگهای نگهبان': 'paw-patrol', 'مک کویین': 'mcqueen', 'رنگین کمان': 'rainbow',
    'فلش': 'flash', 'ثور': 'thor', 'کاپیتان آمریکا': 'captain-america',
    'لاکپشت': 'turtle', 'نینجا': 'ninja', 'شگفت انگیزان': 'incredibles'
}

def clean_html(text):
    if not text: return ''
    text = re.sub(r'<li[^>]*>', '\n- ', text)
    text = re.sub(r'</li>', '', text)
    text = re.sub(r'<p[^>]*>', '\n\n', text)
    text = re.sub(r'</p>', '', text)
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&quot;', '"')
    return re.sub(r'\n{3,}', '\n\n', text).strip()

def make_slug(title, old_id):
    slug_parts = []
    # ۱. پیدا کردن کلمات کلیدی
    for fa, en in FARSI_TO_ENG.items():
        if fa in title:
            if en not in slug_parts:
                slug_parts.append(en)
                
    # ۲. پیدا کردن کلمات انگلیسی مثل k-pop
    eng_words = re.findall(r'[a-zA-Z0-9]+', title)
    for w in eng_words:
        w = w.lower()
        if w not in slug_parts and len(w) > 2:
            slug_parts.append(w)
            
    # ۳. اگه هیچی پیدا نشد
    if not slug_parts:
        return f"item-{old_id}"
        
    return "-".join(slug_parts[:4])

def pick_category(row):
    title = row.get('title', '')
    if any(kw in title for kw in ['تاج', 'عصا', 'تاج و تل', 'تل تاج', 'عصای']):
        return 'crown-wand'
    cat_ids = [c.strip() for c in (row.get('categories') or '').split(',') if c.strip()]
    for cid in cat_ids:
        if cid in CATEGORY_MAP:
            return CATEGORY_MAP[cid]
    return 'accessories'

def parse_price(row):
    try: price = int(float(row.get('price') or 0))
    except: price = 0
    sale = (row.get('saleDiscount') or '').strip()
    mode = (row.get('saleDiscountMode') or '').strip()
    old_price = 0
    discount = 0
    if mode == 'PRICE' and sale:
        try:
            discount_amount = int(float(sale))
            old_price = price + discount_amount
            discount = round((discount_amount / old_price) * 100)
        except: pass
    return price, old_price, discount

def parse_options(row):
    sizes, colors = [], []
    for i in [1, 2]:
        name = (row.get(f'productOptionName{i}') or '').strip()
        values = (row.get(f'productOptionValues{i}') or '').strip()
        if name in ['اندازه', 'سایز', 'اندازهS']:
            sizes = [v.strip() for v in values.split(',') if v.strip()]
        elif name == 'رنگ':
            colors = [v.split(':')[0].strip() for v in values.split(',') if v.strip()]
    return sizes, colors

def extract_features(description):
    if not description: return []
    items = re.findall(r'<li[^>]*>(.*?)</li>', description, re.DOTALL)
    return [clean_html(item).strip() for item in items if clean_html(item).strip()][:8]

def process(row):
    if row.get('product_type') != 'Physical': return None
    title = (row.get('title') or '').strip()
    if not title: return None

    price, old_price, discount = parse_price(row)
    description = row.get('description', '')
    old_id = (row.get('id') or '').strip()
    category = pick_category(row)
    slug = make_slug(title, old_id)
    sizes, colors = parse_options(row)
    
    badge = (row.get('ribbon') or '').strip()
    if badge in ['TRUE', 'FALSE']: badge = ''
    
    material = ''
    for i in range(1, 7):
        if (row.get(f'productAttributeName{i}') or '') == 'جنس':
            material = (row.get(f'productAttributeValue{i}') or '').strip()
            break

    return {
        'title': title, 'slug': slug, 'price': price, 'old_price': old_price,
        'discount': discount, 'category': category, 'description': clean_html(description),
        'features': extract_features(description), 'sizes': sizes, 'colors': colors,
        'material': material, 'badge': badge, 'old_id': old_id,
    }

def build_md(p):
    lines = ['---']
    lines.append(f'title: {json.dumps(p["title"], ensure_ascii=False)}')
    lines.append(f'slug: "{p["slug"]}"')
    lines.append(f'price: {p["price"]}')
    if p['old_price']:
        lines.append(f'old_price: {p["old_price"]}')
        lines.append(f'discount: {p["discount"]}')
    lines.append(f'category: {p["category"]}')
    lines.append(f'date: {datetime.now().strftime("%Y-%m-%d")}')
    if p['badge']: lines.append(f'badge: {json.dumps(p["badge"], ensure_ascii=False)}')
    if p['sizes']: lines.append(f'sizes: [{", ".join(json.dumps(s, ensure_ascii=False) for s in p["sizes"])}]')
    if p['colors']: lines.append(f'colors: [{", ".join(json.dumps(c, ensure_ascii=False) for c in p["colors"])}]')
    if p['material']: lines.append(f'material: {json.dumps(p["material"], ensure_ascii=False)}')
    
    lines.append('images: []')
    
    if p['old_id']:
        lines.append(f'old_id: "{p["old_id"]}"')
        lines.append('redirect_from:')
        lines.append(f'  - /product/{p["old_id"]}')
    lines.append('---\n')
    lines.append(p['description'] or '')
    if p['features']:
        lines.append('\n**ویژگی‌ها:**')
        for f in p['features']: lines.append(f'- {f}')
    return '\n'.join(lines) + '\n'

def main():
    csv_dir = HERE / 'csv'
    all_products, seen_ids = [], set()

    for csv_file in csv_dir.glob('*.csv'):
        with csv_file.open(encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                p = process(row)
                if p and p['old_id'] not in seen_ids:
                    seen_ids.add(p['old_id'])
                    all_products.append(p)

    output_dir = ROOT / '_products'
    written = 0
    
    for p in all_products:
        cat_dir = output_dir / p['category']
        cat_dir.mkdir(parents=True, exist_ok=True)
        file_path = cat_dir / f'{p["slug"]}.md'
        
        if file_path.exists():
            file_path = cat_dir / f'{p["slug"]}-{p["old_id"]}.md'

        file_path.write_text(build_md(p), encoding='utf-8')
        written += 1

    print(f'✅ {written} فایل با اسم‌های جدید ساخته شد!')

if __name__ == '__main__':
    main()