/* ابزار فاکتور فروشگاه غریبی کیش — ماژول مشترک (صفحهٔ فروشنده + صفحهٔ فاکتور مشتری)
   - فاکتور داخل خود لینک ذخیره می‌شود (بعد از #) و هیچ‌جا به سرور فرستاده نمی‌شود
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
      return 'F-' + m.year + m.month + m.day + '-' + m.hour + m.minute + m.second;
    } catch (e) { return 'F-' + d.getTime().toString(36).toUpperCase(); }
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

  /* ---------- لینک (فاکتور داخل خود لینک) ---------- */
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
      inv.rev > 1 ? inv.rev : 0, inv.paid ? (inv.paid.ref || '') : '', inv.paid ? inv.paid.at.toString(36) : '',
      inv.addr || '', inv.ph || '', inv.pm || ''];
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
          cust: clip(a[4], 60), sn: '', sw: clip(a[5], 20).replace(/\D/g, ''), addr: clip(a[13], 300), ph: clip(a[14], 15).replace(/\D/g, ''),
          fee: toNum(a[6]), disc: toNum(a[7]), note: clip(a[8], 300), items: [],
          rev: Math.min(99, Math.max(1, Math.round(Number(a[10]) || 1))), paid: null,
          pm: a[15] === 'o' || a[15] === 'c' ? a[15] : ''     /* روش پرداخت: ''=هر دو، o=فقط درگاه آنلاین، c=فقط کارت‌به‌کارت */
        };
        if (a[12]) inv.paid = { ref: clip(a[11], 40), at: parseInt(a[12], 36) || ts };   /* کد پیگیری اختیاری است؛ تاریخ تأیید نشانهٔ پرداخت است */
        rows = a[9];
      } else if (a[0] === VERSION && Array.isArray(a[10])) {
        inv = {
          no: clip(a[1], 40), ts: Number(a[2]) || 0, exp: Number(a[3]) || 0,
          cust: clip(a[4], 60), sn: clip(a[5], 40), sw: clip(a[6], 20).replace(/\D/g, ''), addr: '', ph: '',
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
    var suf = String(no || '').replace(/^(?:PF|F)-/, '').replace(/[^0-9A-Za-z-]/g, '') + (rev > 1 ? '-r' + rev : '');
    return location.origin + BASE + '/invoice/#' + tok + (suf ? '.' + suf : '');
  }
  function invoiceUrl(inv) { return inv.code ? shortUrl(inv.code) : linkOf(pack(inv), inv.no, inv.rev); }


  /* ---------- سرور لینک کوتاه و گزارش (Cloudflare Worker) ----------
     آدرس در _config.yml → invoice_api. اگر خالی باشد همه‌چیز مثل قبل با لینک بلند کار می‌کند. */
  var API_RAW = String((document.querySelector('meta[name="invoice-api"]') || {}).content || '').trim();
  var API = API_RAW === '/' ? '' : API_RAW.replace(/\/+$/, '');
  var CODE_RE = /^\d{6}-\d{4}-[a-z2-9]{4,16}$/, KEYSTORE = 'gharibii_seller_key';
  function apiOn() { return !!API_RAW; }
  function isCode(s) { return CODE_RE.test(String(s || '')); }
  function codeIn(s) { var m = String(s || '').match(/\d{6}-\d{4}-[a-z2-9]{4,16}/); return m ? m[0] : ''; }
  function shortUrl(code) { return location.origin + BASE + '/f/' + code; }
  function sellerKey(ask) {
    var k = '';
    try { k = localStorage.getItem(KEYSTORE) || ''; } catch (e) {}
    if (!k && ask) {
      k = String(w.prompt('رمز فروشنده را وارد کنید (روی همین دستگاه ذخیره می‌شود):') || '').trim();
      if (k) { try { localStorage.setItem(KEYSTORE, k); } catch (e) {} }
    }
    return k;
  }
  function apiCall(method, path, body, auth) {
    var headers = { 'Content-Type': 'application/json' };
    if (auth) {
      var k = sellerKey(true);
      if (!k) return Promise.reject({ status: 401 });
      headers['X-Seller-Key'] = k;
    }
    return fetch(API + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401) { try { localStorage.removeItem(KEYSTORE); } catch (e) {} }   /* رمز اشتباه: دفعهٔ بعد دوباره پرسیده می‌شود */
          if (!r.ok) throw { status: r.status, data: j };
          return j;
        });
      });
  }
  function noPaid(inv) { var c = {}; Object.keys(inv).forEach(function (k) { c[k] = inv[k]; }); c.paid = null; return c; }
  function remoteBody(inv) {
    return {
      tok: pack(noPaid(inv)), no: inv.no, total: totals(inv).total, n: inv.items.length, cust: inv.cust, exp: inv.exp, ts: inv.ts,
      ph: inv.ph || '', addr: inv.addr || '', rev: inv.rev || 1,
      msg: buildText(inv, curFeed, ''),
      items: inv.items.map(function (i) { return { t: titleOf(i, curFeed), q: i.q, o: i.o || '' }; })
    };
  }
  function apiCreate(inv) { return apiCall('POST', '/api/invoices', remoteBody(inv), true).then(function (r) { return r.code; }); }
  function apiRevise(code, inv) { return apiCall('PUT', '/api/invoices/' + code, remoteBody(inv), true); }
  function apiSetPaid(code, paid) { return apiCall('PUT', '/api/invoices/' + code, { paid: paid ? { ref: paid.ref || '', at: paid.at } : null }, true); }
  function apiGet(code) {
    return apiCall('GET', '/api/invoices/' + code).then(function (rec) {
      var inv = unpack(rec.tok);
      if (!inv) throw { status: 422 };
      inv.paid = rec.paid ? { ref: clip(rec.paid.ref, 40), at: Number(rec.paid.at) || inv.ts, via: rec.paid.via === 'zp' ? 'zp' : '' } : null;
      inv.code = code; inv.rep = rec.rep || null;
      return inv;
    });
  }
  function apiList() { return apiCall('GET', '/api/invoices', null, true); }
  function apiCheck(code) { return apiCall('PUT', '/api/invoices/' + code + '/check', {}, true); }
  function apiPay(code) { return apiCall('POST', '/api/invoices/' + code + '/pay', {}); }
  function apiReport(code, ref) { return apiCall('POST', '/api/invoices/' + code + '/report', { ref: ref || '' }); }
  function apiPing() { return apiCall('GET', '/api/ping', null, true); }
  function apiReportNow(period) { return apiCall('GET', '/api/report?period=' + period + '&send=1', null, true); }

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

  /* شماره موبایل برای نمایش: 989347688356 یا 09347688356 → 0934 768 8356 */
  function mobileFa(v) {
    var d = normDigits(v).replace(/\D/g, '');
    if (d.indexOf('98') === 0 && d.length === 12) d = '0' + d.slice(2);
    if (d.length === 10 && d.charAt(0) === '9') d = '0' + d;
    return d.length === 11 ? d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7) : d;
  }
  /* شماره‌های موبایل فروشگاه (دو فروشنده) که زیر فاکتور چاپ می‌شود */
  function storeContacts(feed) {
    var out = [];
    ((feed && feed.sellers) || []).forEach(function (s) { var m = mobileFa(s.number); if (m) out.push({ name: s.name, mobile: m }); });
    return out.slice(0, 2);
  }
  function storeMobiles(feed) { return storeContacts(feed).map(function (c) { return c.mobile; }); }

  /* ---------- متن فاکتور (برای واتساپ، تلگرام، بله، اینستاگرام) ---------- */
  /* شماره‌های لاتین داخل متن فارسی: جداکننده‌ها (فاصله) در پاراگراف راست‌به‌چپ جابه‌جا نشوند */
  function ltrIso(s) { return s ? '\u2066' + s + '\u2069' : s; }
  /* هر خط با نشانهٔ راست‌به‌چپ شروع می‌شود تا ترتیب اعداد و علامت‌ها (× و =) در تلگرام و واتساپ برعکس نشود */
  function rtlLines(text) {
    return text.split('\n').map(function (l) { return l && l.indexOf('http') !== 0 ? '\u200F' + l : l; }).join('\n');
  }
  function buildText(inv, feed, link) {
    var t = totals(inv), store = (feed && feed.store) || 'فروشگاه غریبی کیش';
    var m = '🧾 فاکتور ' + store + '\n';
    m += 'شماره: ' + inv.no + (inv.rev > 1 ? ' (نسخه ' + nf(inv.rev) + ')' : '') + '\n';
    m += 'تاریخ: ' + fmtDate(inv.ts) + '\n';
    if (!inv.paid) m += 'اعتبار تا: ' + fmtDate(inv.exp) + '\n';
    if (inv.cust) m += 'مشتری: ' + inv.cust + '\n';
    if (inv.ph) m += 'شماره تماس: ' + ltrIso(mobileFa(inv.ph)) + '\n';
    var sl = sellerKnown(feed, inv.sw);
    if (sl) m += 'فروشنده: ' + sl.name + ' — ' + ltrIso(mobileFa(sl.number)) + '\n';
    if (inv.addr) m += 'آدرس: ' + inv.addr + '\n';
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
      m += '\n✅ پرداخت تأیید شد' + (inv.paid.ref ? '. کد پیگیری: ' + inv.paid.ref : '') + ' (' + fmtDate(inv.paid.at) + ')';
    } else {
      m += '\n⏳ در انتظار پرداخت. این فاکتور تا ' + fmtDate(inv.exp) + ' معتبر است و قیمت و موجودی نهایی پس از تأیید فروشنده قطعی می‌شود.';
    }
    if (link) m += '\n\n🔗 مشاهده فاکتور:\n' + link;
    return rtlLines(m);
  }

  /* ---------- ظاهر فاکتور (همان ظاهر در صفحه، عکس و PDF) ---------- */
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
      ? '<b class="v-expired">مهلت پرداخت این فاکتور تمام شده است.</b> برای قیمت و موجودی به‌روز با فروشنده هماهنگ کنید.'
      : 'مهلت پرداخت تا <b>' + esc(fmtDate(inv.exp)) + '</b>' + (o.live && rem ? ' (<span data-remain>' + esc(rem) + '</span> مانده)' : '');

    var meta = '<div class="m-item"><span>شماره</span><b class="ltr" dir="ltr">' + esc(inv.no) + '</b></div>' +
      (inv.rev > 1 ? '<div class="m-item"><span>نسخه</span><b>' + nf(inv.rev) + '</b></div>' : '') +
      '<div class="m-item"><span>تاریخ صدور</span><b>' + esc(fmtDate(inv.ts)) + '</b></div>' +
      ((seller || inv.sn) ? '<div class="m-item"><span>فروشنده</span><b>' + esc(seller ? seller.name : inv.sn) + '</b></div>' : '') +
      (seller ? '<div class="m-item"><span>موبایل فروشنده</span><b class="ltr" dir="ltr">' + esc(mobileFa(seller.number)) + '</b></div>' : '') +
      (inv.paid && inv.paid.ref ? '<div class="m-item"><span>کد پیگیری پرداخت</span><b class="ltr" dir="ltr">' + esc(inv.paid.ref) + '</b></div>' : '');

    /* مشخصات گیرنده: نام، تلفن، آدرس و کد پستی (کد پستی از انتهای آدرس جدا می‌شود) */
    var pm = String(inv.addr || '').match(/(?:[،,]\s*)?کد\s*پستی\s*[:：]?\s*([0-9۰-۹]{10})/);
    var addrText = pm ? String(inv.addr).replace(pm[0], '').replace(/^[\s،,]+|[\s،,]+$/g, '') : String(inv.addr || '').trim();
    var postal = pm ? normDigits(pm[1]).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(Number(d)); }) : '';
    var custBox = (inv.cust || inv.ph || addrText || postal)
      ? '<div class="inv-cust" data-brk><div class="ic-title">مشخصات گیرنده</div>' +
          (inv.cust ? '<div class="ic-row"><span>نام</span><b>' + esc(inv.cust) + '</b></div>' : '') +
          (inv.ph ? '<div class="ic-row"><span>تلفن</span><b class="ltr" dir="ltr">' + esc(mobileFa(inv.ph)) + '</b></div>' : '') +
          (addrText ? '<div class="ic-row ic-wide"><span>آدرس</span><b>' + esc(addrText) + '</b></div>' : '') +
          (postal ? '<div class="ic-row"><span>کد پستی</span><b class="ltr" dir="ltr">' + postal + '</b></div>' : '') +
        '</div>' : '';

    /* اطلاعات پرداخت داخل خود فاکتور (برای عکس/PDF که فروشنده می‌فرستد؛ صفحهٔ زندهٔ مشتری کادر پرداخت جدا دارد) */
    var bank = feed && feed.bank, bcard = bank ? String(bank.card || '').replace(/\D/g, '') : '', payBox = '';
    if (!o.live && !inv.paid && !expired && /^\d{16}$/.test(bcard)) {
      var fa10 = function (x) { return String(x).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(Number(d)); }); };
      if (inv.pm === 'o') {
        payBox = '<div class="inv-cust" data-brk><div class="ic-title">روش پرداخت</div><div class="ic-row ic-wide"><b>پرداخت آنلاین از طریق لینک این فاکتور انجام می‌شود.</b></div></div>';
      } else {
        /* همان کارت بانکی صفحهٔ مشتری (گرادیان و تراشه)، تا در عکس/PDF هم شبیه کارت واقعی دیده شود */
        payBox = '<div class="inv-cust inv-pay" data-brk><div class="ic-title">پرداخت کارت‌به‌کارت</div>' +
          '<div class="bank-card">' +
            '<div class="bc-top"><span class="bc-bank">' + esc(bank.name || '') + '</span><span class="bc-chip" aria-hidden="true"></span></div>' +
            '<div class="bc-num" dir="ltr">' + bcard.replace(/(\d{4})(?=\d)/g, '$1 ') + '</div>' +
            '<div class="bc-bottom"><div class="bc-owner"><small>به نام</small><b>' + esc(bank.owner || '') + '</b></div></div>' +
          '</div>' +
          '<div class="ic-row ic-wide"><span>مبلغ قابل پرداخت</span><b>' + money(t.total) + '</b></div>' +
          (inv.pm === 'c' ? '<div class="ic-row ic-wide"><b>پرداخت این فاکتور فقط از طریق کارت‌به‌کارت انجام می‌شود.</b></div>' : '') +
        '</div>';
      }
    }

    var contacts = storeContacts(feed), foot = [];
    if (contacts.length && !seller) foot.push('☎ ' + contacts.map(function (c) { return esc(c.name) + ' <span dir="ltr">' + esc(c.mobile) + '</span>'; }).join(' · '));
    if (feed && feed.address) foot.push(esc(feed.address));

    var notice = inv.paid
      ? '<b>پرداخت این فاکتور تأیید شده است.</b><br>تاریخ تأیید: <b>' + esc(fmtDate(inv.paid.at)) + '</b>'
      : '<b>وضعیت: در انتظار پرداخت.</b><br>' + validLine +
        '<br>سفارش بعد از پرداخت و تأیید فروشنده ثبت می‌شود.' + (inv.rev > 1 ? ' این نسخهٔ ' + nf(inv.rev) + ' است؛ فقط آخرین نسخه معتبر است.' : '');

    return '<div class="inv-sheet' + (expired ? ' is-expired' : '') + '" dir="rtl">' +
      '<div class="inv-head" data-brk>' +
        '<img class="h-logo" src="' + BASE + '/assets/images/gharibii-store-logo.webp" alt="" width="64" height="64" crossorigin="anonymous">' +
        '<div class="h-text"><div class="h-store">' + esc(store) + '</div><div class="h-title">فاکتور</div></div>' +
        '<span class="h-status' + (inv.paid ? ' paid' : (expired ? ' late' : '')) + '">' + (inv.paid ? '✅ پرداخت‌شده' : (expired ? '⌛ مهلت تمام شده' : '⏳ در انتظار پرداخت')) + '</span>' +
      '</div>' +
      '<div class="inv-meta" data-brk>' + meta + '</div>' +
      custBox +
      '<div class="inv-notice' + (inv.paid ? ' is-paid' : '') + '" data-brk>' + notice + '</div>' +
      '<div class="inv-rows">' + rows + '</div>' +
      '<div class="inv-totals" data-brk>' + totalRows + '</div>' +
      payBox +
      (inv.note ? '<div class="inv-note" data-brk><b>یادداشت:</b> ' + esc(inv.note) + '</div>' : '') +
      '<div class="inv-foot" data-brk>' + (foot.length ? foot.join('<br>') + '<br>' : '') + 'با تشکر از اعتماد شما 🎀</div>' +
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
  function toCanvas(inv, feed, sc) {
    return ensureH2C().then(function () {
      var holder = document.createElement('div');
      holder.className = 'inv-export';
      document.body.appendChild(holder);
      var sheet = renderSheet(holder, inv, feed, { live: false });
      var fonts = (document.fonts && document.fonts.load) ? Promise.all([document.fonts.load('400 16px Vazirmatn'), document.fonts.load('700 16px Vazirmatn')]).catch(function () {}) : Promise.resolve();
      return Promise.all([fonts, imagesReady(sheet)]).then(function () {
        var scale = sc || 2, off = sheet.offsetTop;
        var breaks = Array.prototype.map.call(sheet.querySelectorAll('[data-brk]'), function (n) {
          return Math.round((off + n.offsetTop + n.offsetHeight) * scale);
        });
        var base = (w.getComputedStyle(holder).backgroundColor) || '#ffffff';
        return w.html2canvas(holder, { scale: scale, backgroundColor: base, useCORS: true, logging: false }).then(function (canvas) {
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
      var jpg = b64ToBytes(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
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
  /* کامپیوتر: دانلود مستقیم. موبایل: یک برگهٔ پایین‌صفحه با پیش‌نمایش و دو راه روشن —
     «ذخیره» (دانلود در گالری/فایل‌ها) و «ارسال» (منوی اشتراک‌گذاری)؛ قبلاً فقط منوی اشتراک باز می‌شد و گزینهٔ ذخیره نبود */
  function deliver(blob, name, mime) {
    var file = null;
    try { file = new File([blob], name, { type: mime }); } catch (e) {}
    if (isTouch) return Promise.resolve(saveSheet(blob, name, mime, file));
    return Promise.resolve(download(blob, name));
  }
  function saveSheet(blob, name, mime, file) {
    var old = document.querySelector('.save-sheet');
    if (old) old.remove();
    var url = URL.createObjectURL(blob), isImg = /^image\//.test(mime);
    var canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    var el = document.createElement('div');
    el.className = 'save-sheet';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="ss-back" data-ss="close"></div><div class="ss-panel">' +
      '<div class="ss-grip" aria-hidden="true"></div>' +
      '<h3>' + (isImg ? 'عکس فاکتور آماده است' : 'PDF فاکتور آماده است') + '</h3>' +
      (isImg ? '<div class="ss-prev"><img alt="" src="' + url + '"></div>' : '<div class="ss-file">📄 <b dir="ltr">' + esc(name) + '</b></div>') +
      '<p class="ss-hint">' + (isImg
        ? 'روی «ذخیره» بزنید. اگر عکس در گالری نیامد، انگشت را روی عکس نگه دارید و «ذخیره تصویر» را بزنید.'
        : 'روی «ذخیره» بزنید تا فایل در دانلودهای گوشی بیاید.') + '</p>' +
      '<div class="ss-actions">' +
        '<a class="btn btn-primary" data-ss="save" role="button">⬇ ذخیره</a>' +
        (canShare ? '<button type="button" class="btn" data-ss="share">ارسال…</button>' : '') +
        '<button type="button" class="btn btn-ghost" data-ss="close">بستن</button>' +
      '</div></div>';
    document.body.appendChild(el);
    var a = el.querySelector('[data-ss="save"]');
    a.href = url; a.download = name;
    document.documentElement.classList.add('ss-open');
    function close() {
      el.remove(); document.documentElement.classList.remove('ss-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-ss]') : null;
      if (!t) return;
      var k = t.getAttribute('data-ss');
      if (k === 'close') close();
      else if (k === 'save') { toast('در حال ذخیره…'); setTimeout(close, 1200); }
      else if (k === 'share') navigator.share({ files: [file], title: name }).then(close, function () {});
    });
    return 'sheet';
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
    /* PNG بدون افت کیفیت است و برای فاکتور (عکس محصول + پس‌زمینهٔ گرادیان) چند مگابایت می‌شد؛ JPEG با کیفیت ۸۶٪ حدود ۵ تا ۱۰ برابر کوچک‌تر و برای متن هنوز تمیز است */
    return toCanvas(inv, feed, 1.5).then(function (r) {
      var c = document.createElement('canvas');
      c.width = r.canvas.width; c.height = r.canvas.height;
      var cx = c.getContext('2d');
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(r.canvas, 0, 0);
      return canvasBlob(c, 'image/jpeg', 0.86);
    }).then(function (b) { return deliver(b, fileName(inv, 'jpg'), 'image/jpeg'); });
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
  /* متنی که مشتری بعد از پرداخت برای فروشنده می‌فرستد (کد پیگیری اختیاری است) */
  function payMessage(inv, ref) {
    var t = totals(inv);
    return 'سلام، پرداخت انجام شد ✅\nشماره فاکتور: ' + inv.no + (inv.rev > 1 ? ' (نسخه ' + nf(inv.rev) + ')' : '') +
      '\nمبلغ: ' + money(t.total) + (ref ? '\nکد پیگیری: ' + ref : '') +
      '\nلطفاً پرداخت را تأیید کنید و فاکتور تأییدشده را برایم بفرستید. 🙏';
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


  /* ---------- خواندن پیام مشتری (محصولات، سایز/رنگ/اندازه، نام، موبایل، آدرس، یادداشت) ---------- */
  function fa(s) {   /* یکسان‌سازی ارقام و حروف عربی/فارسی */
    return normDigits(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  }
  function nzs(s) { return fa(s).toLowerCase().replace(/[\u200c\u064b-\u065f]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function decU(x) { try { return decodeURIComponent(x); } catch (e) { return x; } }
  function pathOf(url) {
    try {
      var path = decU(new URL(url).pathname);
      if (path.indexOf('/products/') < 0) return '';
      return path.slice(-1) === '/' ? path : path + '/';
    } catch (e) { return ''; }
  }
  function findByPath(feed, path) {
    var best = null, bs = 0;
    feed.products.forEach(function (p) {
      var id = decU(String(p.id)), sc = 0;
      if (id === path) sc = 4;
      else if (path.slice(-id.length) === id) sc = 3;
      if (sc > bs) { bs = sc; best = p; }
    });
    return best;
  }
  function qtyIn(s) {
    var m = s.match(/(?:^|\s)(\d{1,3})\s*[×xX]\s*[\d,٬]/) || s.match(/[×xX*]\s*(\d{1,3})(?!\d)/) ||
      s.match(/(\d{1,3})\s*عدد/) || s.match(/تعداد\s*[:：]?\s*(\d{1,3})/);
    return m ? Math.min(99, Math.max(1, Number(m[1]))) : 0;
  }
  /* موبایل ایران: 09…، +98…، 0098… ؛ در خط «شماره/موبایل» حتی بدون صفر اول (۹۱۲…) */
  function phoneIn(s, loose, skip) {
    var d = fa(s).replace(/[\s\-().]/g, ''), re = /(^|\D)((?:\+?98|0098|0)?9\d{9})(?!\d)/g, m;
    while ((m = re.exec(d))) {
      var raw = m[2], strict = /^(?:\+?98|0098|0)/.test(raw);
      if (!strict && !loose) continue;
      var ten = raw.replace(/^\+?(?:98|0098)|^0/, '');
      if (ten.length !== 10) continue;
      var out = '0' + ten;
      if (skip && skip.indexOf(out) >= 0) continue;
      return out;
    }
    return '';
  }
  var OPT_RE = /(^|[\s،,|(\[\-–—])(سایز|اندازه|رنگ|سن|قد|وزن|طرح|مدل|جنس|پارچه|توضیحات|توضیح)\s*(?:[:：=]\s*|\s+)/g;
  /* همهٔ «کلید: مقدار»های محصول در یک خط: سایز ۶ - رنگ آبی - ۲ عدد */
  function optsIn(line) {
    var res = {}, hits = [], m;
    OPT_RE.lastIndex = 0;
    while ((m = OPT_RE.exec(line))) hits.push({ k: m[2], at: m.index + m[1].length, vs: OPT_RE.lastIndex });
    hits.forEach(function (h, i) {
      var v = line.slice(h.vs, i + 1 < hits.length ? hits[i + 1].at : line.length);
      v = v.split(/\s[-–—]\s|[،,|]|×|تعداد|\d+\s*عدد/)[0];
      v = clip(v.replace(/^[\s:：=]+|[\s:：=]+$/g, ''), 40);
      if (v) res[h.k === 'توضیحات' ? 'توضیح' : h.k] = v;
    });
    if (!res['سایز'] && !res['سن']) {
      var age = line.match(/(\d{1,2})\s*(?:ساله|سال)(?!\S)/);
      if (age) res['سن'] = age[1] + ' سال';
    }
    return res;
  }
  /* برچسب‌ها: دونقطه اختیاری است («اسم و فامیل علی رضایی»)، و ایموجی/شمارهٔ ابتدای خط نادیده گرفته می‌شود */
  var RX_NAME = /^(?:نام(?:\s*و\s*نام\s*خانوادگی)?(?:\s*(?:گیرنده|مشتری|خریدار))?|اسم(?:\s*و\s*فامیل(?:ی)?)?(?:\s*(?:گیرنده|مشتری))?|تحویل\s*گیرنده|گیرنده|مشتری|خریدار|به\s*نام)(?:\s*[:：\-–]\s*|\s+)(?!محصول|کالا|فروشگاه)(.+)$/;
  var RX_PHONE = /^(?:شماره(?:\s*(?:تماس|موبایل|همراه|تلفن|واتساپ))?|تلفن|موبایل|همراه|تماس|واتساپ)\s*[:：\-–]?\s*(.*)$/;
  var RX_ADDR = /^(?:آدرس|ادرس|نشانی)(?:\s*(?:کامل|تحویل|ارسال|گیرنده|پستی))?\s*[:：\-–]?\s*(.*)$/;
  var RX_POST = /^کد[\s\u200c]*پستی\s*[:：\-–]?\s*(\d[\d\s-]*)$/;
  var RX_NOTE = /^(?:(?:یادداشت|نکته|توضیحات|توضیح|ملاحظات|پیام|درخواست(?:\s*خاص)?)\s*[:：\-–]\s*|(?:یادداشت|ملاحظات)\s+)(.*)$/;
  var RX_CHAT = /(?:^|\s)(?:سلام|درود|وقت\s*بخیر|روز\s*بخیر|عصر\s*بخیر|شب\s*بخیر|عرض\s*ادب|ممنونم?|مرسی|متشکرم?|تشکر|سپاس|خسته\s*نباشید|دمت\s*گرم|ببخشید|لطفا|لطفاً|باتشکر|با\s*تشکر|خواهش\s*می‌?کنم)(?=\s|$|[،,.!؟?:])/g;
  var RX_NOTE_WORDS = /لطفا|لطفاً|عجله|سریع|هرچه\s*زودتر|باشه|بشه|بسته|هدیه|زنگ|تماس|نمی.?خوام|قبل\s*از|بعد\s*از|ساعت/;
  var RX_TEMPLATE = /مشخصات\s*ارسال|بعد\s*از\s*«|می.?خوام\s*این|سفارش\s*بدم|نهایی.?سازی|راهنمایی.?ام|فروشگاه\s*غریبی/;
  /* نشانه‌های آدرس برای پیام‌های بدون برچسب */
  var RX_ADDR_HINT = /(?:استان|شهرستان|شهر|خیابان|خ\s|کوچه|کوچ|بلوار|میدان|پلاک|واحد|طبقه|منطقه|محله|جاده|بزرگراه|اتوبان|فلکه|بن\s*بست|شهرک|روستا|کوی|ساختمان|ط\s*\d|پ\s*\d|تهران|اصفهان|شیراز|مشهد|تبریز|کرج|اهواز|قم|کیش|رشت|ساری|یزد|کرمان|ارومیه|زاهدان|همدان|اراک|بندرعباس|قزوین|گرگان|سنندج|کرمانشاه|خرم\s*آباد|بوشهر|ایلام|اردبیل|زنجان|سمنان|بیرجند|یاسوج|شهرکرد|بجنورد)/;
  var RX_NOT_NAME = /(?:سلام|ممنون|متشکر|مرسی|تشکر|ببخشید|لطفا|لطفاً|خواهش|سفارش|محصول|قیمت|ارسال|هزینه|سایز|رنگ|عدد|تومان|فاکتور|پرداخت|کارت|حساب|موجود|ممنونم|خسته|درود|وقت\s*بخیر|عرض\s*ادب|جمع|تخفیف|تعداد|لینک|واتساپ|تلگرام|موبایل|شماره|تلفن|کد|آدرس|ادرس|نشانی)/;
  var RX_STOP = /^(?:━|🧾|🚚|💳|⚠|💰|🔗|🙏|🌸|🛍)/;   /* ⚠ به‌صورت گروه: داخل [] ایموجی‌ها نیم‌کاراکتر می‌شدند و 👤📞📍 هم «پایان» حساب می‌شدند */

  function parseCustomerMessage(text, feed) {
    var out = { items: [], lost: 0, name: '', phone: '', addr: '', note: '' };
    var skip = ((feed && feed.sellers) || []).map(function (s) { return '0' + String(s.number).slice(-10); });
    var titles = ((feed && feed.products) || []).map(function (p) { return nzs(p.t); });
    var addr = [], note = [], cur = null, mode = '', free = [], phoneAt = -1, postal = '';
    var lines = fa(text).split(/\r?\n/);
    lines.forEach(function (raw, idx) {
      var ln = raw.trim(), m;
      if (!ln) { mode = ''; return; }
      var urls = ln.match(/https?:\/\/[^\s)>\]]+/g) || [];
      if (urls.length) {
        mode = '';
        urls.forEach(function (u) {
          var path = pathOf(u);
          if (!path) return;
          var p = feed && feed.products ? findByPath(feed, path) : null;
          if (p) { cur = { p: p, q: 1, o: {} }; out.items.push(cur); } else { cur = null; out.lost++; }
        });
        ln = ln.replace(/https?:\/\/\S+/g, ' ').trim();
        if (!ln) return;
      }
      if (RX_STOP.test(ln)) { mode = ''; return; }
      /* ایموجی، بولت و علامت‌های ابتدای خط («📍آدرس:»، «- نام:») حذف می‌شود؛ شمارهٔ فهرست («1.») نه، تا عنوان محصولات با نام اشتباه نشود */
      var numbered = /^\s*\d{1,2}\s*[.)\-]\s*\S/.test(ln);
      ln = ln.replace(/^[^\u0600-\u06FFA-Za-z0-9]+/, '').trim();
      if (!ln) return;
      /* برچسبِ خالی (قالب پر نشده): فقط حالت را تنظیم می‌کند؛ «آدرس:» خالی یعنی خط‌های بعدی تا برچسب بعدی آدرس‌اند */
      if (/^(?:نام(?:\s*و\s*نام\s*خانوادگی)?|اسم(?:\s*و\s*فامیل)?|شماره(?:\s*(?:تماس|موبایل|همراه))?|موبایل|تلفن|کد[\s\u200c]*پستی|آدرس|ادرس|نشانی|یادداشت|توضیحات|ملاحظات)\s*[:：]\s*$/.test(ln)) { mode = /^(?:آدرس|ادرس|نشانی)/.test(ln) ? 'addr' : /^(?:یادداشت|توضیحات|ملاحظات)/.test(ln) ? 'note' : ''; cur = null; return; }
      if ((m = ln.match(RX_NAME)) && !numbered) { out.name = clip(m[1].replace(phoneRe, ' '), 60); cur = null; mode = ''; return; }
      if ((m = ln.match(RX_PHONE))) { var ph = phoneIn(m[1], true, skip); if (ph && !out.phone) { out.phone = ph; phoneAt = idx; } cur = null; mode = ''; return; }
      if ((m = ln.match(RX_POST))) { postal = m[1].replace(/\D/g, ''); addr.push('کد پستی: ' + postal); cur = null; return; }
      if ((m = ln.match(RX_ADDR))) { if (m[1]) addr.push(m[1]); cur = null; mode = 'addr'; return; }
      if ((m = ln.match(RX_NOTE))) { if (m[1]) note.push(m[1]); cur = null; mode = 'note'; return; }
      if (mode === 'addr') { addr.push(ln); return; }   /* زیر «آدرس:» هر خطی تا برچسب بعدی جزو آدرس است، به همان ترتیبی که نوشته شده */
      if (mode === 'note') { note.push(ln); return; }
      var ph2 = phoneIn(ln, false, skip);
      if (ph2 && !out.phone) { out.phone = ph2; phoneAt = idx; }
      var used = false;
      if (cur) {
        var q = qtyIn(ln); if (q) { cur.q = q; used = true; }
        var o = optsIn(ln);
        Object.keys(o).forEach(function (k) { cur.o[k] = o[k]; used = true; });
      }
      if (!used && !numbered) free.push({ i: idx, ln: ln, ph: !!ph2 });
    });

    /* ---- پیام بدون برچسب: نام، آدرس و کد پستی از روی شکل خط‌ها حدس زده می‌شود ---- */
    function cleaned(ln) {   /* خط بدون موبایل، کد پستی و علامت‌ها */
      return ln.replace(phoneRe, ' ').replace(/\b\d{10}\b/g, ' ').replace(/[\d:：،,.\-–_()\[\]|/\\]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function isTitle(ln) {
      var n = nzs(ln);
      return n.length >= 6 && titles.some(function (t) { return t.indexOf(n) >= 0 || n.indexOf(t) >= 0; });
    }
    var rest = [];
    free.forEach(function (f) {
      var ln = f.ln;
      /* کد پستی بدون برچسب: ۱۰ رقم که با ۰ و (در خط بدون برچسب) با ۹ شروع نشود */
      var pm = ln.match(/(?:^|\D)([1-8]\d{9})(?!\d)/);
      if (!pm && !postal && out.phone && /^\d{10}$/.test(ln.replace(/\s/g, ''))) pm = [0, ln.replace(/\s/g, '')];   /* خط فقط ۱۰ رقم و موبایل قبلاً پیدا شده → کد پستی (حتی اگر با ۹ شروع شود) */
      if (pm && !postal) { postal = pm[1]; ln = ln.replace(pm[1], ' ').trim(); if (!cleaned(ln)) return; }
      f.ln = ln;
      rest.push(f);
    });
    if (!addr.length) {
      var picked = rest.filter(function (f) { return RX_ADDR_HINT.test(f.ln) && !isTitle(f.ln) && !/سلام|سفارش|فروشگاه|محصول|لطفا|ممنون|راهنمایی/.test(f.ln) && !RX_NOTE_WORDS.test(f.ln); });
      if (picked.length) {
        picked.forEach(function (f) { addr.push(f.ln.replace(phoneRe, ' ').replace(/^ارسال\s*به\s*/, '').replace(/\s+/g, ' ').trim()); });
        rest = rest.filter(function (f) { return picked.indexOf(f) < 0; });
      }
      if (postal && addr.length) addr.push('کد پستی: ' + postal);
    } else if (postal && !addr.some(function (a) { return a.indexOf(postal) >= 0; })) {
      addr.push('کد پستی: ' + postal);
    }
    if (!out.name) {
      var cands = rest.filter(function (f) {
        var c = cleaned(f.ln), wc = c ? c.split(' ').length : 0;
        if (!c || c.length > 40 || RX_NOT_NAME.test(c) || RX_ADDR_HINT.test(c) || isTitle(f.ln)) return false;
        if (/[?؟!]/.test(f.ln) || /[a-zA-Z]/.test(c)) return false;
        return wc >= 2 && wc <= 4 || (wc === 1 && phoneAt >= 0 && Math.abs(f.i - phoneAt) <= 1);
      });
      if (cands.length) {
        var near = cands.filter(function (f) { return phoneAt >= 0 && Math.abs(f.i - phoneAt) <= 1; })[0];
        var nl = near || cands[0]; nl.used = true;
        out.name = clip(cleaned(nl.ln), 60);
      }
    }

    /* هر خط باقی‌مانده (نه نام، نه آدرس، نه موبایل/کد پستی، نه سلام و تشکر و متن خود سایت) یادداشت است */
    var extra = [];
    {
      rest.forEach(function (f) {
        if (f.used) return;
        var ln = f.ln;
        if (RX_TEMPLATE.test(ln) || isTitle(ln)) return;
        var body = ln.replace(phoneRe, ' ').replace(RX_CHAT, ' ').replace(/[\s:：،,.!؟?\-–_()\[\]|/\\]+/g, ' ').trim();
        if (body.replace(/\d/g, '').length < 3) return;
        extra.push(ln.replace(phoneRe, ' ').replace(/\s+/g, ' ').trim());
      });
    }

    if (!out.items.length && !out.lost && feed && feed.products) {
      var nt = nzs(text);
      feed.products.forEach(function (p) { var t = nzs(p.t); if (t.length >= 8 && nt.indexOf(t) >= 0) out.items.push({ p: p, q: 1, o: {} }); });
    }
    /* باکس یادداشت حذف شد: هر چیزی که آدرس/نام/موبایل نبود به همان آدرس اضافه می‌شود (کد پستی آخر) */
    var pc = addr.filter(function (a) { return /^کد پستی:/.test(a); }), ad = addr.filter(function (a) { return !/^کد پستی:/.test(a); });
    out.addr = clip(ad.concat(extra, pc).join('، '), 300);
    out.note = clip(note.join(' · '), 300);
    return out;
  }
  var phoneRe = /(?:\+?98|0098|0)?9\d{9}(?!\d)/g;

  w.GInvoice = {
    BASE: BASE, normDigits: normDigits, toNum: toNum, nf: nf, money: money, esc: esc, clip: clip, el: el,
    fmtDate: fmtDate, makeNo: makeNo, remainText: remainText, isExpired: isExpired, totals: totals,
    pack: pack, unpack: unpack, invoiceUrl: invoiceUrl, linkOf: linkOf, resolve: resolve, titleOf: titleOf, payMessage: payMessage, loadFeed: loadFeed, sellerKnown: sellerKnown,
    buildText: buildText, sheetHTML: sheetHTML, renderSheet: renderSheet, watchExpiry: watchExpiry,
    saveImage: saveImage, savePdf: savePdf, copyText: copyText, toast: toast, openWhatsApp: openWhatsApp,
    phoneToWa: phoneToWa, apiOn: apiOn, isCode: isCode, codeIn: codeIn, shortUrl: shortUrl, apiCreate: apiCreate, apiRevise: apiRevise,
    apiSetPaid: apiSetPaid, apiGet: apiGet, apiReport: apiReport, apiPay: apiPay, apiList: apiList, apiCheck: apiCheck, apiPing: apiPing, apiReportNow: apiReportNow, mobileFa: mobileFa, storeMobiles: storeMobiles, storeContacts: storeContacts, nzs: nzs, hash6: hash6,
    parseCustomerMessage: parseCustomerMessage, _makePdf: makePdf, _toCanvas: toCanvas
  };
})(window);
