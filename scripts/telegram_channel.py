# -*- coding: utf-8 -*-
"""
کنترل ارسال خودکار محصولات به کانال تلگرام (از طریق Worker سایت)

Worker هر روز خودش یک محصول می‌فرستد؛ این اسکریپت فقط برای کنترل دستی است:

  python scripts/telegram_channel.py status      وضعیت: آخرین ارسال، تعداد ارسال‌شده‌ها
  python scripts/telegram_channel.py next        پیش‌نمایش محصولِ بعدی (چیزی ارسال نمی‌شود)
  python scripts/telegram_channel.py post        همین حالا ارسال کن (اگر امروز ارسال شده باشد، رد می‌کند)
  python scripts/telegram_channel.py post --force   همین حالا ارسال کن، حتی اگر امروز ارسال شده
  python scripts/telegram_channel.py mark-all    همهٔ محصولات فعلی را «ارسال‌شده» حساب کن
                                                 (برای وقتی که قبلاً دستی در کانال گذاشته‌اید؛ از این به بعد فقط محصول تازه می‌رود)
  python scripts/telegram_channel.py reset       حافظهٔ ارسال را پاک کن (دوباره از اول)

تنظیم (یکی از دو راه):
  1) متغیرهای محیطی  WORKER_URL  و  SELLER_KEY
  2) فایل scripts/telegram_channel.env (یا با نقطهٔ اول) با دو خط:
       WORKER_URL=https://gharibii-invoices.xxx.workers.dev
       SELLER_KEY=رمز-فروشنده
     (این فایل را کامیت نکنید؛ در .gitignore گذاشته شده)
فقط به Python 3 نیاز دارد، بدون نصب چیز اضافه.
"""
import json
import os
import sys
import urllib.error
import urllib.request


def load_cfg():
    cfg = {"WORKER_URL": os.environ.get("WORKER_URL", ""), "SELLER_KEY": os.environ.get("SELLER_KEY", "")}
    here = os.path.dirname(os.path.abspath(__file__))
    for name in ("telegram_channel.env", ".telegram_channel.env"):
        path = os.path.join(here, name)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    if not cfg.get(k.strip()):
                        cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg


def call(cfg, method, path):
    url = cfg["WORKER_URL"].rstrip("/") + path
    req = urllib.request.Request(url, method=method, data=b"" if method == "POST" else None)
    req.add_header("X-Seller-Key", cfg["SELLER_KEY"])
    req.add_header("User-Agent", "gharibii-channel-tool")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except Exception:
            return {"error": "http %s" % e.code}
    except Exception as e:
        return {"error": str(e)}


def show(d):
    print(json.dumps(d, ensure_ascii=False, indent=2))


def main():
    args = sys.argv[1:]
    if not args or args[0] not in ("status", "next", "post", "mark-all", "reset"):
        print(__doc__)
        return 1
    cfg = load_cfg()
    if not cfg["WORKER_URL"]:
        print("WORKER_URL تنظیم نشده است (بالای همین فایل توضیح داده شده).")
        return 1
    if not cfg["SELLER_KEY"] or cfg["SELLER_KEY"].startswith("PUT-YOUR"):
        import getpass
        cfg["SELLER_KEY"] = getpass.getpass("Seller key (typing is hidden): ").strip()   # رمز فقط برای همین اجرا، بدون ذخیره
        if not cfg["SELLER_KEY"]:
            return 1
    cmd = args[0]
    if cmd == "status":
        show(call(cfg, "GET", "/channel/status"))
    elif cmd == "next":
        d = call(cfg, "GET", "/channel/next")
        if d.get("next"):
            print("محصول بعدی:", d["next"]["title"], "|", d["next"]["cat"])
            print("عکس:", d["next"]["image"] or "—")
            print("-" * 40)
            print(d["next"]["caption"])
            print("-" * 40)
            print("آمار:", d.get("stats"))
        else:
            show(d)
    elif cmd == "post":
        show(call(cfg, "POST", "/channel/post" + ("?force=1" if "--force" in args else "")))
    elif cmd == "mark-all":
        if input("همهٔ محصولات فعلی «ارسال‌شده» حساب شوند؟ (y/n) ").strip().lower() == "y":
            show(call(cfg, "POST", "/channel/mark-all"))
    elif cmd == "reset":
        if input("حافظهٔ ارسال پاک شود و دوباره از اول شروع شود؟ (y/n) ").strip().lower() == "y":
            show(call(cfg, "POST", "/channel/reset"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
