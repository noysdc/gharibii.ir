/* صفحهٔ فاکتور برای مشتری: فاکتور را از خود لینک (بعد از #) می‌خواند و نمایش می‌دهد.
   اگر payment_link در _config.yml تنظیم شده باشد، بخش «پرداخت آنلاین» هم نشان داده می‌شود */
(function () {
  'use strict';
  var G = window.GInvoice;
  var $ = function (id) { return document.getElementById(id); };
  var host = $('sheet'), state = $('state'), actions = $('actions');
  var inv = null, feed = null, timer = null, busy = false;
  var cfg = $('pay-cfg');
  var payUrl = cfg ? String(cfg.getAttribute('data-url') || '').trim() : '';
  if (!/^https:\/\//i.test(payUrl)) payUrl = '';
  var gatewayOn = !!(cfg && cfg.getAttribute('data-gateway'));
  var sheba = cfg ? String(cfg.getAttribute('data-sheba') || '').replace(/\s|-/g, '').toUpperCase() : '';
  if (!/^IR\d{24}$/.test(sheba)) sheba = '';
  var card = cfg ? String(cfg.getAttribute('data-card') || '').replace(/\D/g, '') : '';
  if (!/^\d{16}$/.test(card)) card = '';
  var hasBank = !!(card || sheba);
  function cardPretty(v) { return v.replace(/(\d{4})(?=\d)/g, '$1 '); }
  function shebaPretty(v) { return v.slice(0, 4) + ' ' + v.slice(4).replace(/(\d{4})(?=\d)/g, '$1 '); }

  function fail(msg) {
    host.innerHTML = '';
    actions.hidden = true;
    if ($('pay-box')) $('pay-box').hidden = true;
    state.hidden = false;
    state.className = 'view-state bad';
    state.textContent = msg;
  }
  function officialSeller() {
    var s = G.sellerKnown(feed, inv.sw);
    if (s) return s;
    return feed && feed.sellers && feed.sellers[0] ? feed.sellers[0] : null;
  }
  function noLabel() { return inv.no + (inv.rev > 1 ? ' (نسخه ' + G.nf(inv.rev) + ')' : ''); }
  function confirmText() {
    var t = G.totals(inv);
    if (inv.paid) {
      return 'سلام، فاکتور شماره ' + inv.no + ' را دیدم. 🙏';
    }
    if (G.isExpired(inv)) {
      return 'سلام، مهلت پرداخت فاکتور شماره ' + noLabel() + ' تمام شده است. لطفاً قیمت و موجودی به‌روز را اعلام کنید. 🙏';
    }
    return 'سلام، فاکتور شماره ' + noLabel() + ' (جمع کل ' + G.money(t.total) + ') را دیدم و می‌خواهم سفارش را نهایی کنم. 🙏';
  }

  /* ---------- پرداخت آنلاین ---------- */
  function payBlock() {
    if (!inv || inv.paid) return '';
    var t = G.totals(inv);
    if (G.isExpired(inv)) return 'مهلت پرداخت این فاکتور تمام شده؛ برای پرداخت، فاکتور جدید از فروشنده بگیرید.';
    if (t.unpriced > 0) return 'قیمت بعضی اقلام هنوز قطعی نیست؛ قبل از پرداخت با فروشنده هماهنگ کنید.';
    if (t.total <= 0) return 'مبلغ فاکتور صفر است.';
    return '';
  }
  function updatePay() {
    var box = $('pay-box');
    if (!box) return;
    var online = gatewayOn && !!(inv && inv.code);          /* درگاه فقط برای فاکتورِ لینک‌کوتاه (ذخیره‌شده روی سرور) */
    var link = !online && !!payUrl;
    /* روشی که فروشنده انتخاب کرده: ''=هر دو، 'o'=فقط آنلاین، 'c'=فقط کارت. اگر روش انتخابی در دسترس نباشد، روش دیگر نشان داده می‌شود تا مشتری بی‌راه نماند */
    var pm = inv && inv.pm, showOn = (online || link) && pm !== 'c', showCard = hasBank && pm !== 'o';
    if (!showOn && !showCard) { showOn = online || link; showCard = hasBank; }
    online = online && showOn; link = link && showOn;
    if (!inv || inv.paid || (!online && !link && !showCard)) { box.hidden = true; return; }
    var t = G.totals(inv), why = payBlock();
    box.hidden = false;
    $('pay-amount').textContent = G.money(t.total);
    $('pay-no').textContent = noLabel();
    $('pay-warn').textContent = why;
    $('pay-warn').hidden = !why;
    $('pay-m-online').hidden = !online;
    $('pay-m-link').hidden = !link;
    $('pay-m-sheba').hidden = !showCard;
    $('pay-m-sheba-title').textContent = 'کارت‌به‌کارت';
    var sub = $('pay-m-sheba-sub'); if (sub) sub.textContent = (online || link) ? 'روش دیگر پرداخت' : 'پرداخت به شماره کارت زیر';
    $('card-row').hidden = !card; $('card-copy').hidden = !card;
    $('sheba-row').hidden = !sheba; $('sheba-copy-row').hidden = !sheba;
    if (card) $('card-show').textContent = cardPretty(card);
    if (sheba) $('sheba-show').textContent = shebaPretty(sheba);
    /* فاکتور منقضی / قیمت‌نامشخص: همهٔ دکمه‌های پرداخت و کپی غیرفعال می‌شود و کارت کمرنگ می‌شود */
    var off = !!why, expired = G.isExpired(inv);
    ['pay-go', 'pay-go-link', 'card-copy', 'sheba-copy', 'sheba-copy-amount'].forEach(function (id) {
      var el = $(id); if (el) el.disabled = off;
    });
    var bc = $('bank-card');
    if (bc) bc.classList.toggle('is-off', off);
    if ($('bc-state')) { $('bc-state').hidden = !off; $('bc-state').textContent = expired ? 'منقضی' : 'غیرفعال'; }
  }
  function bindPay() {
    if (!$('pay-box')) return;
    /* پرداخت آنلاین: مبلغ را Worker از خود فاکتور می‌خواند و آدرس صفحهٔ بانک را برمی‌گرداند؛ همان تب به بانک می‌رود */
    $('pay-go').addEventListener('click', function () {
      if (!inv || payBlock()) { G.toast(payBlock() || 'فاکتور معتبر نیست'); return; }
      if (!inv.code || busy) return;
      var btn = $('pay-go'), label = btn.textContent;
      busy = true; btn.classList.add('busy'); btn.textContent = 'در حال اتصال به درگاه…';
      G.apiPay(inv.code).then(function (r) {
        if (r && /^https:\/\/payment\.zarinpal\.com\//.test(r.url || '')) { location.href = r.url; return; }
        throw {};
      }).catch(function (e) {
        var d = (e && e.data && e.data.error) || '';
        G.toast(d === 'expired' ? 'مهلت پرداخت فاکتور تمام شده است'
          : d === 'already_paid' ? 'این فاکتور قبلاً پرداخت شده است'
          : 'اتصال به درگاه انجام نشد؛ دوباره تلاش کنید یا با شبا پرداخت کنید');
        busy = false; btn.classList.remove('busy'); btn.textContent = label;
      });
    });
    /* لینک قدیمی زرین‌پال (فقط وقتی درگاه خاموش است) */
    $('pay-go-link').addEventListener('click', function () {
      if (!inv || payBlock()) { G.toast(payBlock() || 'فاکتور معتبر نیست'); return; }
      var amount = G.totals(inv).total;
      G.copyText(String(amount)).then(function (ok) {
        G.toast(ok ? 'مبلغ کپی شد؛ در صفحهٔ پرداخت paste کنید ✅' : 'مبلغ کپی نشد؛ دستی وارد کنید: ' + G.money(amount));
        setTimeout(function () { location.href = payUrl; }, ok ? 900 : 1800);
      });
    });
    /* کارت و شبا */
    $('card-copy').addEventListener('click', function () {
      G.copyText(card).then(function (ok) { G.toast(ok ? 'شماره کارت کپی شد ✅' : 'کپی نشد؛ دستی وارد کنید: ' + card); });
    });
    $('sheba-copy').addEventListener('click', function () {
      G.copyText(sheba).then(function (ok) { G.toast(ok ? 'شماره شبا کپی شد ✅' : 'کپی نشد؛ دستی وارد کنید: ' + sheba); });
    });
    $('sheba-copy-amount').addEventListener('click', function () {
      if (!inv) return;
      G.copyText(String(G.totals(inv).total)).then(function (ok) { G.toast(ok ? 'مبلغ (تومان) کپی شد ✅' : 'کپی نشد'); });
    });
  }

  /* لینک کوتاه (#کد) از سرور خوانده می‌شود؛ لینک بلند قدیمی هنوز مستقیم از خود لینک */
  var pollT = null;
  function startPoll(code) {
    clearInterval(pollT);
    function check() {
      if (!inv || inv.paid || document.visibilityState !== 'visible') return;
      G.apiGet(code).then(function (i) {
        if (i.paid) { clearInterval(pollT); render(i); G.toast('پرداخت شما تأیید شد ✅'); }
      }, function () {});
    }
    pollT = setInterval(check, 25000);
    document.addEventListener('visibilitychange', check);
  }
  var early = null;   /* درخواست فاکتور هم‌زمان با دریافت فهرست محصولات شروع می‌شود، نه بعد از آن */
  function loadRemote(code, tries) {
    if (!G.apiOn()) { fail('این لینک کوتاه روی این سایت فعال نیست. لینک را دوباره از فروشنده بگیرید.'); return; }
    state.hidden = false; state.className = 'view-state'; state.textContent = 'در حال دریافت فاکتور…';
    var first = tries === 0 && early ? early : G.apiGet(code); early = null;
    first.then(function (i) { render(i); startPoll(code); }, function (e) {
      if (e && e.status === 404 && tries < 4) { setTimeout(function () { loadRemote(code, tries + 1); }, 2500); return; }   /* فاکتور تازه ساخته شده و هنوز به همه‌جا نرسیده */
      fail(e && e.status === 404 ? 'این فاکتور پیدا نشد؛ لینک را دوباره از فروشنده بگیرید.' : 'دریافت فاکتور ناموفق بود؛ اینترنت را چک کنید و صفحه را دوباره باز کنید.');
    });
  }
  function show() {
    var h = location.hash.replace(/^#/, '').split('.')[0];
    if (G.isCode(h)) { loadRemote(h, 0); return; }
    render(G.unpack(location.hash));
  }
  /* بنر وضعیت + جملهٔ زیر فاکتور + دکمهٔ تماس: بر اساس وضعیت فعلی (پرداخت‌شده / منقضی / منتظر پرداخت) */
  function paintStatus() {
    if (!inv) return;
    var expired = !inv.paid && G.isExpired(inv);
    $('v-pdf').classList.toggle('btn-primary', !!inv.paid);   /* بعد از پرداخت، ذخیرهٔ PDF مهم‌ترین کار مشتری است */
    $('v-contact').hidden = !expired;
    $('view-note').textContent = inv.paid
      ? 'این فاکتور تأیید و پرداخت‌شده است. برای نگهداری، عکس یا PDF آن را ذخیره کنید.'
      : expired
        ? 'مهلت پرداخت تمام شده؛ برای قیمت و موجودی به‌روز، فاکتور جدید از فروشنده بگیرید.'
        : 'قیمت و موجودی نهایی با فروشنده هماهنگ می‌شود. بعد از پرداخت، فروشنده آن را تأیید می‌کند و فاکتور تأییدشده (با مهر «پرداخت شد») برایتان ارسال می‌شود.';
    state.hidden = true;
    if (inv.paid) {
      state.hidden = false; state.className = 'view-state';
      state.textContent = 'پرداخت این فاکتور تأیید شده است ✅ — می‌توانید PDF یا عکس آن را ذخیره کنید.';
    } else if (expired) {
      state.hidden = false; state.className = 'view-state bad';
      state.textContent = 'مهلت پرداخت این فاکتور تمام شده است. برای قیمت به‌روز با فروشنده هماهنگ کنید.';
    } else if (feed && inv.sw && !G.sellerKnown(feed, inv.sw)) {
      state.hidden = false; state.className = 'view-state warn';
      state.textContent = 'شماره فروشنده این فاکتور در فهرست رسمی فروشگاه نیست. برای اطمینان، با شماره‌های رسمی همین سایت تماس بگیرید.';
    }
  }
  function render(i) {
    inv = i;
    if (!inv) {
      fail('این لینک فاکتور معتبر نیست یا ناقص کپی شده است. لطفاً لینک را دوباره از فروشنده بگیرید.');
      return;
    }
    G.resolve(inv);
    if (timer) clearInterval(timer);
    G.renderSheet(host, inv, feed, { live: true });
    timer = G.watchExpiry(host, inv, feed, function () { updatePay(); paintStatus(); });
    actions.hidden = false;
    state.hidden = true;
    paintStatus();
    updatePay();
    document.title = 'فاکتور ' + inv.no + ' | ' + ((feed && feed.store) || 'فروشگاه غریبی کیش');
  }

  function guard(btn, fn) {
    btn.addEventListener('click', function () {
      if (busy || !inv) return;
      busy = true; btn.classList.add('busy');
      Promise.resolve().then(fn).catch(function () { G.toast('خطا در ساخت فایل؛ دوباره تلاش کنید'); })
        .then(function () { busy = false; btn.classList.remove('busy'); });
    });
  }
  guard($('v-contact'), function () {
    var s = officialSeller();
    return G.openWhatsApp(s ? s.number : '', confirmText());
  });
  guard($('v-text'), function () {
    return G.copyText(G.buildText(inv, feed, '')).then(function (ok) { G.toast(ok ? 'متن کپی شد ✅' : 'کپی نشد'); });
  });
  guard($('v-img'), function () { return G.saveImage(inv, feed); });
  guard($('v-pdf'), function () { return G.savePdf(inv, feed); });
  bindPay();

  /* بازگشت از بانک: ?pay=ok یا ?pay=fail */
  (function () {
    var m = location.search.match(/[?&]pay=(ok|fail)/);
    if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    setTimeout(function () {
      G.toast(m[1] === 'ok' ? 'پرداخت با موفقیت انجام شد ✅' : 'پرداخت انجام نشد. اگر مبلغی کسر شده، تا ۷۲ ساعت به حساب برمی‌گردد؛ یا دوباره تلاش کنید.');
    }, 1200);
  })();
  window.addEventListener('hashchange', show);
  (function () {
    var h0 = location.hash.replace(/^#/, '').split('.')[0];
    if (G.isCode(h0) && G.apiOn()) { early = G.apiGet(h0); early.catch(function () {}); }
    G.loadFeed(false, true).then(function (f) { feed = f; }, function () { feed = null; }).then(show);
  })();
})();
