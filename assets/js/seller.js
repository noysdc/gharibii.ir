/* صفحهٔ فروشنده: انتخاب سریع محصول، ویرایش قیمت/ارسال، ساخت پیش‌فاکتور و خروجی (متن، لینک، عکس، PDF) */
(function () {
  'use strict';
  var G = window.GInvoice;
  var $ = function (id) { return document.getElementById(id); };
  var DKEY = 'gharibii_seller_v1', HKEY = 'gharibii_seller_hist_v1';
  var PAGE = 40;

  var feed = null, built = null, seq = 0, shown = PAGE, cat = '', query = '', busy = false;
  var st = loadState();

  /* ---------- وضعیت و ذخیره‌سازی ---------- */
  function fresh() { return { cust: '', phone: '', sw: '', valid: 120, fee: null, disc: 0, note: '', editNo: '', rev: 0, items: [] }; }
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
  function writeHist(h) { try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 20))); } catch (e) {} }

  function feeVal() { return st.fee == null ? (feed ? feed.fee : 0) : st.fee; }
  function fmtIn(n) { return n ? Number(n).toLocaleString('en-US') : ''; }
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
        return '<select data-f="opt" data-n="' + G.esc(op.n) + '"><option value="">' + G.esc(op.n) + '…</option>' +
          op.v.map(function (v) { return '<option' + (String(v) === cur ? ' selected' : '') + '>' + G.esc(v) + '</option>'; }).join('') + '</select>';
      }).join('') + '</div>';
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
    $('s-count').textContent = G.nf(st.items.length) + ' قلم';
    $('s-total').textContent = G.money(t.total);
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

  /* ---------- ساخت پیش‌فاکتور ---------- */
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
      cust: G.clip(st.cust, 60), sn: seller ? seller.name : '', sw: seller ? seller.number : '',
      fee: feeVal(), disc: st.disc, note: G.clip(st.note, 300),
      items: st.items.map(function (i) { return { id: i.c ? '' : i.id, q: i.q, p: i.p, o: optString(i), t: G.clip(i.t, 120) }; })
    };
    st.editNo = no; st.rev = rev; save();
    pushHist(built);
    showBuilt();
  }
  function pushHist(inv) {
    var h = readHist().filter(function (x) { return x.no !== inv.no; });
    h.unshift({ no: inv.no, rev: inv.rev || 1, paid: !!inv.paid, ts: inv.ts, exp: inv.exp, cust: inv.cust, total: G.totals(inv).total, tok: G.pack(inv) });
    writeHist(h);
  }
  function showBuilt() {
    $('out-card').hidden = false; $('stale').hidden = true;
    $('out-title').textContent = built.paid ? 'فاکتور نهایی آماده است' : 'پیش‌فاکتور آماده است';
    G.renderSheet($('preview'), built, feed, { live: false });
    renderHistory();
    $('out-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  /* بعد از دیدن پرداخت در پنل زرین‌پال: پیش‌فاکتور به فاکتور نهایی تبدیل می‌شود */
  function confirmPaid(i) {
    var h = readHist(), x = h[i], inv = x && G.unpack(x.tok);
    if (!inv) return;
    var ref = prompt('کد پیگیری پرداخت را از پنل زرین‌پال وارد کنید.\nمبلغ باید دقیقاً ' + G.money(G.totals(inv).total) + ' باشد:');
    if (ref === null) return;
    ref = G.clip(G.normDigits(ref), 40);
    if (!ref) { G.toast('کد پیگیری وارد نشد'); return; }
    inv.paid = { ref: ref, at: Math.floor(Date.now() / 1000) };
    built = inv; st.editNo = ''; st.rev = 0; save();
    pushHist(inv);
    showBuilt();
  }
  function outText() {
    var link = $('o-withlink').checked ? G.invoiceUrl(built) : '';
    return G.buildText(built, feed, link);
  }
  function run(btn, fn) {
    btn.addEventListener('click', function () {
      if (busy) return;
      if (!built) { G.toast('اول «ساخت پیش‌فاکتور» را بزنید'); return; }
      busy = true; btn.classList.add('busy');
      Promise.resolve().then(fn).catch(function () { G.toast('خطا در ساخت فایل؛ دوباره تلاش کنید'); })
        .then(function () { busy = false; btn.classList.remove('busy'); });
    });
  }

  /* ---------- سابقه و بازکردن پیش‌فاکتور قبلی ---------- */
  function renderHistory() {
    var h = readHist(), host = $('history');
    if (!h.length) { host.innerHTML = '<p class="muted empty">هنوز پیش‌فاکتوری نساخته‌اید.</p>'; return; }
    host.innerHTML = h.map(function (x, i) {
      var exp = !x.paid && Math.floor(Date.now() / 1000) >= x.exp;
      var tag = x.paid ? 'پرداخت‌شده ✅' : (exp ? 'منقضی' : 'معتبر');
      return '<div class="h-row"><div class="h-info"><b dir="ltr">' + G.esc(x.no) + '</b><small>' + (x.rev > 1 ? 'نسخه ' + G.nf(x.rev) + ' · ' : '') + (x.cust ? G.esc(x.cust) + ' · ' : '') + G.money(x.total) + ' · ' + tag + '</small></div>' +
        (x.paid ? '' : '<button type="button" class="btn small btn-in" data-hpaid="' + i + '">پرداخت شد</button>') +
        '<button type="button" class="btn small" data-hopen="' + i + '">' + (x.paid ? 'مکمل' : 'ویرایش') + '</button>' +
        '<button type="button" class="btn small btn-ghost" data-hcopy="' + i + '">لینک</button>' +
        '<button type="button" class="x" data-hdel="' + i + '" aria-label="حذف">✕</button></div>';
    }).join('');
  }
  function loadInvoice(inv) {
    var supp = !!inv.paid;
    if (supp) inv = { no: inv.no, cust: inv.cust, sw: inv.sw, fee: feed ? feed.fee : 0, disc: 0, note: G.clip('مکمل فاکتور ' + inv.no, 300), items: [] };
    st.editNo = supp ? '' : inv.no; st.rev = supp ? 0 : (inv.rev || 1);
    st.cust = inv.cust; st.disc = inv.disc; st.note = inv.note;
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
    G.toast(supp ? 'فاکتور پرداخت‌شده تغییر نمی‌کند؛ اقلام جدید را اضافه کنید (فاکتور مکمل)' : 'پیش‌فاکتور باز شد. تغییر دهید و دوباره «ساخت پیش‌فاکتور» بزنید (نسخهٔ بعدی ساخته می‌شود)');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- فیلدهای بالای صفحه ---------- */
  function initFields() {
    $('f-cust').value = st.cust || '';
    $('f-phone').value = st.phone || '';
    $('f-valid').value = String(st.valid || 120);
    $('f-disc').value = fmtIn(st.disc);
    $('f-note').value = st.note || '';
    $('f-fee').value = fmtIn(feeVal());
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
    $('f-phone').addEventListener('input', function (e) { st.phone = e.target.value; save(); });
    $('f-seller').addEventListener('change', function (e) { st.sw = e.target.value; dirty(); });
    $('f-valid').addEventListener('change', function (e) { st.valid = Number(e.target.value) || 120; dirty(); });
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
    run($('o-text'), function () { return G.copyText(outText()).then(function (ok) { G.toast(ok ? 'متن کپی شد ✅' : 'کپی نشد؛ دستی کپی کنید'); }); });
    run($('o-link'), function () { return G.copyText(G.invoiceUrl(built)).then(function (ok) { G.toast(ok ? 'لینک کپی شد ✅' : 'کپی نشد'); }); });
    run($('o-wa'), function () { return G.openWhatsApp(G.phoneToWa(st.phone), outText()); });
    run($('o-img'), function () { G.toast('در حال ساخت عکس…'); return G.saveImage(built, feed); });
    run($('o-pdf'), function () { G.toast('در حال ساخت PDF…'); return G.savePdf(built, feed); });

    $('history').addEventListener('click', function (e) {
      var h = readHist();
      var o = e.target.closest('[data-hopen]'), c = e.target.closest('[data-hcopy]'), d = e.target.closest('[data-hdel]'), pd = e.target.closest('[data-hpaid]');
      if (pd) { confirmPaid(Number(pd.getAttribute('data-hpaid'))); return; }
      if (o) { var inv = G.unpack(h[Number(o.getAttribute('data-hopen'))].tok); if (inv) loadInvoice(inv); }
      if (c) { var hx = h[Number(c.getAttribute('data-hcopy'))]; G.copyText(G.linkOf(hx.tok, hx.no, hx.rev)).then(function () { G.toast('لینک کپی شد ✅'); }); }
      if (d) { h.splice(Number(d.getAttribute('data-hdel')), 1); writeHist(h); renderHistory(); }
    });
    $('btn-import').addEventListener('click', function () {
      var inv = G.unpack($('f-import').value);
      if (!inv) { G.toast('لینک معتبر نیست'); return; }
      $('f-import').value = ''; loadInvoice(inv);
    });
    $('btn-new').addEventListener('click', function () {
      if (st.items.length && !confirm('لیست فعلی پاک شود و پیش‌فاکتور جدید شروع شود؟')) return;
      var keep = { sw: st.sw, valid: st.valid, phone: '' };
      st = fresh(); st.sw = keep.sw; st.valid = keep.valid;
      built = null; $('out-card').hidden = true; save();
      initFields(); renderLines(); renderPicker(); updateTotals();
    });
    $('btn-paste').addEventListener('click', fromMessage);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && feed) sync(false); });
    setInterval(function () { if (document.visibilityState === 'visible') sync(false); }, 5 * 60 * 1000);
  }

  /* ---------- تبدیل پیام مشتری به لیست ---------- */
  function dec(x) { try { return decodeURIComponent(x); } catch (e) { return x; } }
  /* مسیر صفحه‌ی محصول از لینک (با / آخر)؛ id محصولات در سایت همان آدرس صفحه‌شان است */
  function pathOf(url) {
    try {
      var path = dec(new URL(url).pathname);
      if (path.indexOf('/products/') < 0) return '';
      return path.slice(-1) === '/' ? path : path + '/';
    } catch (e) { return ''; }
  }
  function findByPath(path) {
    var best = null, bs = 0;
    feed.products.forEach(function (p) {
      var id = dec(String(p.id)), s = 0;
      if (id === path) s = 4;
      else if (path.slice(-id.length) === id) s = 3;          // لینک با baseurl یا دامنه‌ی دیگر
      if (s > bs) { bs = s; best = p; }
    });
    return best;
  }
  function qtyIn(s) {
    var m = s.match(/(?:^|\s)(\d{1,3})\s*[×xX]\s*[\d,٬]/) || s.match(/[×xX*]\s*(\d{1,3})(?!\d)/) ||
      s.match(/(\d{1,3})\s*عدد/) || s.match(/تعداد\s*[:：]?\s*(\d{1,3})/);
    return m ? Math.min(99, Math.max(1, Number(m[1]))) : 0;
  }
  function parseMessage(text) {
    var out = [], lost = 0, cur = null;
    G.normDigits(text).split(/\r?\n/).forEach(function (ln) {
      (ln.match(/https?:\/\/[^\s)>\]]+/g) || []).forEach(function (u) {
        var path = pathOf(u);
        if (!path) return;
        var p = findByPath(path);
        if (p) { cur = { p: p, q: 1, o: {} }; out.push(cur); } else { cur = null; lost++; }
      });
      if (!cur) return;
      var rest = ln.replace(/https?:\/\/\S+/g, ' ');
      var q = qtyIn(rest); if (q) cur.q = q;
      var sz = rest.match(/سایز\s*[:：]?\s*([^\n،,|]+)/); if (sz) cur.o['سایز'] = G.clip(sz[1].split(/\s[-–—]\s|تعداد|رنگ|×/)[0], 30);
      var cl = rest.match(/رنگ\s*[:：]?\s*([^\n،,|]+)/); if (cl) cur.o['رنگ'] = G.clip(cl[1].split(/\s[-–—]\s|تعداد|سایز|×/)[0], 30);
    });
    if (!out.length && !lost) {
      var nt = nz(text);
      feed.products.forEach(function (p) { var t = nz(p.t); if (t.length >= 8 && nt.indexOf(t) >= 0) out.push({ p: p, q: 1, o: {} }); });
    }
    return { items: out, lost: lost };
  }
  function fromMessage() {
    if (!feed) { G.toast('قیمت‌ها هنوز دریافت نشده'); return; }
    var txt = $('f-paste').value;
    if (!txt.trim()) { G.toast('متن پیام را paste کنید'); return; }
    var r = parseMessage(txt), added = 0;
    r.items.forEach(function (f) {
      var pr = f.p, key = JSON.stringify(f.o), ex = null;
      st.items.forEach(function (i) { if (!ex && i.id === pr.id && !i.c && JSON.stringify(i.o || {}) === key) ex = i; });
      if (ex) ex.q = Math.min(999, ex.q + f.q);
      else st.items.push({ k: ++seq, id: pr.id, t: pr.t, im: pr.im, imf: pr.imf, q: f.q, p: pr.p, sp: pr.p, ed: false, ch: false, o: f.o, c: false, oos: pr.oos });
      added++;
    });
    var msg = added ? G.nf(added) + ' محصول به لیست اضافه شد' : 'محصولی پیدا نشد';
    if (r.lost) msg += ' · ' + G.nf(r.lost) + ' لینک شناسایی نشد';
    $('paste-res').textContent = msg;
    G.toast(msg);
    if (added) { $('f-paste').value = ''; dirty(); renderLines(); renderPicker(); }
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
})();
