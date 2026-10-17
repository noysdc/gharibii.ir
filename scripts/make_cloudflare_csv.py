import csv
import re
from pathlib import Path

HERE = Path(__file__).parent

# ═══════════════════════════════════════════
# نقشه دسته‌بندی‌های قدیمی → جدید
# ═══════════════════════════════════════════
CATEGORY_MAP = {
    '3229': 'girls', '3244': 'girls', '3231': 'girls', '3487': 'girls',
    '3306': 'girls', '3316': 'girls', '3318': 'girls', '3358': 'girls',
    '3237': 'boys', '3357': 'boys', '3456': 'boys', '3267': 'boys',
    '3251': 'bags-shoes', '3476': 'bags-shoes',
    '3248': 'accessories', '3259': 'accessories', '3283': 'accessories',
    '3369': 'accessories', '3375': 'accessories',
}

# نقشه صفحات ثابت
PAGE_MAP = {
    '/about-us/': '/about/',
    '/shop/': '/',
    '/blog/': '/blog/',
}

CROWN_WAND_KEYWORDS = ['تاج', 'عصا', 'تاج و تل', 'تل تاج', 'عصای']


def make_slug(title, old_id):
    title_clean = title
    for word in ['فروشگاه غریبی کیش', 'فروشگاه غریبی', 'فروشگاه', 'کیش']:
        title_clean = title_clean.replace(word, '')
    title_clean = re.sub(r'[\-—–]+', ' ', title_clean).strip()
    english = re.sub(r'[^a-zA-Z0-9\s]+', '', title_clean).strip()
    english = re.sub(r'\s+', ' ', english).strip()
    if len(english) > 5:
        return re.sub(r'\s+', '-', english.lower())[:50].strip('-')
    return f'product-{old_id}'


# ═══════════════════════════════════════════
# خوندن نقشه محصولات از CSVها
# ═══════════════════════════════════════════
print('📦 خواندن CSV محصولات...')
product_map = {}

csv_dir = HERE / 'csv'
for csv_file in csv_dir.glob('*.csv'):
    print(f'   {csv_file.name}')
    with csv_file.open(encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            if row.get('product_type') != 'Physical':
                continue
            old_id = (row.get('id') or '').strip()
            title = (row.get('title') or '').strip()
            if not old_id or not title:
                continue

            cat_ids = [c.strip() for c in (row.get('categories') or '').split(',') if c.strip()]
            cat = 'accessories'
            for cid in cat_ids:
                if cid in CATEGORY_MAP:
                    cat = CATEGORY_MAP[cid]
                    break

            if any(kw in title for kw in CROWN_WAND_KEYWORDS):
                cat = 'crown-wand'

            slug = make_slug(title, old_id)
            product_map[old_id] = (cat, slug)

print(f'✅ {len(product_map)} محصول در نقشه')


# ═══════════════════════════════════════════
# ساخت ریدایرکت‌ها
# ═══════════════════════════════════════════
print('\n🔄 ساخت ریدایرکت‌ها...')

old_urls_file = HERE / 'old_urls.csv'
redirects = []
not_found = []

# ← تغییر: خواندن با utf-8-sig
with old_urls_file.open(encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        url = row['url']
        typ = row['type']
        pid = row['id']

        target = None

        if typ == 'category':
            cat = CATEGORY_MAP.get(pid)
            if cat:
                target = f'/{cat}/'

        elif typ == 'product':
            if pid in product_map:
                cat, new_slug = product_map[pid]
                target = f'/products/{cat}/{new_slug}/'
            else:
                not_found.append(url)

        elif typ == 'page':
            target = PAGE_MAP.get(url)

        elif typ == 'blog':
            target = PAGE_MAP.get(url)

        if target and target != url:
            redirects.append({
                'Source': url,
                'Target': target,
                'Status': 301,
            })


# ═══════════════════════════════════════════
# ذخیره
# ═══════════════════════════════════════════
output = HERE.parent / 'cloudflare_redirects.csv'

# ← تغییر: نوشتن با utf-8-sig (برای Excel و PowerShell)
with output.open('w', newline='', encoding='utf-8-sig') as f:
    writer = csv.DictWriter(f, fieldnames=['Source', 'Target', 'Status'])
    writer.writeheader()
    writer.writerows(redirects)

print(f'\n✅ {len(redirects)} ریدایرکت ساخته شد')
print(f'📁 ذخیره شد در: {output}')

if not_found:
    print(f'\n⚠️  {len(not_found)} لینک محصول توی CSV پیدا نشد:')
    for url in not_found[:10]:
        print(f'   {url}')

print('\n📋 ۵ ریدایرکت اول:')
for r in redirects[:5]:
    print(f'   {r["Source"]}')
    print(f'      → {r["Target"]}')