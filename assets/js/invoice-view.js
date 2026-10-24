/* صفحهٔ پیش‌فاکتور برای مشتری: پیش‌فاکتور را از خود لینک (بعد از #) می‌خواند و نمایش می‌دهد.
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
      return 'سلام، فاکتور نهایی شماره ' + inv.no + ' را دیدم. 🙏';
    }
    if (G.isExpired(inv)) {
      return 'سلام، پیش‌فاکتور شماره ' + noLabel() + ' منقضی شده است. لطفاً قیمت و موجودی به‌روز را اعلام کنید. 🙏';
    }
    return 'سلام، پیش‌فاکتور شماره ' + noLabel() + ' (جمع کل ' + G.money(t.total) + ') را دیدم و می‌خواهم سفارش را نهایی کنم. 🙏';
  }

  /* ---------- پرداخت آنلاین ---------- */
  function payBlock() {
    if (!inv || inv.paid) return '';
    var t = G.totals(inv);
    if (G.isExpired(inv)) return 'این پیش‌فاکتور منقضی شده؛ برای پرداخت، پیش‌فاکتور جدید از فروشنده بگیرید.';
    if (t.unpriced > 0) return 'قیمت بعضی اقلام هنوز قطعی نیست؛ قبل از پرداخت با فروشنده هماهنگ کنید.';
    if (t.total <= 0) return 'مبلغ پیش‌فاکتور صفر است.';
    return '';
  }
  function updatePay() {
    var box = $('pay-box');
    if (!box) return;
    if (!inv || inv.paid || !payUrl) { box.hidden = true; return; }
    var t = G.totals(inv), why = payBlock();
    box.hidden = false;
    $('pay-amount').textContent = G.money(t.total);
    $('pay-no').textContent = noLabel();
    $('pay-warn').textContent = why;
    $('pay-warn').hidden = !why;
    $('pay-go').classList.toggle('busy', !!why);
  }
  function refValue() { return G.clip(G.normDigits($('pay-ref').value), 40); }
  function bindPay() {
    if (!$('pay-box')) return;
    $('pay-go').addEventListener('click', function () {
      if (!inv || payBlock()) { G.toast(payBlock() || 'پیش‌فاکتور معتبر نیست'); return; }
      window.open(payUrl, '_blank', 'noopener');
    });
    $('pay-copy-amount').addEventListener('click', function () {
      if (!inv) return;
      G.copyText(String(G.totals(inv).total)).then(function (ok) { G.toast(ok ? 'مبلغ کپی شد ✅' : 'کپی نشد'); });
    });
    $('pay-copy-no').addEventListener('click', function () {
      if (!inv) return;
      G.copyText(inv.no).then(function (ok) { G.toast(ok ? 'شماره پیش‌فاکتور کپی شد ✅' : 'کپی نشد'); });
    });
    $('pay-send').addEventListener('click', function () {
      if (!inv) return;
      var ref = refValue();
      if (!ref) { G.toast('کد پیگیری پرداخت را وارد کنید'); return; }
      var s = officialSeller();
      G.openWhatsApp(s ? s.number : '', G.payMessage(inv, ref));
    });
    $('pay-copy').addEventListener('click', function () {
      if (!inv) return;
      var ref = refValue();
      if (!ref) { G.toast('کد پیگیری پرداخت را وارد کنید'); return; }
      G.copyText(G.payMessage(inv, ref)).then(function (ok) { G.toast(ok ? 'متن پرداخت کپی شد ✅' : 'کپی نشد'); });
    });
  }

  function show() {
    inv = G.unpack(location.hash);
    if (!inv) {
      fail('این لینک پیش‌فاکتور معتبر نیست یا ناقص کپی شده است. لطفاً لینک را دوباره از فروشنده بگیرید.');
      return;
    }
    G.resolve(inv);
    if (timer) clearInterval(timer);
    G.renderSheet(host, inv, feed, { live: true });
    timer = G.watchExpiry(host, inv, feed, function () { updatePay(); });
    actions.hidden = false;
    state.hidden = true;
    $('v-confirm').textContent = inv.paid ? 'ارسال پیام به فروشنده در واتساپ' : 'تأیید و ادامه در واتساپ';
    if (inv.paid) {
      state.hidden = false; state.className = 'view-state';
      state.textContent = 'این فاکتور نهایی و پرداخت‌شده است ✅';
    } else if (G.isExpired(inv)) {
      state.hidden = false; state.className = 'view-state bad';
      state.textContent = 'این پیش‌فاکتور منقضی شده است. برای قیمت به‌روز با فروشنده هماهنگ کنید.';
    } else if (feed && inv.sw && !G.sellerKnown(feed, inv.sw)) {
      state.hidden = false; state.className = 'view-state warn';
      state.textContent = 'شماره فروشنده این پیش‌فاکتور در فهرست رسمی فروشگاه نیست. برای اطمینان، با شماره‌های رسمی همین سایت تماس بگیرید.';
    }
    updatePay();
    document.title = (inv.paid ? 'فاکتور ' : 'پیش‌فاکتور ') + inv.no + ' | ' + ((feed && feed.store) || 'فروشگاه غریبی کیش');
  }

  function guard(btn, fn) {
    btn.addEventListener('click', function () {
      if (busy || !inv) return;
      busy = true; btn.classList.add('busy');
      Promise.resolve().then(fn).catch(function () { G.toast('خطا در ساخت فایل؛ دوباره تلاش کنید'); })
        .then(function () { busy = false; btn.classList.remove('busy'); });
    });
  }
  guard($('v-confirm'), function () {
    var s = officialSeller();
    return G.openWhatsApp(s ? s.number : '', confirmText());
  });
  guard($('v-text'), function () {
    return G.copyText(G.buildText(inv, feed, '')).then(function (ok) { G.toast(ok ? 'متن کپی شد ✅' : 'کپی نشد'); });
  });
  guard($('v-img'), function () { return G.saveImage(inv, feed); });
  guard($('v-pdf'), function () { return G.savePdf(inv, feed); });
  bindPay();

  window.addEventListener('hashchange', show);
  G.loadFeed().then(function (f) { feed = f; }, function () { feed = null; }).then(show);
})();
