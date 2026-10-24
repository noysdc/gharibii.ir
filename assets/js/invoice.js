/* ابزار پیش‌فاکتور فروشگاه غریبی کیش — ماژول مشترک (صفحهٔ فروشنده + صفحهٔ پیش‌فاکتور مشتری)
   - پیش‌فاکتور داخل خود لینک ذخیره می‌شود (بعد از #) و هیچ‌جا به سرور فرستاده نمی‌شود
   - قیمت‌ها و محصولات از /seller-data.json (همان منبع سایت) خوانده می‌شود */
(function (w) {
  'use strict';

  var BASE = (document.querySelector('meta[name="site-baseurl"]') || {}).content || '';
  var TZ = 'Asia/Tehran';
  var VERSION = 1, VERSION2 = 2;
  var MAX_ITEMS = 120;
  var isTouch = !!(w.matchMedia && w.matchMedia('(hover: none) and (pointer: coarse)').matches);

  /* ---------- ابزارهای عمومی ---------- */
  function normDigits(s) {
    return String(s == null ? '' : s).replace(/[۰-۹٠-٩]/g, function (c) {
      var i = '۰۱۲۳۴۵۶۷۸۹'.indexOf(c);
      if (i < 0) i = '٠١٢٣٤٥٦٧٨٩'.indexOf(c);
      return i;
    });
  }
  function toNum(v) {
    var n = Number(normDigits(v).replace(/[,٬،\s]/g, ''));
    return isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  function nf(n) { return Number(n || 0).toLocaleString('fa-IR'); }
  function money(n) { return nf(n) + ' تومان'; }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  /* ---------- تاریخ شمسی ---------- */
  function fmtDate(sec) {
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23', timeZone: TZ
      }).format(new Date(sec * 1000));
    } catch (e) { return new Date(sec * 1000).toLocaleString('fa-IR'); }
  }
  function makeNo(d) {
    try {
      var parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23', timeZone: TZ
      }).formatToParts(d);
      var m = {};
      parts.forEach(function (p) { m[p.type] = p.value; });
      return 'PF-' + m.year + m.month + m.day + '-' + m.hour + m.minute + m.second;
    } catch (e) { return 'PF-' + d.getTime().toString(36).toUpperCase(); }
  }
  function remainText(exp) {
    var s = exp - Math.floor(Date.now() / 1000);
    if (s <= 0) return '';
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.ceil((s % 3600) / 60);
    if (m === 60) { h += 1; m = 0; }
    var out = [];
    if (d) out.push(nf(d) + ' روز');
    if (h) out.push(nf(h) + ' ساعت');
    if (m && !d) out.push(nf(m) + ' دقیقه');
    return out.join(' و ') || 'کمتر از یک دقیقه';
  }
  function isExpired(inv) { return !inv.paid && Math.floor(Date.now() / 1000) >= inv.exp; }

  /* ---------- جمع‌ها ---------- */
  function totals(inv) {
    var sub = 0, unpriced = 0, count = 0;
    inv.items.forEach(function (i) {
      count += i.q;
      if (i.p > 0) sub += i.p * i.q; else unpriced++;
    });
    var disc = Math.min(inv.disc || 0, sub);
    var fee = inv.items.length ? (inv.fee || 0) : 0;
    return { count: count, lines: inv.items.length, sub: sub, disc: disc, fee: fee, total: sub - disc + fee, unpriced: unpriced };
  }

  /* ---------- لینک (پیش‌فاکتور داخل خود لینک) ---------- */
  function b64Enc(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64Dec(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  /* کد کوتاه محصول: شناسه‌های بلند در لینک با یک هش ۶ حرفی جایگزین می‌شوند (با اطلاعات سایت دوباره به شناسه‌ی کامل برمی‌گردند) */
  var curFeed = null;
  function hash6(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ('000000' + (h % 2176782336).toString(36)).slice(-6);
  }
  function shortId(id) {
    if (!id || id.length <= 8 || !curFeed || !curFeed.short) return id;
    var h = hash6(id);
    return curFeed.short[h] === id && !curFeed.dup[h] ? '~' + h : id;
  }
  function fullId(tok) {
    if (tok.charAt(0) !== '~') return tok;
    var h = tok.slice(1);
    return curFeed && curFeed.short && curFeed.short[h] && !curFeed.dup[h] ? curFeed.short[h] : tok;
  }
  function resolve(inv) { inv.items.forEach(function (i) { i.id = fullId(i.id); }); return inv; }
  function titleOf(it, feed) {
    var pr = feed && feed.byId && it.id ? feed.byId[it.id] : null;
    return (pr && pr.t) || it.t || 'محصول';
  }

  /* نسخهٔ ۲ لینک: کوتاه‌تر (بدون نام محصولات کاتالوگ، شمارهٔ فاکتور از روی زمان ساخته می‌شود) */
  function pack(inv) {
    var ts = inv.ts, std = makeNo(new Date(ts * 1000));
    var a = [VERSION2, ts.toString(36), Math.max(1, Math.round((inv.exp - ts) / 60)), inv.no === std ? '' : inv.no,
      inv.cust, inv.sw, inv.fee, inv.disc, inv.note,
      inv.items.map(function (i) { var r = [shortId(i.id), i.q, i.p, i.o]; if (!i.id) r.push(i.t); return r; }),
      inv.rev > 1 ? inv.rev : 0, inv.paid ? inv.paid.ref : '', inv.paid ? inv.paid.at.toString(36) : ''];
    while (a.length > 10 && !a[a.length - 1]) a.pop();
    return b64Enc(JSON.stringify(a));
  }
  /* ورودی نامطمئن است (هر کسی می‌تواند لینک بسازد): همه‌چیز اعتبارسنجی و کوتاه می‌شود. لینک‌های قدیمی (نسخهٔ ۱) هم خوانده می‌شوند */
  function unpack(tok) {
    try {
      tok = String(tok || '').trim();
      var h = tok.indexOf('#');
      if (h >= 0) tok = tok.slice(h + 1);
      var dot = tok.indexOf('.');
      if (dot > 0) tok = tok.slice(0, dot);
      if (!tok) return null;
      var a = JSON.parse(b64Dec(tok));
      if (!Array.isArray(a)) return null;
      var inv, rows;
      if (a[0] === VERSION2 && Array.isArray(a[9])) {
        var ts = parseInt(a[1], 36) || 0, vm = Number(a[2]) || 0;
        if (!ts || vm <= 0) return null;
        inv = {
          no: clip(a[3], 40) || makeNo(new Date(ts * 1000)), ts: ts, exp: ts + vm * 60,
          cust: clip(a[4], 60), sn: '', sw: clip(a[5], 20).replace(/\D/g, ''),
          fee: toNum(a[6]), disc: toNum(a[7]), note: clip(a[8], 300), items: [],
          rev: Math.min(99, Math.max(1, Math.round(Number(a[10]) || 1))), paid: null
        };
        if (a[11]) inv.paid = { ref: clip(a[11], 40), at: parseInt(a[12], 36) || ts };
        rows = a[9];
      } else if (a[0] === VERSION && Array.isArray(a[10])) {
        inv = {
          no: clip(a[1], 40), ts: Number(a[2]) || 0, exp: Number(a[3]) || 0,
          cust: clip(a[4], 60), sn: clip(a[5], 40), sw: clip(a[6], 20).replace(/\D/g, ''),
          fee: toNum(a[7]), disc: toNum(a[8]), note: clip(a[9], 300), items: [], rev: 1, paid: null
        };
        if (!inv.ts || !inv.exp) return null;
        rows = a[10];
      } else return null;
      rows.slice(0, MAX_ITEMS).forEach(function (r) {
        if (!Array.isArray(r)) return;
        var q = Math.min(999, Math.max(1, Math.round(Number(r[1]) || 1)));
        inv.items.push({ id: fullId(clip(r[0], 200)), q: q, p: toNum(r[2]), o: clip(r[3], 120), t: clip(r[4], 120) });
      });
      return inv.items.length ? inv : null;
    } catch (e) { return null; }
  }
  /* آخر لینک، شمارهٔ فاکتور (تاریخ و ساعت) و نسخه می‌آید تا در چت راحت شناخته شود؛ هنگام خواندن نادیده گرفته می‌شود */
  function linkOf(tok, no, rev) {
    var suf = String(no || '').replace(/^PF-/, '').replace(/[^0-9A-Za-z-]/g, '') + (rev > 1 ? '-r' + rev : '');
    return location.origin + BASE + '/invoice/#' + tok + (suf ? '.' + suf : '');
  }
  function invoiceUrl(inv) { return linkOf(pack(inv), inv.no, inv.rev); }

  /* ---------- داده‌ی سایت (قیمت‌های لحظه‌ای) ---------- */
  var feedPromise = null;
  function loadFeed(force) {
    if (feedPromise && !force) return feedPromise;
    feedPromise = fetch(BASE + '/seller-data.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('feed ' + r.status); return r.json(); })
      .then(function (d) {
        d.byId = {};
        (d.products || []).forEach(function (p) { d.byId[p.id] = p; });
        d.short = {}; d.dup = {};
        (d.products || []).forEach(function (p) {
          var k = hash6(String(p.id));
          if (d.short[k] && d.short[k] !== p.id) d.dup[k] = true; else d.short[k] = p.id;
        });
        curFeed = d;
        d.loadedAt = Date.now();
        return d;
      });
    feedPromise.catch(function () { feedPromise = null; });
    return feedPromise;
  }
  function sellerKnown(feed, number) {
    var n = String(number || '');
    var list = (feed && feed.sellers) || [];
    for (var i = 0; i < list.length; i++) if (list[i].number === n) return list[i];
    return null;
  }

  /* ---------- متن پیش‌فاکتور (برای واتساپ، تلگرام، بله، اینستاگرام) ---------- */
  function buildText(inv, feed, link) {
    var t = totals(inv), store = (feed && feed.store) || 'فروشگاه غریبی کیش';
    var m = (inv.paid ? '🧾 فاکتور نهایی ' : '🧾 پیش‌فاکتور ') + store + '\n';
    m += 'شماره: ' + inv.no + (inv.rev > 1 ? ' (نسخه ' + nf(inv.rev) + ')' : '') + '\n';
    m += 'تاریخ: ' + fmtDate(inv.ts) + '\n';
    if (!inv.paid) m += 'اعتبار تا: ' + fmtDate(inv.exp) + '\n';
    if (inv.cust) m += 'مشتری: ' + inv.cust + '\n';
    m += '\n';
    inv.items.forEach(function (it, i) {
      m += nf(i + 1) + '. ' + titleOf(it, feed) + '\n';
      if (it.o) m += '   ' + it.o + '\n';
      if (it.p > 0) {
        m += '   ' + nf(it.q) + ' × ' + nf(it.p) + ' = ' + money(it.p * it.q) + '\n';
      } else {
        m += '   ' + nf(it.q) + ' عدد — قیمت با فروشنده هماهنگ می‌شود\n';
      }
    });
    m += '━━━━━━━━━━━━━━\n';
    m += '🛍️ جمع کالاها: ' + money(t.sub) + '\n';
    if (t.disc > 0) m += '🎁 تخفیف: ' + money(t.disc) + '\n';
    if (t.fee > 0) m += '🚚 هزینه ارسال و گمرک: ' + money(t.fee) + '\n';
    m += '💳 جمع کل: ' + money(t.total) + '\n';
    if (t.unpriced > 0) m += '⚠️ قیمت ' + nf(t.unpriced) + ' قلم با فروشنده هماهنگ می‌شود.\n';
    if (inv.note) m += '\n📝 ' + inv.note + '\n';
    if (inv.paid) {
      m += '\n✅ پرداخت تأیید شد. کد پیگیری: ' + inv.paid.ref + ' (' + fmtDate(inv.paid.at) + ')';
    } else {
      m += '\n⚠️ این سند «پیش‌فاکتور» است و به منزله فاکتور نهایی نیست.';
      m += ' تا ' + fmtDate(inv.exp) + ' معتبر است و قیمت و موجودی نهایی پس از تأیید فروشنده قطعی می‌شود.';
      m += ' پس از پرداخت و تأیید فروشنده، فاکتور نهایی صادر می‌شود.';
    }
    if (link) m += '\n\n🔗 مشاهده ' + (inv.paid ? 'فاکتور نهایی' : 'پیش‌فاکتور') + ':\n' + link;
    return m;
  }

  /* ---------- ظاهر پیش‌فاکتور (همان ظاهر در صفحه، عکس و PDF) ---------- */
  function sheetHTML(inv, feed, o) {
    o = o || {};
    var t = totals(inv), expired = isExpired(inv);
    var store = (feed && feed.store) || 'فروشگاه غریبی کیش';
    var seller = sellerKnown(feed, inv.sw);
    var rows = inv.items.map(function (it, i) {
      var p = feed && feed.byId ? feed.byId[it.id] : null;
      var img = p && p.im ? p.im : '';
      var imgf = p && p.imf ? p.imf : '';
      var thumb = img
        ? '<img class="r-img" src="' + esc(BASE + img.replace(BASE, '')) + '" data-f="' + esc(BASE + imgf.replace(BASE, '')) + '" alt="" width="64" height="80" crossorigin="anonymous">'
        : '<span class="r-img r-noimg">🎀</span>';
      var amount = it.p > 0
        ? '<span class="r-line">' + money(it.p * it.q) + '</span>'
        : '<span class="r-line r-contact">هماهنگی با فروشنده</span>';
      var calc = it.p > 0 ? nf(it.q) + ' × ' + nf(it.p) : nf(it.q) + ' عدد';
      return '<div class="inv-row" data-brk>' + thumb +
        '<div class="r-info"><div class="r-title">' + nf(i + 1) + '. ' + esc(titleOf(it, feed)) + '</div>' +
        (it.o ? '<div class="r-opts">' + esc(it.o) + '</div>' : '') +
        '<div class="r-calc">' + calc + '</div></div>' + amount + '</div>';
    }).join('');

    var totalRows = '<div class="t-row"><span>جمع کالاها</span><b>' + money(t.sub) + '</b></div>';
    if (t.disc > 0) totalRows += '<div class="t-row t-disc"><span>تخفیف</span><b>− ' + money(t.disc) + '</b></div>';
    if (t.fee > 0) totalRows += '<div class="t-row"><span>هزینه ارسال و گمرک</span><b>' + money(t.fee) + '</b></div>';
    totalRows += '<div class="t-row t-grand"><span>جمع کل</span><b>' + money(t.total) + '</b></div>';
    if (t.unpriced > 0) totalRows += '<div class="t-warn">قیمت ' + nf(t.unpriced) + ' قلم با فروشنده هماهنگ می‌شود و در جمع کل نیست.</div>';

    var rem = remainText(inv.exp);
    var validLine = expired
      ? '<b class="v-expired">این پیش‌فاکتور منقضی شده است.</b> برای قیمت و موجودی به‌روز با فروشنده هماهنگ کنید.'
      : 'معتبر تا <b>' + esc(fmtDate(inv.exp)) + '</b>' + (o.live && rem ? ' (<span data-remain>' + esc(rem) + '</span> مانده)' : '');

    var meta = '<div class="m-item"><span>شماره</span><b dir="ltr">' + esc(inv.no) + '</b></div>' +
      (inv.rev > 1 ? '<div class="m-item"><span>نسخه</span><b>' + nf(inv.rev) + '</b></div>' : '') +
      '<div class="m-item"><span>تاریخ صدور</span><b>' + esc(fmtDate(inv.ts)) + '</b></div>' +
      (inv.cust ? '<div class="m-item"><span>مشتری</span><b>' + esc(inv.cust) + '</b></div>' : '') +
      ((seller || inv.sn) ? '<div class="m-item"><span>فروشنده</span><b>' + esc(seller ? seller.name : inv.sn) + '</b></div>' : '') +
      (inv.paid ? '<div class="m-item"><span>کد پیگیری پرداخت</span><b dir="ltr">' + esc(inv.paid.ref) + '</b></div>' : '');

    var foot = [];
    if (feed && feed.phone) foot.push('☎ ' + esc(feed.phone));
    if (feed && feed.address) foot.push(esc(feed.address));

    var notice = inv.paid
      ? '<b>این سند، فاکتور نهایی است.</b><br>پرداخت در تاریخ <b>' + esc(fmtDate(inv.paid.at)) + '</b> تأیید شد.'
      : '<b>این سند، پیش‌فاکتور است و به منزله فاکتور نهایی نیست.</b><br>' + validLine +
        '<br>قیمت، موجودی، سایز و هزینه دقیق ارسال پس از تأیید فروشنده قطعی می‌شود.' +
        '<br><b>پس از پرداخت و تأیید فروشنده، فاکتور نهایی صادر می‌شود.</b>' +
        '<br>اگر فروشنده نسخهٔ جدیدتری فرستاد، فقط آخرین نسخه معتبر است.';

    return '<div class="inv-sheet' + (expired ? ' is-expired' : '') + '" dir="rtl">' +
      '<div class="inv-head" data-brk>' +
        '<img class="h-logo" src="' + BASE + '/assets/images/gharibii-store-logo.webp" alt="" width="64" height="64" crossorigin="anonymous">' +
        '<div class="h-text"><div class="h-store">' + esc(store) + '</div><div class="h-title">' + (inv.paid ? 'فاکتور نهایی' : 'پیش‌فاکتور') + '</div></div>' +
      '</div>' +
      '<div class="inv-meta" data-brk>' + meta + '</div>' +
      '<div class="inv-notice" data-brk>' + notice + '</div>' +
      '<div class="inv-rows">' + rows + '</div>' +
      '<div class="inv-totals" data-brk>' + totalRows + '</div>' +
      (inv.note ? '<div class="inv-note" data-brk><b>توضیحات:</b> ' + esc(inv.note) + '</div>' : '') +
      '<div class="inv-foot" data-brk>' + (foot.length ? foot.join(' · ') + '<br>' : '') + 'با تشکر از اعتماد شما 🎀</div>' +
      (inv.paid ? '<div class="inv-stamp paid" aria-hidden="true">پرداخت شد</div>' : (expired ? '<div class="inv-stamp" aria-hidden="true">منقضی شده</div>' : '')) +
    '</div>';
  }
  function fixImages(root) {
    Array.prototype.forEach.call(root.querySelectorAll('img[data-f]'), function (img) {
      img.addEventListener('error', function onerr() {
        img.removeEventListener('error', onerr);
        var f = img.getAttribute('data-f');
        if (f && img.src.indexOf(f) < 0) img.src = f; else img.style.visibility = 'hidden';
      });
    });
  }
  function renderSheet(host, inv, feed, o) {
    host.innerHTML = sheetHTML(inv, feed, o);
    fixImages(host);
    return host.firstChild;
  }
  /* شمارندهٔ زندهٔ اعتبار (فقط صفحهٔ مشتری) */
  function watchExpiry(host, inv, feed, onExpire) {
    var timer = setInterval(function () {
      var r = host.querySelector('[data-remain]');
      if (isExpired(inv)) {
        clearInterval(timer);
        renderSheet(host, inv, feed, { live: true });
        if (onExpire) onExpire();
      } else if (r) r.textContent = remainText(inv.exp);
    }, 20000);
    return timer;
  }

  /* ---------- خروجی: عکس و PDF ---------- */
  var h2cPromise = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('script')); };
      document.head.appendChild(s);
    });
  }
  function ensureH2C() {
    if (w.html2canvas) return Promise.resolve();
    if (!h2cPromise) h2cPromise = loadScript(BASE + '/assets/js/vendor/html2canvas.min.js');
    return h2cPromise;
  }
  /* صبر تا همهٔ عکس‌ها (حتی بعد از جایگزینی تصویر کوچک با تصویر اصلی) کامل بارگذاری شوند */
  function imagesReady(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    return new Promise(function (res) {
      var t0 = Date.now();
      (function poll() {
        var pending = imgs.some(function (im) { return !im.complete; });
        if (!pending || Date.now() - t0 > 8000) return res();
        setTimeout(poll, 60);
      })();
    });
  }
  /* یک نسخهٔ ۷۶۰ پیکسلی خارج از صفحه می‌سازد تا عکس/PDF همیشه یک اندازه باشد */
  function toCanvas(inv, feed) {
    return ensureH2C().then(function () {
      var holder = document.createElement('div');
      holder.className = 'inv-export';
      document.body.appendChild(holder);
      var sheet = renderSheet(holder, inv, feed, { live: false });
      var fonts = (document.fonts && document.fonts.load) ? Promise.all([document.fonts.load('400 16px Vazirmatn'), document.fonts.load('700 16px Vazirmatn')]).catch(function () {}) : Promise.resolve();
      return Promise.all([fonts, imagesReady(sheet)]).then(function () {
        var scale = 2;
        var breaks = Array.prototype.map.call(sheet.querySelectorAll('[data-brk]'), function (n) {
          return Math.round((n.offsetTop + n.offsetHeight) * scale);
        });
        return w.html2canvas(sheet, { scale: scale, backgroundColor: '#ffffff', useCORS: true, logging: false }).then(function (canvas) {
          holder.remove();
          return { canvas: canvas, breaks: breaks };
        }, function (e) { holder.remove(); throw e; });
      });
    });
  }
  function canvasBlob(canvas, type, q) {
    return new Promise(function (res, rej) {
      canvas.toBlob(function (b) { b ? res(b) : rej(new Error('blob')); }, type, q);
    });
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  /* ساخت PDF با چند صفحهٔ A4 (بدون کتابخانه): هر صفحه یک تصویر JPEG است.
     برش صفحه‌ها فقط بین بخش‌ها/ردیف‌ها انجام می‌شود تا وسط متن بریده نشود */
  function makePdf(canvas, breaks) {
    var A4W = 595.28, A4H = 841.89;
    var pxPerPt = canvas.width / A4W, pageH = Math.floor(A4H * pxPerPt);
    var pages = [], start = 0;
    while (start < canvas.height - 2) {
      var end = Math.min(start + pageH, canvas.height);
      if (end < canvas.height) {
        var best = 0;
        breaks.forEach(function (b) { if (b > start + pageH * 0.35 && b <= end && b > best) best = b; });
        if (best) end = best;
      }
      pages.push([start, end]);
      start = end;
    }
    var chunks = [], offsets = [], pos = 0;
    var enc = new TextEncoder();
    function put(x) { var b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; }
    function obj(n, body) { offsets[n] = pos; put(n + ' 0 obj\n'); put(body); put('\nendobj\n'); }
    put('%PDF-1.4\n');
    var kids = pages.map(function (_, k) { return (3 + 3 * k) + ' 0 R'; }).join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>');
    pages.forEach(function (pg, k) {
      var sh = pg[1] - pg[0];
      var c = document.createElement('canvas');
      c.width = canvas.width; c.height = sh;
      var cx = c.getContext('2d');
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(canvas, 0, pg[0], canvas.width, sh, 0, 0, canvas.width, sh);
      var jpg = b64ToBytes(c.toDataURL('image/jpeg', 0.92).split(',')[1]);
      var hPt = sh / pxPerPt, id = 3 + 3 * k;
      obj(id, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + A4W + ' ' + A4H + '] /Resources << /XObject << /Im0 ' + (id + 2) + ' 0 R >> >> /Contents ' + (id + 1) + ' 0 R >>');
      var content = 'q ' + A4W + ' 0 0 ' + hPt.toFixed(2) + ' 0 ' + (A4H - hPt).toFixed(2) + ' cm /Im0 Do Q';
      obj(id + 1, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      offsets[id + 2] = pos;
      put((id + 2) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + c.width + ' /Height ' + sh + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
      put(jpg);
      put('\nendstream\nendobj\n');
    });
    var total = 3 + 3 * pages.length, xref = pos;
    put('xref\n0 ' + total + '\n0000000000 65535 f \n');
    for (var n = 1; n < total; n++) put(('0000000000' + offsets[n]).slice(-10) + ' 00000 n \n');
    put('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(chunks, { type: 'application/pdf' });
  }

  function fileName(inv, ext) { return inv.no + '.' + ext; }
  /* روی موبایل از منوی اشتراک‌گذاری (مستقیم به واتساپ) استفاده می‌شود، روی کامپیوتر دانلود */
  function deliver(blob, name, mime) {
    var file = null;
    try { file = new File([blob], name, { type: mime }); } catch (e) {}
    if (isTouch && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: name }).then(function () { return 'shared'; }, function (e) {
        if (e && e.name === 'AbortError') return 'cancel';
        return download(blob, name);
      });
    }
    return Promise.resolve(download(blob, name));
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return 'downloaded';
  }
  function saveImage(inv, feed) {
    return toCanvas(inv, feed).then(function (r) { return canvasBlob(r.canvas, 'image/png'); })
      .then(function (b) { return deliver(b, fileName(inv, 'png'), 'image/png'); });
  }
  function savePdf(inv, feed) {
    return toCanvas(inv, feed).then(function (r) { return deliver(makePdf(r.canvas, r.breaks), fileName(inv, 'pdf'), 'application/pdf'); });
  }

  function copyText(t) {
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = t; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e) { return false; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  /* متنی که مشتری بعد از پرداخت برای فروشنده می‌فرستد */
  function payMessage(inv, ref) {
    var t = totals(inv);
    return 'سلام، پرداخت انجام شد ✅\nشماره پیش‌فاکتور: ' + inv.no + (inv.rev > 1 ? ' (نسخه ' + nf(inv.rev) + ')' : '') +
      '\nمبلغ: ' + money(t.total) + '\nکد پیگیری: ' + ref + '\nلطفاً پرداخت را تأیید و فاکتور نهایی را بفرستید. 🙏';
  }
  function waUrl(number, text) { return 'https://wa.me/' + (number || '') + '?text=' + encodeURIComponent(text); }
  var MAX_WA_URL = 4000;
  /* پیام بلند: متن کامل کپی می‌شود و فقط چت باز می‌شود (مثل سبد خرید سایت) */
  function openWhatsApp(number, text) {
    var url = waUrl(number, text);
    if (url.length > MAX_WA_URL) {
      return copyText(text).then(function () {
        toast('متن طولانی است؛ کپی شد — در واتساپ paste کنید ✅');
        w.open('https://wa.me/' + (number || ''), '_blank', 'noopener');
      });
    }
    w.open(url, '_blank', 'noopener');
    return Promise.resolve();
  }
  function phoneToWa(v) {
    var d = normDigits(v).replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.charAt(0) === '0') d = '98' + d.slice(1);
    else if (d.length === 10 && d.charAt(0) === '9') d = '98' + d;
    return d;
  }

  w.GInvoice = {
    BASE: BASE, normDigits: normDigits, toNum: toNum, nf: nf, money: money, esc: esc, clip: clip, el: el,
    fmtDate: fmtDate, makeNo: makeNo, remainText: remainText, isExpired: isExpired, totals: totals,
    pack: pack, unpack: unpack, invoiceUrl: invoiceUrl, linkOf: linkOf, resolve: resolve, titleOf: titleOf, payMessage: payMessage, loadFeed: loadFeed, sellerKnown: sellerKnown,
    buildText: buildText, sheetHTML: sheetHTML, renderSheet: renderSheet, watchExpiry: watchExpiry,
    saveImage: saveImage, savePdf: savePdf, copyText: copyText, toast: toast, openWhatsApp: openWhatsApp,
    phoneToWa: phoneToWa, _makePdf: makePdf, _toCanvas: toCanvas
  };
})(window);
