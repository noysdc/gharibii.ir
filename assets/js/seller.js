/* صفحهٔ فروشنده: انتخاب سریع محصول، ویرایش قیمت/ارسال، ساخت فاکتور و خروجی (متن، لینک، عکس، PDF) */
(function () {
  'use strict';
  var G = window.GInvoice;
  var $ = function (id) { return document.getElementById(id); };
  var DKEY = 'gharibii_seller_v1', HKEY = 'gharibii_seller_hist_v1';
  var PAGE = (window.matchMedia && window.matchMedia('(max-width:767px)').matches) ? 20 : 40;   /* موبایل: لیست کوتاه‌تر، با «نمایش بیشتر» ادامه می‌یابد */

  var histOpen = false;
  var feed = null, built = null, seq = 0, shown = PAGE, cat = '', query = '', busy = false, undoSnap = '', remote = Promise.resolve();
  var st = loadState();

  /* ---------- وضعیت و ذخیره‌سازی ---------- */
  function fresh() { return { cust: '', phone: '', addr: '', post: '', sw: '', valid: 120, pm: '', fee: null, disc: 0, note: '', editNo: '', rev: 0, code: '', pasted: [], items: [] }; }
  function loadState() {
    var s = fresh();
    try {
      var d = JSON.parse(localStorage.getItem(DKEY));
      if (d && Array.isArray(d.items)) {
        Object.keys(s).forEach(function (k) { if (d[k] !== undefined && k !== 'items') s[k] = d[k]; });
        s.items = d.items.filter(function (i) { return i && i.t; }).map(function (i) { i.k = ++seq; i.o = i.o || {}; return i; });
      }
    } catch (e) {}
    return s;
  }
  function save() { try { localStorage.setItem(DKEY, JSON.stringify(st)); } catch (e) {} }
  function readHist() { try { var h = JSON.parse(localStorage.getItem(HKEY)); return Array.isArray(h) ? h : []; } catch (e) { return []; } }
  function writeHist(h) { try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 60))); } catch (e) {} }
  var HIDKEY = 'gharibii_seller_hidden_v1';     /* فاکتورهایی که فروشنده فقط از لیست همین دستگاه پنهان کرده */
  function readHidden() { try { var h = JSON.parse(localStorage.getItem(HIDKEY)); return Array.isArray(h) ? h : []; } catch (e) { return []; } }
  function hideCode(c) { var h = readHidden(); if (h.indexOf(c) < 0) h.push(c); try { localStorage.setItem(HIDKEY, JSON.stringify(h.slice(-300))); } catch (e) {} }

  function feeVal() { return st.fee == null ? (feed ? feed.fee : 0) : st.fee; }
  function fmtIn(n) { return n ? Number(n).toLocaleString('en-US') : ''; }
  /* کد پستی جدا از آدرس ذخیره می‌شود و موقع ساخت فاکتور به انتهای آدرس می‌چسبد («، کد پستی: ۱۲۳…») تا ساختار فاکتور/سرور عوض نشود */
  var RX_POSTAL = /(?:[،,]\s*)?کد\s*پستی\s*[:：]?\s*([0-9۰-۹]{10})/;
  function splitPost(a) {
    a = String(a || '');
    var m = a.match(RX_POSTAL);
    if (!m) return { a: a.trim(), p: '' };
    return { a: a.replace(m[0], '').replace(/^[\s،,]+|[\s،,]+$/g, ''), p: G.normDigits(m[1]) };
  }
  function joinAddr(a, p) {
    a = String(a || '').trim(); p = String(p || '').replace(/\D/g, '');
    return p.length === 10 ? (a ? a + '، ' : '') + 'کد پستی: ' + p : a;
  }
  function nz(s) {
    return G.normDigits(s).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\u064b-\u065f]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function hasOpts(i) { return Object.keys(i.o || {}).some(function (k) { return i.o[k]; }); }
  function optString(i) {
    return Object.keys(i.o || {}).filter(function (k) { return i.o[k]; }).map(function (k) { return k + ': ' + i.o[k]; }).join('، ');
  }
  function parseOpts(s) {
    var o = {};
    String(s || '').split('،').forEach(function (part) {
      var ix = part.indexOf(':');
      if (ix > 0) { var k = part.slice(0, ix).trim(), v = part.slice(ix + 1).trim(); if (k && v) o[k] = v; }
    });
    return o;
  }
  /* موبایل مشتری به شکل 09xxxxxxxxx (اگر معتبر نبود خالی) */
  function phoneNorm(v) {
    var d = G.normDigits(v).replace(/\D/g, '');
    if (d.indexOf('98') === 0 && d.length === 12) d = '0' + d.slice(2);
    else if (d.length === 10 && d.charAt(0) === '9') d = '0' + d;
    return d.length === 11 && d.indexOf('09') === 0 ? d : '';
  }
  function optNames(pr) { return pr && pr.opts ? pr.opts.map(function (o) { return o.n; }) : []; }
  /* گزینه‌هایی که در لیست سایز/رنگ آن محصول نیستند (مثل «اندازه» یا «توضیح») */
  function extraOpts(it, pr) {
    var names = optNames(pr), rest = {};
    Object.keys(it.o || {}).forEach(function (k) { if (it.o[k] && names.indexOf(k) < 0) rest[k] = it.o[k]; });
    return rest;
  }
  function invOf() {
    return { items: st.items.map(function (i) { return { q: i.q, p: i.p }; }), fee: feeVal(), disc: st.disc };
  }

  /* ---------- همگام‌سازی با سایت ---------- */
  function reconcile() {
    var changed = 0;
    if (!feed) return 0;
    st.items.forEach(function (i) {
      if (i.c || !i.id) return;
      var pr = feed.byId[i.id];
      if (!pr) { i.miss = true; return; }
      i.miss = false; i.t = pr.t; i.im = pr.im; i.imf = pr.imf; i.oos = pr.oos;
      if (i.sp != null && i.sp !== pr.p) {
        if (i.ed) i.ch = true; else { i.p = pr.p; changed++; }
      }
      i.sp = pr.p;
      if (i.ed && i.p === i.sp) { i.ed = false; i.ch = false; }
    });
    return changed;
  }
  function setStatus(msg, bad) {
    var s = $('sync-status');
    s.textContent = msg; s.classList.toggle('bad', !!bad);
  }
  function sync(manual) {
    if (manual) setStatus('در حال دریافت قیمت‌ها از سایت…');
    return G.loadFeed(true).then(function (f) {
      f.products.forEach(function (p) { p._s = nz(p.t + ' ' + p.c); });
      feed = f;
      var changed = reconcile();
      save();
      setStatus('قیمت‌ها از سایت به‌روز است · ' + G.nf(f.products.length) + ' محصول · ساعت ' +
        new Date(f.loadedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
      buildSellers(); buildChips(); renderPicker(); renderLines(); renderHistory(); updateTotals();
      if (changed) G.toast('قیمت ' + G.nf(changed) + ' قلم از سایت به‌روز شد');
      else if (manual) G.toast('قیمت‌ها به‌روز است ✅');
    }, function () {
      setStatus('دریافت قیمت‌ها ناموفق بود؛ اینترنت را چک کنید و ⟳ را بزنید', true);
      $('picker').innerHTML = '<p class="muted empty">فهرست محصولات دریافت نشد.</p>';
    });
  }

  /* ---------- فروشنده‌ها و دسته‌ها ---------- */
  function buildSellers() {
    var sel = $('f-seller'), list = (feed && feed.sellers) || [];
    sel.innerHTML = list.map(function (s) { return '<option value="' + G.esc(s.number) + '">' + G.esc(s.name) + '</option>'; }).join('');
    if (!list.length) sel.innerHTML = '<option value="">—</option>';
    if (st.sw && list.some(function (s) { return s.number === st.sw; })) sel.value = st.sw; else st.sw = sel.value;
    showSellerPhone();
  }
  /* موبایل فروشنده‌ی انتخاب‌شده (از تنظیمات سایت؛ فقط نمایش) */
  function showSellerPhone() {
    var f = $('f-seller-phone');
    if (f) f.value = st.sw ? G.mobileFa(st.sw) : '';
  }
  function buildChips() {
    var seen = {}, cats = [];
    feed.products.forEach(function (p) { if (!seen[p.c]) { seen[p.c] = 1; cats.push(p.c); } });
    var html = '<button type="button" class="chip' + (cat === '' ? ' on' : '') + '" data-cat="">همه</button>';
    cats.forEach(function (c) { html += '<button type="button" class="chip' + (cat === c ? ' on' : '') + '" data-cat="' + G.esc(c) + '">' + G.esc(c) + '</button>'; });
    $('chips').innerHTML = html;
  }

  /* ---------- انتخاب محصول ---------- */
  function filtered() {
    if (!feed) return [];
    var toks = nz(query).split(' ').filter(Boolean);
    return feed.products.filter(function (p) {
      if (cat && p.c !== cat) return false;
      for (var i = 0; i < toks.length; i++) if (p._s.indexOf(toks[i]) < 0) return false;
      return true;
    });
  }
  function qtyOf(id) { var n = 0; st.items.forEach(function (i) { if (i.id === id) n += i.q; }); return n; }
  function renderPicker() {
    if (!feed) return;
    var list = filtered(), host = $('picker');
    if (!list.length) { host.innerHTML = '<p class="muted empty">محصولی پیدا نشد.</p>'; return; }
    var html = list.slice(0, shown).map(function (p) {
      var n = qtyOf(p.id);
      var price = p.oos ? '<span class="tag oos">ناموجود</span>' : (p.p > 0 ? G.money(p.p) : 'قیمت: تماس بگیرید');
      return '<div class="p-row"><img class="p-img" loading="lazy" src="' + G.esc(p.im) + '" data-f="' + G.esc(p.imf) + '" alt="" width="52" height="66">' +
        '<div class="p-info"><b>' + G.esc(p.t) + '</b><small>' + G.esc(p.c) + ' · ' + price + '</small></div>' +
        '<button type="button" class="btn small' + (n ? ' btn-in' : '') + '" data-add="' + G.esc(p.id) + '">' + (n ? '✓ ' + G.nf(n) + ' · ' : '') + '+ افزودن</button></div>';
    }).join('');
    if (list.length > shown) html += '<button type="button" class="btn btn-ghost" id="more">نمایش بیشتر (' + G.nf(list.length - shown) + ' محصول دیگر)</button>';
    host.innerHTML = html;
    fixImgs(host);
  }
  function fixImgs(root) {
    Array.prototype.forEach.call(root.querySelectorAll('img[data-f]'), function (img) {
      img.addEventListener('error', function onerr() {
        img.removeEventListener('error', onerr);
        var f = img.getAttribute('data-f');
        if (f && img.src.indexOf(f) < 0) img.src = f; else img.style.visibility = 'hidden';
      });
    });
  }
  function addProduct(id) {
    var pr = feed && feed.byId[id];
    if (!pr) return;
    var ex = null;
    st.items.forEach(function (i) { if (!ex && i.id === id && !i.c && !hasOpts(i)) ex = i; });
    if (ex) ex.q = Math.min(999, ex.q + 1);
    else st.items.push({ k: ++seq, id: id, t: pr.t, im: pr.im, imf: pr.imf, q: 1, p: pr.p, sp: pr.p, ed: false, ch: false, o: {}, c: false, oos: pr.oos });
    dirty(); renderLines(); renderPicker();
    G.toast('«' + pr.t + '» اضافه شد');
  }

  /* ---------- ردیف‌های لیست ---------- */
  function findItem(k) { for (var i = 0; i < st.items.length; i++) if (st.items[i].k === k) return st.items[i]; return null; }
  function lineHTML(it) {
    var pr = feed && it.id ? feed.byId[it.id] : null;
    var opts = '';
    if (pr && pr.opts && pr.opts.length) {
      opts = '<div class="line-opts">' + pr.opts.map(function (op) {
        var cur = (it.o && it.o[op.n]) || '';
        var vals = op.v.map(String);
        if (cur && vals.indexOf(cur) < 0) vals.push(cur);      /* مقدار خوانده‌شده از پیام مشتری، حتی اگر در لیست سایت نباشد */
        return '<select data-f="opt" data-n="' + G.esc(op.n) + '"><option value="">' + G.esc(op.n) + '…</option>' +
          vals.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + G.esc(v) + '</option>'; }).join('') + '</select>';
      }).join('') +
        '<input type="text" data-f="optextra" maxlength="100" placeholder="سایر توضیحات (مثلاً اندازه: ۵۲)" value="' + G.esc(optString({ o: extraOpts(it, pr) })) + '">' +
        '</div>';
    } else if (it.c || (!pr && it.id)) {
      opts = '<div class="line-opts"><input type="text" data-f="optfree" maxlength="100" placeholder="سایز / رنگ / توضیح (اختیاری)" value="' + G.esc(optString(it)) + '"></div>';
    }
    var img = it.im ? '<img class="l-img" src="' + G.esc(it.im) + '" data-f="' + G.esc(it.imf || '') + '" alt="" width="52" height="66">' : '<span class="l-img l-noimg">🎀</span>';
    return '<div class="line" data-k="' + it.k + '">' +
      '<div class="line-top">' + img + '<div class="line-title">' + G.esc(it.t) + '<span data-tags></span></div>' +
      '<button type="button" class="x" data-act="rm" aria-label="حذف">✕</button></div>' + opts +
      '<div class="line-row">' +
        '<div class="qty"><button type="button" data-act="dec" aria-label="کم">−</button><b data-q>' + G.nf(it.q) + '</b><button type="button" data-act="inc" aria-label="زیاد">+</button></div>' +
        '<label class="price"><input type="text" data-f="price" dir="ltr" inputmode="numeric" autocomplete="off" value="' + fmtIn(it.p) + '" placeholder="قیمت"><span>تومان</span></label>' +
      '</div>' +
      '<div class="line-foot"><span class="hint" data-hint></span><b data-lt></b></div></div>';
  }
  function refreshLine(it) {
    var node = $('lines').querySelector('.line[data-k="' + it.k + '"]');
    if (!node) return;
    node.querySelector('[data-q]').textContent = G.nf(it.q);
    node.querySelector('[data-lt]').textContent = it.p > 0 ? G.money(it.p * it.q) : 'قیمت وارد نشده';
    var tags = '';
    if (it.oos) tags += ' <span class="tag oos">ناموجود (طبق سایت)</span>';
    if (it.miss) tags += ' <span class="tag oos">دیگر در سایت نیست</span>';
    node.querySelector('[data-tags]').innerHTML = tags;
    var hint = '', h = node.querySelector('[data-hint]');
    if (it.id && !it.miss && feed) {
      if (it.sp === 0 && it.p === 0) hint = '⚠ قیمت سایت «تماس بگیرید» است؛ قیمت را وارد کنید.';
      else if (it.ed && it.p !== it.sp) hint = 'قیمت سایت: ' + (it.sp > 0 ? G.money(it.sp) : 'تماس بگیرید') + ' <button type="button" class="link" data-act="resetp">برگردان</button>';
      if (it.ch) hint = '⚠ قیمت سایت تغییر کرد: ' + G.money(it.sp) + ' <button type="button" class="link" data-act="resetp">استفاده از قیمت سایت</button>';
    }
    h.innerHTML = hint;
    node.classList.toggle('no-price', it.p <= 0);
  }
  function renderLines() {
    var host = $('lines');
    host.innerHTML = st.items.map(lineHTML).join('');
    fixImgs(host);
    st.items.forEach(refreshLine);
    $('lines-empty').hidden = st.items.length > 0;
  }

  /* ---------- جمع‌ها، هشدارها، نوار پایین ---------- */
  function updateTotals() {
    var t = G.totals(invOf());
    var rows = '<div class="t-row"><span>جمع کالاها (' + G.nf(t.count) + ' عدد)</span><b>' + G.money(t.sub) + '</b></div>';
    if (t.disc > 0) rows += '<div class="t-row"><span>تخفیف</span><b>− ' + G.money(t.disc) + '</b></div>';
    rows += '<div class="t-row"><span>هزینه ارسال و گمرک</span><b>' + G.money(t.fee) + '</b></div>' +
      '<div class="t-row t-grand"><span>جمع کل</span><b>' + G.money(t.total) + '</b></div>';
    $('totals').innerHTML = rows;
    $('count').textContent = G.nf(st.items.length);
    $('s-count').textContent = G.nf(st.items.length);
    var fab = $('btn-build-fab'); if (fab) fab.hidden = !st.items.length;
    var w = [];
    var noPrice = st.items.filter(function (i) { return i.p <= 0; }).length;
    var oos = st.items.filter(function (i) { return i.oos || i.miss; }).length;
    var noOpt = st.items.filter(function (i) {
      var pr = feed && i.id ? feed.byId[i.id] : null;
      return pr && pr.opts && pr.opts.length && !hasOpts(i);
    }).length;
    var chg = st.items.filter(function (i) { return i.ch; }).length;
    if (noPrice) w.push(G.nf(noPrice) + ' قلم قیمت ندارد (در جمع کل نمی‌آید).');
    if (oos) w.push(G.nf(oos) + ' قلم طبق سایت ناموجود یا حذف‌شده است.');
    if (noOpt) w.push('برای ' + G.nf(noOpt) + ' قلم سایز/رنگ انتخاب نشده.');
    if (chg) w.push('قیمت سایت برای ' + G.nf(chg) + ' قلم بعد از ویرایش شما تغییر کرده.');
    $('warns').innerHTML = w.map(function (x) { return '<li>' + G.esc(x) + '</li>'; }).join('');
    var fee = $('f-fee'), hint = $('fee-hint');
    if (document.activeElement !== fee) fee.value = fmtIn(feeVal());
    hint.textContent = st.fee != null && feed && st.fee !== feed.fee ? 'مبلغ پیش‌فرض سایت: ' + G.money(feed.fee) : '';
  }
  function dirty() {
    save();
    updateTotals();
    if (built) $('stale').hidden = false;
  }

  /* ---------- ساخت فاکتور ---------- */
  function build() {
    if (!st.items.length) { G.toast('اول محصولی اضافه کنید'); return; }
    if (built && !built.paid && !$('out-card').hidden && $('stale').hidden) {
      $('out-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var now = Math.floor(Date.now() / 1000), no = G.makeNo(new Date(now * 1000)), rev = 1;
    if (st.editNo) { no = st.editNo; rev = (st.rev || 1) + 1; }
    var list = (feed && feed.sellers) || [];
    var seller = null;
    list.forEach(function (s) { if (s.number === st.sw) seller = s; });
    if (!seller && list.length) seller = list[0];
    built = {
      no: no, rev: rev, paid: null, ts: now, exp: now + st.valid * 60,
      cust: G.clip(st.cust, 60), addr: G.clip(joinAddr(st.addr, st.post), 300), ph: phoneNorm(st.phone), sn: seller ? seller.name : '', sw: seller ? seller.number : '',
      fee: feeVal(), disc: st.disc, note: G.clip(st.note, 300), pm: st.pm || '',
      items: st.items.map(function (i) { return { id: i.c ? '' : i.id, q: i.q, p: i.p, o: optString(i), t: G.clip(i.t, 120) }; })
    };
    st.editNo = no; st.rev = rev; save();
    pushHist(built);
    showBuilt();
    if (G.apiOn()) publishRemote(built);
  }
  /* ذخیرهٔ فاکتور روی سرور و گرفتن لینک کوتاه. ویرایش یک فاکتور همان لینک قبلی را به‌روز می‌کند.
     اگر سرور در دسترس نبود، لینک بلند قدیمی کار می‌کند. */
  function publishRemote(inv) {
    var info = $('o-linkinfo');
    info.textContent = 'در حال ساخت لینک کوتاه…';
    var job = st.code ? G.apiRevise(st.code, inv).then(function () { return st.code; }) : G.apiCreate(inv);
    remote = job.then(function (code) {
      inv.code = code; st.code = code; save(); pushHist(inv); renderHistory();
      info.textContent = 'لینک کوتاه: ' + G.shortUrl(code);
    }, function (e) {
      if (e && e.status === 404) st.code = '';
      info.textContent = e && e.status === 401 ? 'رمز فروشنده درست نبود؛ فعلاً لینک بلند استفاده می‌شود. دوباره «ساخت فاکتور» را بزنید.' : 'اتصال به سرور برقرار نشد؛ فعلاً لینک بلند استفاده می‌شود.';
    });
    return remote;
  }
  function pushHist(inv) {
    var h = readHist().filter(function (x) { return x.no !== inv.no; });
    h.unshift({ no: inv.no, code: inv.code || '', rev: inv.rev || 1, paid: !!inv.paid, ts: inv.ts, exp: inv.exp, cust: inv.cust, total: G.totals(inv).total, tok: G.pack(inv) });
    writeHist(h);
  }
  function showBuilt() {
    $('out-card').hidden = false; $('stale').hidden = true;
    $('out-title').textContent = built.paid ? 'فاکتور (پرداخت‌شده) آماده است' : 'فاکتور آماده است';
    G.renderSheet($('preview'), built, feed, { live: false });
    renderHistory();
    $('out-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  /* تأیید پرداخت (کد زرین‌پال اختیاری است) و برداشتن تأیید.
     توجه: وضعیت پرداخت داخل خود لینک است؛ تأیید/لغو یک لینک تازه می‌سازد و لینک‌های قبلی مشتری عوض نمی‌شوند */
  function togglePaid(i) {
    var h = readHist(), x = h[i];
    if (!x) return;
    if (!x.tok && x.code) {                          /* ردیفی که از لیست مشترک آمده: اول فاکتور را از سرور بگیر */
      G.apiGet(x.code).then(function (iv) { x.tok = G.pack(iv); writeHist(h); togglePaid(i); }, function () { G.toast('فاکتور پیدا نشد یا اتصال برقرار نیست'); });
      return;
    }
    var inv = G.unpack(x.tok);
    if (!inv) return;
    if (inv.paid) {
      if (!confirm('تأیید پرداخت این فاکتور برداشته شود؟\nیک لینک تازهٔ «در انتظار پرداخت» ساخته می‌شود.')) return;
      inv.paid = null;
    } else {
      var ref = prompt('تأیید پرداخت فاکتور به مبلغ ' + G.money(G.totals(inv).total) + '\nکد پیگیری زرین‌پال (اختیاری — برای تأیید بدون کد، خالی بگذارید و OK بزنید):', '');
      if (ref === null) return;
      inv.paid = { ref: G.clip(G.normDigits(ref), 40), at: Math.floor(Date.now() / 1000) };
    }
    function apply(msg) {
      built = inv; st.editNo = ''; st.rev = 0; st.code = ''; save();
      pushHist(inv);
      showBuilt();
      $('o-linkinfo').textContent = inv.code ? 'لینک کوتاه: ' + G.shortUrl(inv.code) : '';
      G.toast(msg);
    }
    if (x.code && G.apiOn()) {                      /* روی همان لینک کوتاه ثبت می‌شود؛ مشتری لینک قبلی را باز کند وضعیت تازه را می‌بیند */
      inv.code = x.code;
      G.apiSetPaid(x.code, inv.paid).then(function () {
        apply(inv.paid ? 'پرداخت تأیید شد ✅ — همان لینک قبلی برای مشتری به‌روز شد' : 'تأیید پرداخت برداشته شد — همان لینک به‌روز شد');
      }, function (e) {
        G.toast(e && e.status === 401 ? 'رمز فروشنده درست نبود' : 'ثبت روی سرور ناموفق بود؛ اینترنت را چک و دوباره تلاش کنید');
      });
      return;
    }
    apply(inv.paid ? 'پرداخت تأیید شد ✅ — لینک تازه را برای مشتری بفرستید' : 'تأیید پرداخت برداشته شد');
  }
  function outText() {
    var link = $('o-withlink').checked ? G.invoiceUrl(built) : '';
    return G.buildText(built, feed, link);
  }
  function run(btn, fn) {
    btn.addEventListener('click', function () {
      if (busy) return;
      if (!built) { G.toast('اول «ساخت فاکتور» را بزنید'); return; }
      busy = true; btn.classList.add('busy');
      Promise.resolve(remote).then(fn).catch(function () { G.toast('خطا در ساخت فایل؛ دوباره تلاش کنید'); })
        .then(function () { busy = false; btn.classList.remove('busy'); });
    });
  }

  /* ---------- سابقه و بازکردن فاکتور قبلی ---------- */
  function renderHistory() {
    var h = readHist(), host = $('history');
    if (!h.length) { host.innerHTML = '<p class="muted empty">هنوز فاکتوری نساخته‌اید.</p>'; if ($('hist-count')) $('hist-count').textContent = G.nf(0); if ($('hist-dot')) $('hist-dot').hidden = true; return; }
    var now = Math.floor(Date.now() / 1000);
    var todo = h.filter(function (x) { return (x.paid && x.pvia === 'zp' && !x.ok) || (!x.paid && x.rep && now < x.exp + 86400 * 3); }).length;
    var banner = todo ? '<p class="h-todo">🔔 ' + G.nf(todo) + ' فاکتور منتظر بررسی شماست</p>' : '';
    var cnt = $('hist-count'); if (cnt) cnt.textContent = G.nf(h.length);
    var dot = $('hist-dot'); if (dot) dot.hidden = !todo;
    var HLIM = 3;
    host.innerHTML = banner + h.map(function (x, i) {
      var exp = !x.paid && now >= x.exp;
      var online = x.paid && x.pvia === 'zp';
      var attn = (online && !x.ok) || (!x.paid && x.rep && !exp);
      /* نشان وضعیت: یک برچسب رنگی به‌جای جملهٔ طولانی */
      var st = online ? (x.ok ? ['ok', '✅ پرداخت آنلاین · بررسی‌شده'] : ['warn', '🔔 پرداخت آنلاین · منتظر بررسی شما'])
        : x.paid ? ['ok', '✅ پرداخت‌شده']
        : exp ? ['off', '⌛ منقضی']
        : x.rep ? ['warn', '💬 مشتری اعلام پرداخت کرد']
        : ['wait', '⏳ در انتظار پرداخت'];
      var meta = (x.rev > 1 ? 'نسخه ' + G.nf(x.rev) + ' · ' : '') + (x.cust ? G.esc(x.cust) + ' · ' : '') + (x.code ? '<span dir="ltr">' + G.esc(x.code) + '</span>' : '');
      var extra = online && x.pref ? '<span class="h-ref">کد پیگیری <span dir="ltr">' + G.esc(x.pref) + '</span></span>' : '';
      var pay = '';
      if (online) pay = x.ok ? '' : '<button type="button" class="btn small btn-primary" data-hok="' + i + '">✓ بررسی کردم</button>';
      else pay = '<button type="button" class="btn small ' + (x.paid ? 'btn-ghost' : (x.rep ? 'btn-primary' : 'btn-in')) + '" data-hpaid="' + i + '">' + (x.paid ? 'لغو تأیید پرداخت' : '✓ تأیید پرداخت') + '</button>';
      return '<article class="h-row' + (attn ? ' h-attn' : '') + '">' +
        '<div class="h-head"><b class="h-no" dir="ltr">' + G.esc(x.no) + '</b><span class="h-chip h-' + st[0] + '">' + st[1] + '</span></div>' +
        '<div class="h-info"><span class="h-amount">' + G.money(x.total) + '</span>' + (meta ? '<small>' + meta + '</small>' : '') + extra + '</div>' +
        '<div class="h-actions">' + pay +
          '<button type="button" class="btn small" data-hopen="' + i + '" title="' + (x.paid ? 'ساخت فاکتور مکمل برای اقلام جدید (فاکتور پرداخت‌شده تغییر نمی‌کند)' : 'ویرایش و ساخت نسخهٔ بعدی') + '">' + (x.paid ? '＋ فاکتور مکمل' : '✎ ویرایش') + '</button>' +
          '<button type="button" class="btn small btn-ghost" data-hcopy="' + i + '">🔗 کپی لینک</button>' +
          '<button type="button" class="x" data-hdel="' + i + '" aria-label="حذف از لیست">✕</button>' +
        '</div></article>';
    }).join('') + (h.length > HLIM ? '<button type="button" class="btn btn-ghost hist-more" data-hmore aria-expanded="' + (histOpen ? 'true' : 'false') + '">' + (histOpen ? 'جمع کردن لیست ▴' : 'نمایش همه ' + G.nf(h.length) + ' فاکتور ▾') + '</button>' : '');
    /* پیش‌فرض فقط ۳ فاکتور آخر (و فاکتورهای منتظر بررسی) دیده می‌شود؛ بقیه با دکمه باز می‌شود */
    if (!histOpen) Array.prototype.forEach.call(host.querySelectorAll('.h-row'), function (row, i) { if (i >= HLIM && !row.classList.contains('h-attn')) row.hidden = true; });
  }
  /* لیست مشترک: فاکتورهای هر دو فروشنده و وضعیت پرداخت‌شان با «یک» درخواست از سرور می‌آید.
     پرداخت درگاه خودکار ثبت می‌شود؛ فروشنده فقط «بررسی کردم» (آنلاین) یا «تأیید پرداخت» (کارت‌به‌کارت) می‌زند */
  var syncing = false;
  function syncList() {
    if (syncing || !G.apiOn()) return;
    syncing = true;
    G.apiList().then(function (r) {
      syncing = false;
      var rows = (r && r.items) || [], h = readHist(), hid = readHidden(), fresh = [], byCode = {};
      h.forEach(function (x) { if (x.code) byCode[x.code] = x; });
      rows.forEach(function (m) {
        if (hid.indexOf(m.code) >= 0) return;
        var x = byCode[m.code], isNew = !x;
        if (!x) { x = { no: m.no, code: m.code, tok: '' }; h.push(x); byCode[m.code] = x; }
        var was = !!x.paid;
        x.no = m.no || x.no; x.rev = m.rv || x.rev || 1; x.ts = m.ts || x.ts; x.exp = m.exp || x.exp; x.cust = m.cust || x.cust || ''; x.total = m.total || x.total;
        x.paid = !!m.paid; x.pvia = m.pv ? 'zp' : ''; x.pref = m.rf || ''; x.rep = m.rp || 0; x.ok = !!m.ck;
        if (m.pv && !was && !isNew) fresh.push(x.no);
      });
      h.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      writeHist(h); renderHistory();
      if (fresh.length) G.toast('✅ پرداخت آنلاین ثبت شد: ' + fresh.join('، '));
    }, function () { syncing = false; });
  }
  function loadInvoice(inv, code) {
    var supp = !!inv.paid;
    if (supp) inv = { no: inv.no, cust: inv.cust, addr: inv.addr, ph: inv.ph, sw: inv.sw, fee: feed ? feed.fee : 0, disc: 0, pm: inv.pm || '', note: G.clip('مکمل فاکتور ' + inv.no, 300), items: [] };
    st.editNo = supp ? '' : inv.no; st.rev = supp ? 0 : (inv.rev || 1); st.code = supp ? '' : (code || inv.code || '');
    var sp0 = splitPost(inv.addr); st.cust = inv.cust; st.addr = sp0.a; st.post = sp0.p; st.phone = inv.ph || ''; st.disc = inv.disc; st.note = inv.note; st.pm = inv.pm || ''; st.pasted = [];
    st.fee = feed && inv.fee === feed.fee ? null : inv.fee;
    if (inv.sw) st.sw = inv.sw;
    st.items = inv.items.map(function (r) {
      var pr = feed && r.id ? feed.byId[r.id] : null;
      var o = parseOpts(r.o);
      if (pr) return { k: ++seq, id: r.id, t: pr.t, im: pr.im, imf: pr.imf, q: r.q, p: r.p, sp: pr.p, ed: r.p !== pr.p, ch: false, o: o, c: false, oos: pr.oos };
      return { k: ++seq, id: '', t: r.t, im: '', imf: '', q: r.q, p: r.p, sp: null, ed: true, ch: false, o: o, c: true, oos: false };
    });
    built = null; $('out-card').hidden = true;
    save(); initFields(); renderLines(); renderPicker(); updateTotals();
    G.toast(supp ? 'فاکتور پرداخت‌شده تغییر نمی‌کند؛ اقلام جدید را اضافه کنید (فاکتور مکمل)' : 'فاکتور باز شد. تغییر دهید و دوباره «ساخت فاکتور» بزنید (نسخهٔ بعدی ساخته می‌شود)');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- فیلدهای بالای صفحه ---------- */
  function initFields() {
    $('f-cust').value = st.cust || '';
    $('f-phone').value = st.phone || '';
    $('f-addr').value = st.addr || '';
    $('f-post').value = st.post || '';
    $('f-valid').value = String(st.valid || 120);
    $('f-pm').value = st.pm || '';
    $('f-disc').value = fmtIn(st.disc);
    $('f-note').value = st.note || '';
    $('f-fee').value = fmtIn(feeVal());
    if (st.sw && $('f-seller').value !== st.sw) $('f-seller').value = st.sw;
    showSellerPhone();
  }
  function bindMoney(input, setter) {
    input.addEventListener('input', function () {
      var n = G.toNum(input.value);
      setter(n);
      var s = fmtIn(n);
      if (input.value !== s) input.value = s;
      dirty();
    });
  }

  /* ---------- رویدادها ---------- */
  function bind() {
    $('f-cust').addEventListener('input', function (e) { st.cust = e.target.value; dirty(); });
    $('f-phone').addEventListener('input', function (e) { st.phone = e.target.value; dirty(); });
    $('f-addr').addEventListener('input', function (e) { st.addr = e.target.value; dirty(); });
    $('f-post').addEventListener('input', function (e) {
      var v = G.normDigits(e.target.value).replace(/\D/g, '').slice(0, 10);
      if (e.target.value !== v) e.target.value = v;
      st.post = v; dirty();
    });
    $('f-seller').addEventListener('change', function (e) { st.sw = e.target.value; showSellerPhone(); dirty(); });
    $('f-valid').addEventListener('change', function (e) { st.valid = Number(e.target.value) || 120; dirty(); });
    $('f-pm').addEventListener('change', function (e) { st.pm = e.target.value; dirty(); });
    $('f-note').addEventListener('input', function (e) { st.note = e.target.value; dirty(); });
    bindMoney($('f-fee'), function (n) { st.fee = n; });
    bindMoney($('f-disc'), function (n) { st.disc = n; });
    $('f-fee').addEventListener('blur', function () { $('f-fee').value = fmtIn(feeVal()); });
    $('btn-fee-reset').addEventListener('click', function () { st.fee = null; $('f-fee').value = fmtIn(feeVal()); dirty(); });
    $('btn-sync').addEventListener('click', function () { sync(true); });

    $('q').addEventListener('input', function (e) { query = e.target.value; shown = PAGE; renderPicker(); });
    $('chips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]'); if (!b) return;
      cat = b.getAttribute('data-cat'); shown = PAGE; buildChips(); renderPicker();
    });
    $('picker').addEventListener('click', function (e) {
      var a = e.target.closest('[data-add]');
      if (a) { addProduct(a.getAttribute('data-add')); return; }
      if (e.target.id === 'more') { shown += PAGE; renderPicker(); }
    });

    var lines = $('lines');
    lines.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var node = b.closest('.line'); var it = node && findItem(Number(node.getAttribute('data-k')));
      if (!it) return;
      var act = b.getAttribute('data-act');
      if (act === 'rm') { st.items = st.items.filter(function (x) { return x !== it; }); dirty(); renderLines(); renderPicker(); return; }
      if (act === 'inc') it.q = Math.min(999, it.q + 1);
      if (act === 'dec') it.q = Math.max(1, it.q - 1);
      if (act === 'resetp') { it.p = it.sp; it.ed = false; it.ch = false; node.querySelector('[data-f="price"]').value = fmtIn(it.p); }
      refreshLine(it); dirty(); renderPicker();
    });
    lines.addEventListener('input', function (e) {
      var f = e.target.getAttribute('data-f'); if (!f) return;
      var node = e.target.closest('.line'); var it = node && findItem(Number(node.getAttribute('data-k')));
      if (!it) return;
      if (f === 'price') {
        var n = G.toNum(e.target.value);
        it.p = n; it.ed = it.c ? true : n !== it.sp; it.ch = false;
        var s = fmtIn(n); if (e.target.value !== s) e.target.value = s;
      } else if (f === 'optextra') {
        var prx = feed && it.id ? feed.byId[it.id] : null, keep = optNames(prx), add = parseOpts(e.target.value);
        Object.keys(it.o || {}).forEach(function (k) { if (keep.indexOf(k) < 0) delete it.o[k]; });
        if (!Object.keys(add).length && e.target.value.trim()) add = { 'توضیح': e.target.value.trim().slice(0, 100) };
        Object.keys(add).forEach(function (k) { it.o[k] = add[k]; });
      } else if (f === 'optfree') {
        it.o = parseOpts(e.target.value);
        if (!Object.keys(it.o).length && e.target.value.trim()) it.o = { 'توضیح': e.target.value.trim().slice(0, 100) };
      }
      refreshLine(it); dirty();
    });
    lines.addEventListener('change', function (e) {
      if (e.target.getAttribute('data-f') !== 'opt') return;
      var node = e.target.closest('.line'); var it = node && findItem(Number(node.getAttribute('data-k')));
      if (!it) return;
      it.o = it.o || {}; it.o[e.target.getAttribute('data-n')] = e.target.value;
      dirty(); renderPicker();
    });

    $('btn-custom').addEventListener('click', function () {
      var f = $('custom-form'); f.hidden = !f.hidden;
      if (!f.hidden) $('c-title').focus();
    });
    $('c-add').addEventListener('click', function () {
      var t = G.clip($('c-title').value, 120);
      if (!t) { G.toast('عنوان آیتم را بنویسید'); return; }
      st.items.push({ k: ++seq, id: '', t: t, im: '', imf: '', q: Math.max(1, G.toNum($('c-qty').value) || 1), p: G.toNum($('c-price').value), sp: null, ed: true, ch: false, o: {}, c: true, oos: false });
      $('c-title').value = ''; $('c-price').value = ''; $('c-qty').value = '1'; $('custom-form').hidden = true;
      dirty(); renderLines();
    });
    $('c-price').addEventListener('input', function (e) { var s = fmtIn(G.toNum(e.target.value)); if (e.target.value !== s) e.target.value = s; });

    $('btn-build').addEventListener('click', build);
    $('btn-build-fab').addEventListener('click', build);
    run($('o-text'), function () { return G.copyText(outText()).then(function (ok) { G.toast(ok ? 'متن کپی شد ✅' : 'کپی نشد؛ دستی کپی کنید'); }); });
    run($('o-link'), function () { return G.copyText(G.invoiceUrl(built)).then(function (ok) { G.toast(ok ? 'لینک کپی شد ✅' : 'کپی نشد'); }); });
    run($('o-wa'), function () { return G.openWhatsApp(G.phoneToWa(st.phone), outText()); });
    run($('o-img'), function () { G.toast('در حال ساخت عکس…'); return G.saveImage(built, feed); });
    run($('o-pdf'), function () { G.toast('در حال ساخت PDF…'); return G.savePdf(built, feed); });

    $('history').addEventListener('click', function (e) {
      if (e.target.closest('[data-hmore]')) { histOpen = !histOpen; renderHistory(); return; }
      var h = readHist();
      var o = e.target.closest('[data-hopen]'), c = e.target.closest('[data-hcopy]'), d = e.target.closest('[data-hdel]'), pd = e.target.closest('[data-hpaid]');
      var ok = e.target.closest('[data-hok]');
      if (ok) {
        var hk = h[Number(ok.getAttribute('data-hok'))];
        if (hk) {
          hk.ok = true; writeHist(h); renderHistory();
          if (hk.code && G.apiOn()) G.apiCheck(hk.code).catch(function () { G.toast('ثبت «بررسی شد» روی سرور ناموفق بود'); });   /* برای فروشندهٔ دیگر هم ثبت می‌شود */
        }
        return;
      }
      if (pd) { togglePaid(Number(pd.getAttribute('data-hpaid'))); return; }
      if (o) {
        var hi = h[Number(o.getAttribute('data-hopen'))], inv = hi && hi.tok ? G.unpack(hi.tok) : null;
        if (inv) loadInvoice(inv, hi.code);
        else if (hi && hi.code && G.apiOn()) G.apiGet(hi.code).then(function (iv) { loadInvoice(iv, hi.code); }, function () { G.toast('فاکتور پیدا نشد یا اتصال برقرار نیست'); });
      }
      if (c) { var hx = h[Number(c.getAttribute('data-hcopy'))]; if (hx && (hx.code || hx.tok)) G.copyText(hx.code ? G.shortUrl(hx.code) : G.linkOf(hx.tok, hx.no, hx.rev)).then(function () { G.toast('لینک کپی شد ✅'); }); }
      if (d) { var gone = h.splice(Number(d.getAttribute('data-hdel')), 1)[0]; if (gone && gone.code) hideCode(gone.code); writeHist(h); renderHistory(); }
    });
    $('btn-import').addEventListener('click', function () {
      var cd = G.codeIn($('f-import').value);
      if (cd && G.apiOn()) {
        G.apiGet(cd).then(function (inv) { $('f-import').value = ''; loadInvoice(inv, cd); }, function () { G.toast('فاکتور پیدا نشد یا اتصال برقرار نیست'); });
        return;
      }
      var inv = G.unpack($('f-import').value);
      if (!inv) { G.toast('لینک معتبر نیست'); return; }
      $('f-import').value = ''; loadInvoice(inv);
    });
    $('btn-new').addEventListener('click', function () {
      if (st.items.length && !confirm('لیست فعلی پاک شود و فاکتور جدید شروع شود؟')) return;
      var keep = { sw: st.sw, valid: st.valid };
      st = fresh(); st.sw = keep.sw; st.valid = keep.valid;
      built = null; $('out-card').hidden = true; save();
      initFields(); renderLines(); renderPicker(); updateTotals();
    });
    if (G.apiOn()) {
      $('srv-card').hidden = false;
      if ($('srv-divider')) $('srv-divider').hidden = false;
      function why(e) {
        if (!e) return 'نامشخص';
        if (e.status === 401) return 'رمز فروشنده درست نیست.';
        if (e.status) return 'پاسخ سرور ' + e.status + (e.data && (e.data.detail || e.data.error) ? ' — ' + (e.data.detail || e.data.error) : '');
        return 'مرورگر به Worker نرسید (CORS / آدرس Worker / فیلتر بودن workers.dev).';
      }
      function sendState(v) { return v === true ? 'ارسال شد ✅' : (v ? 'ناموفق ❌ ' + v : 'ناموفق ❌'); }
      $('btn-ping').addEventListener('click', function () {
        $('srv-out').textContent = 'در حال بررسی…';
        G.apiPing().then(function (r) {
          $('srv-out').textContent = 'سرور وصل است ✅\nتلگرام: ' + sendState(r.telegram) + '\nایمیل: ' + sendState(r.email) +
            '\nKV (INVOICES): ' + (r.kv ? 'وصل ✅' : 'مشکل ❌ ' + (r.kvErr || '')) + '\nSITE_URL: ' + (r.siteUrl || '— تنظیم نشده —') +
            '\nآخرین اجرای زمان‌بندی: ' + (r.lastCron ? JSON.stringify(r.lastCron) : 'هنوز هیچ‌وقت اجرا نشده (Cron Trigger تنظیم نیست؟)');
        }, function (e) { $('srv-out').textContent = why(e); });
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-rep]'), function (b) {
        b.addEventListener('click', function () {
          $('srv-out').textContent = 'در حال ساخت گزارش…';
          G.apiReportNow(b.getAttribute('data-rep')).then(function (r) {
            var s = r.sent || {};
            $('srv-out').textContent = r.text + '\n\nتلگرام: ' + sendState(s.telegram) + '\nایمیل: ' + sendState(s.email);
          }, function (e) { $('srv-out').textContent = 'ساخت گزارش ناموفق بود: ' + why(e); });
        });
      });
    }
    $('btn-paste').addEventListener('click', fromMessage);
    $('btn-undo').addEventListener('click', undoMessage);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && feed) sync(false); });
    setInterval(function () { if (document.visibilityState === 'visible') sync(false); }, 5 * 60 * 1000);
    setInterval(function () { if (document.visibilityState === 'visible') syncList(); }, 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') syncList(); });
    setTimeout(syncList, 800);
  }

  /* ---------- تبدیل پیام مشتری به فاکتور ----------
     چند بار می‌شود پیام paste کرد: پیام تکراری نادیده گرفته می‌شود، فیلدهای پر دست نمی‌خورند،
     محصول تکراری (با همان سایز/رنگ) تعدادش بالا می‌رود، و «برگرداندن» آخرین تبدیل را لغو می‌کند */
  function undoMessage() {
    if (!undoSnap) return;
    try { st = JSON.parse(undoSnap); } catch (e) { return; }
    st.items.forEach(function (i) { i.k = ++seq; });
    undoSnap = ''; $('btn-undo').hidden = true;
    initFields(); renderLines(); renderPicker(); dirty();
    $('paste-res').textContent = 'آخرین تبدیل برگردانده شد';
    G.toast('آخرین تبدیل برگردانده شد');
  }
  function fromMessage() {
    if (!feed) { G.toast('قیمت‌ها هنوز دریافت نشده'); return; }
    var txt = $('f-paste').value;
    if (!txt.trim()) { G.toast('متن پیام را paste کنید'); return; }
    var fp = G.hash6(G.nzs(txt));
    st.pasted = st.pasted || [];
    if (st.pasted.indexOf(fp) >= 0) {
      var dup = 'این پیام قبلاً برای همین فاکتور اضافه شده؛ دوباره اضافه نشد';
      $('paste-res').textContent = dup; G.toast(dup); return;
    }
    var r = G.parseCustomerMessage(txt, feed);
    if (!r.items.length && !r.name && !r.phone && !r.addr && !r.note) {
      var none = 'چیزی در پیام پیدا نشد' + (r.lost ? ' · ' + G.nf(r.lost) + ' لینک شناسایی نشد' : '');
      $('paste-res').textContent = none; G.toast(none); return;
    }
    undoSnap = JSON.stringify(st);
    var added = 0, more = 0, filled = [], kept = [];
    r.items.forEach(function (f) {
      var pr = f.p, key = JSON.stringify(f.o), ex = null;
      st.items.forEach(function (i) { if (!ex && i.id === pr.id && !i.c && JSON.stringify(i.o || {}) === key) ex = i; });
      if (ex) { ex.q = Math.min(999, ex.q + f.q); more++; }
      else { st.items.push({ k: ++seq, id: pr.id, t: pr.t, im: pr.im, imf: pr.imf, q: f.q, p: pr.p, sp: pr.p, ed: false, ch: false, o: f.o, c: false, oos: pr.oos }); added++; }
    });
    function fill(key, val, label) {
      if (!val) return;
      if (!String(st[key] || '').trim()) { st[key] = val; filled.push(label); }
      else if (G.nzs(st[key]) !== G.nzs(val)) kept.push(label);
    }
    fill('cust', r.name, 'نام'); fill('phone', r.phone, 'موبایل'); var spp = splitPost(r.addr); fill('addr', spp.a, 'آدرس'); fill('post', spp.p, 'کد پستی'); fill('note', r.note, 'یادداشت');
    st.pasted.push(fp); st.pasted = st.pasted.slice(-30);
    var parts = [];
    if (added) parts.push(G.nf(added) + ' محصول اضافه شد');
    if (more) parts.push('تعداد ' + G.nf(more) + ' محصول زیاد شد');
    if (filled.length) parts.push(filled.join('، ') + ' جایگذاری شد');
    if (kept.length) parts.push(kept.join('، ') + ' از قبل پر بود و عوض نشد');
    if (r.lost) parts.push(G.nf(r.lost) + ' لینک شناسایی نشد');
    var msg = parts.join(' · ');
    $('paste-res').textContent = msg; G.toast(msg);
    $('f-paste').value = ''; $('btn-undo').hidden = false;
    initFields(); dirty(); renderLines(); renderPicker();
  }

  /* ---------- شروع ---------- */
  document.querySelector('.card .row-between').insertAdjacentHTML('afterend',
    '<div class="custom-form" id="custom-form" hidden>' +
    '<input type="text" id="c-title" maxlength="120" placeholder="عنوان آیتم (مثلاً: هزینه بسته‌بندی هدیه)">' +
    '<div class="grid2"><input type="text" id="c-price" dir="ltr" inputmode="numeric" placeholder="قیمت واحد (تومان)">' +
    '<input type="text" id="c-qty" dir="ltr" inputmode="numeric" value="1" placeholder="تعداد"></div>' +
    '<button type="button" class="btn btn-primary small" id="c-add">افزودن به لیست</button></div>');
  initFields(); bind(); renderLines(); updateTotals(); renderHistory();
  sync(false);

  /* ---------- باکس «افزودن محصول»: با کلیک باز/بسته می‌شود؛ وقتی لیست خالی است باز است ---------- */
  (function () {
    var t = $('add-toggle'), b = $('add-body');
    if (!t || !b) return;
    function set(open) { b.hidden = !open; t.setAttribute('aria-expanded', open ? 'true' : 'false'); t.classList.toggle('open', open); }
    set(!(st.items && st.items.length));
    t.addEventListener('click', function () {
      set(b.hidden);
      if (!b.hidden) { try { b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }
    });
    $('btn-new').addEventListener('click', function () { if (!st.items.length) set(true); });
  })();
  /* باکس «فاکتورهای اخیر»: پیش‌فرض بسته است تا صفحه (به‌خصوص موبایل) شلوغ نشود */
  (function () {
    var t = $('hist-toggle'), b = $('hist-body');
    if (!t || !b) return;
    t.addEventListener('click', function () {
      var open = b.hidden;
      b.hidden = !open; t.setAttribute('aria-expanded', open ? 'true' : 'false'); t.classList.toggle('open', open);
    });
  })();
  /* شمارندهٔ نویسه برای آدرس و یادداشت */
  (function () {
    Array.prototype.forEach.call(document.querySelectorAll('[data-count-for]'), function (em) {
      var inp = $(em.getAttribute('data-count-for')), max = Number(em.getAttribute('data-max')) || 300;
      if (!inp) return;
      function upd() { em.textContent = G.nf(inp.value.length) + ' / ' + G.nf(max); }
      inp.addEventListener('input', upd); upd();
      setInterval(upd, 1500);   /* وقتی مقدار با دکمه‌هایی مثل «تبدیل پیام» پر می‌شود */
    });
  })();
})();
