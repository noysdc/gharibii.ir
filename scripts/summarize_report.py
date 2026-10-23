# -*- coding: utf-8 -*-
"""گزارش CSV را به جدول Markdown برای خلاصه‌ی GitHub Actions تبدیل می‌کند."""
import csv, os, sys
path = sys.argv[1] if len(sys.argv) > 1 else "scripts/report.csv"
out = os.environ.get("GITHUB_STEP_SUMMARY")
rows = list(csv.DictReader(open(path, encoding="utf-8-sig"))) if os.path.exists(path) else []
lines = [f"### محصولات پردازش‌شده: {len(rows)}", ""]
kept = [r for r in rows if r.get("kept_manual")]
if kept:
    lines += [f"**ویرایش دستی/قفل حفظ شد در {len(kept)} فایل:**", ""]
    lines += [f"- `{r['slug']}` → {r['kept_manual']}" for r in kept] + [""]
lines += ["| فایل | عنوان قبلی | عنوان جدید |", "|---|---|---|"]
for r in rows[:300]:
    lines.append(f"| `{r['slug']}` | {r['old_title']} | {r['new_title']} |")
text = "\n".join(lines) + "\n"
if out:
    open(out, "a", encoding="utf-8").write(text)
else:
    print(text)
