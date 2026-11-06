#!/usr/bin/env python3
from pathlib import Path
import argparse, datetime as dt, re
import yaml

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / "_products"
UPDATE = ROOT / "product-updates.md"
HISTORY = ROOT / "product-updates-history.md"
CATS = {"girls":"لباس دخترانه","boys":"لباس پسرانه","accessories":"اکسسوری","bags-shoes":"کیف و کفش","wands-crowns":"تاج و عصا"}
HELP = """فقط فیلدهایی را پر کن که می‌خواهی تغییر کنند.
- title: عنوان جدید؛ خالی = بدون تغییر
- sizes: اندازه‌ها؛ عیناً همان‌طور که نوشته‌ای ثبت می‌شوند
- colors: رنگ‌ها
- images: مسیر عکس‌ها به ترتیب نمایش؛ فایل‌ها باید از قبل در assets/images/products موجود باشند
فیلد خالی یعنی بدون تغییر. پس از اعمال موفق، دستورهای موفق پاک می‌شوند.
مقدار file شناسه محصول است؛ آن را تغییر نده.
"""

def split(text):
    if not text.startswith("---\n"): raise ValueError("Front matter آغازین پیدا نشد")
    end = text.find("\n---", 4)
    if end < 0: raise ValueError("Front matter پایانی پیدا نشد")
    return text[4:end], text[end+4:].lstrip("\n")

def parse(text):
    raw, body = split(text)
    data = yaml.safe_load(raw) or {}
    if not isinstance(data, dict): raise ValueError("Front matter نامعتبر است")
    return data, body

def replace_key(text, key, value):
    raw, body = split(text)
    lines = raw.splitlines()
    start = next((i for i,x in enumerate(lines) if re.match(r"^"+re.escape(key)+r"\s*:", x)), None)
    replacement = yaml.safe_dump({key:value}, allow_unicode=True, sort_keys=False, width=1000).rstrip().splitlines()
    if start is None: lines.extend(replacement)
    else:
        end = next((i for i in range(start+1,len(lines)) if re.match(r"^[A-Za-z_][A-Za-z0-9_-]*\s*:",lines[i])),len(lines))
        lines[start:end] = replacement
    return "---\n"+"\n".join(lines)+"\n---\n\n"+body

def inventory():
    rows=[]
    for p in sorted(PRODUCTS.rglob("*.md")):
        d,_=parse(p.read_text(encoding="utf-8"))
        rel=p.relative_to(ROOT).as_posix(); cat=rel.split("/")[1]
        rows.append({"file":rel,"category":cat,"category_name":CATS.get(cat,cat),"current_title":str(d.get("title") or "")})
    return rows

def read_updates():
    if not UPDATE.exists(): return {}
    d,_=parse(UPDATE.read_text(encoding="utf-8"))
    rows=d.get("products",[])
    if not isinstance(rows,list): raise ValueError("products باید فهرست باشد")
    return {str(x["file"]):x for x in rows if isinstance(x,dict) and x.get("file")}

def pending(x):
    return bool((isinstance(x.get("title"),str) and x["title"].strip()) or x.get("sizes") or x.get("colors") or x.get("images"))

def write_template(old):
    rows=[]
    for x in inventory():
        prev=old.get(x["file"],{})
        rows.append({**x,"title":prev.get("title") or "","sizes":prev.get("sizes") or [],"colors":prev.get("colors") or [],"images":prev.get("images") or []})
    front=yaml.safe_dump({"version":1,"products":rows},allow_unicode=True,sort_keys=False,width=1000).rstrip()
    UPDATE.write_text("---\n"+front+"\n---\n\n# دفترچه تغییرات محصولات غریبی\n\n"+HELP,encoding="utf-8")
    return len(rows)

def apply(item):
    rel=str(item["file"])
    if not rel.startswith("_products/") or ".." in Path(rel).parts: raise ValueError("مسیر محصول نامعتبر است")
    p=ROOT/rel
    if not p.is_file(): raise ValueError("فایل محصول پیدا نشد")
    old=p.read_text(encoding="utf-8"); data,_=parse(old); new=old; changed=[]
    title=item.get("title")
    if isinstance(title,str) and title.strip():
        new=replace_key(new,"title",title.strip()); changed.append("title")
    opts=[dict(o) for o in (data.get("options") or []) if isinstance(o,dict)]
    for field,names,canonical in [("sizes",{"اندازه","سایز","اندازهS"},"اندازه"),("colors",{"رنگ"},"رنگ")]:
        vals=item.get(field)
        if vals:
            if not isinstance(vals,list) or any(v is None or not str(v).strip() for v in vals): raise ValueError("فهرست "+field+" نامعتبر است")
            found=False
            for o in opts:
                if str(o.get("name","")).strip() in names:
                    o["values"]=[str(v) for v in vals]; found=True; break
            if not found: opts.append({"name":canonical,"values":[str(v) for v in vals]})
            changed.append(field)
    if "sizes" in changed or "colors" in changed: new=replace_key(new,"options",opts)
    imgs=item.get("images")
    if imgs:
        clean=[]
        for v in imgs:
            if not isinstance(v,str) or not v.strip(): raise ValueError("مسیر عکس نامعتبر است")
            rp=v.strip().lstrip("/")
            if not rp.startswith("assets/images/products/") or not (ROOT/rp).is_file(): raise ValueError("عکس در مخزن پیدا نشد: "+v)
            clean.append("/"+rp)
        if len(set(clean))!=len(clean): raise ValueError("فهرست عکس تکراری دارد")
        new=replace_key(new,"images",clean); changed.append("images")
    if new!=old: p.write_text(new,encoding="utf-8")
    return changed

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--mode",choices=["sync","apply"],default="sync"); mode=ap.parse_args().mode
    old=read_updates()
    if mode=="sync":
        print("فهرست به‌روز شد:",write_template(old),"محصول"); return
    todo={k:v for k,v in old.items() if pending(v)}
    if not todo:
        print("دستوری برای اعمال نیست؛ فهرست به‌روز می‌شود."); write_template(old); return
    results=[]; remain=dict(old)
    for rel,item in todo.items():
        try:
            fields=apply(item); results.append((rel,fields,""))
            if fields:
                cleared=dict(remain.get(rel,item)); cleared.update({"title":"","sizes":[],"colors":[],"images":[]}); remain[rel]=cleared
        except Exception as e: results.append((rel,[],str(e)))
    stamp=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    if not HISTORY.exists(): HISTORY.write_text("# سابقه تغییرات محصولات\n",encoding="utf-8")
    with HISTORY.open("a",encoding="utf-8") as f:
        f.write("\n## "+stamp+"\n")
        for rel,fields,error in results:
            f.write("- "+("⚠️ "+rel+" — "+error if error else ("✅ "+rel+" — "+", ".join(fields) if fields else "ℹ️ "+rel+" — بدون تغییر"))+"\n")
    write_template(remain)
    errors=sum(bool(e) for _,_,e in results)
    print("تعداد دستورها:",len(todo),"خطاها:",errors)
    if errors: raise SystemExit(1)

if __name__=="__main__": main()
