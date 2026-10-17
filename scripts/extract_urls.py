import re
import csv
from pathlib import Path
from collections import Counter

HERE = Path(__file__).parent

sitemap_file = HERE / 'sitemap.xml'
if not sitemap_file.exists():
    print(f'❌ فایل sitemap.xml پیدا نشد توی: {HERE}')
    exit(1)

# ═══════════════════════════════════════════
# خواندن فایل sitemap با UTF-8 (صریح)
# ═══════════════════════════════════════════
content = sitemap_file.read_text(encoding='utf-8', errors='replace')
urls = re.findall(r'<loc>(.*?)</loc>', content)
print(f'📄 {len(urls)} URL پیدا شد')

output = HERE / 'old_urls.csv'

# ═══════════════════════════════════════════
# نوشتن با UTF-8 BOM (برای Excel)
# ═══════════════════════════════════════════
with output.open('w', newline='', encoding='utf-8-sig') as f:
    writer = csv.writer(f)
    writer.writerow(['url', 'type', 'id', 'slug'])

    for url in urls:
        path = url.replace('https://gharibii.ir', '')

        # دسته‌بندی: /shop/3229-لباس-پرنسسی/
        m = re.match(r'^/shop/(\d+)-([^/]+)/?$', path)
        if m:
            writer.writerow([path, 'category', m.group(1), m.group(2)])
            continue

        # محصول: /shop/دسته/P45438-نام.html
        m = re.match(r'^/shop/([^/]+)/P(\d+)-(.+?)\.html$', path)
        if m:
            writer.writerow([path, 'product', m.group(2), m.group(3)])
            continue

        # بلاگ با ID
        m = re.match(r'^/blog/(\d+)-', path)
        if m:
            writer.writerow([path, 'blog', m.group(1), ''])
            continue

        # بلاگ معمولی
        if path.startswith('/blog/'):
            writer.writerow([path, 'blog', '', ''])
            continue

        # صفحات ثابت
        if path in ['/', '/about-us/', '/shop/', '/blog/']:
            writer.writerow([path, 'page', '', ''])
            continue

        writer.writerow([path, 'other', '', ''])

print(f'✅ فایل ساخته شد: {output}')

# آمار
with output.open(encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))
stats = Counter(r['type'] for r in rows)
print('\n📊 آمار:')
for typ, count in stats.most_common():
    print(f'   {typ}: {count}')