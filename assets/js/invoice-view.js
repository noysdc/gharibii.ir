/* صفحهٔ پیش‌فاکتور برای مشتری: پیش‌فاکتور را از خود لینک (بعد از #) می‌خواند و نمایش می‌دهد */
(function () {
  'use strict';
  var G = window.GInvoice;
  var $ = function (id) { return document.getElementById(id); };
  var host = $('sheet'), state = $('state'), actions = $('actions');
  var inv = null, feed = null, timer = null, busy = false;

  function fail(msg) {
    host.innerHTML = '';
    actions.hidden = true;
    state.hidden = false;
    state.className = 'view-state bad';
    state.textContent = msg;
  }
  function officialSeller() {
    var s = G.sellerKnown(feed, inv.sw);
    if (s) return s;
    return feed && feed.sellers && feed.sellers[0] ? feed.sellers[0] : null;
  }
  function confirmText() {
    var t = G.totals(inv);
    if (G.isExpired(inv)) {
      return 'سلام، پیش‌فاکتور شماره ' + inv.no + ' منقضی شده است. لطفاً قیمت و موجودی به‌روز را اعلام کنید. 🙏';
    }
    return 'سلام، پیش‌فاکتور شماره ' + inv.no + ' (جمع کل ' + G.money(t.total) + ') را دیدم و می‌خواهم سفارش را نهایی کنم. 🙏';
  }

  function show() {
    inv = G.unpack(location.hash);
    if (!inv) {
      fail('این لینک پیش‌فاکتور معتبر نیست یا ناقص کپی شده است. لطفاً لینک را دوباره از فروشنده بگیرید.');
      return;
    }
    if (timer) clearInterval(timer);
    G.renderSheet(host, inv, feed, { live: true });
    timer = G.watchExpiry(host, inv, feed, function () { /* دکمه‌ها می‌مانند؛ متن تأیید عوض می‌شود */ });
    actions.hidden = false;
    state.hidden = true;
    if (G.isExpired(inv)) {
      state.hidden = false; state.className = 'view-state bad';
      state.textContent = 'این پیش‌فاکتور منقضی شده است. برای قیمت به‌روز با فروشنده هماهنگ کنید.';
    } else if (feed && inv.sw && !G.sellerKnown(feed, inv.sw)) {
      state.hidden = false; state.className = 'view-state warn';
      state.textContent = 'شماره فروشنده این پیش‌فاکتور در فهرست رسمی فروشگاه نیست. برای اطمینان، با شماره‌های رسمی همین سایت تماس بگیرید.';
    }
    document.title = 'پیش‌فاکتور ' + inv.no + ' | ' + ((feed && feed.store) || 'فروشگاه غریبی کیش');
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

  window.addEventListener('hashchange', show);
  G.loadFeed().then(function (f) { feed = f; }, function () { feed = null; }).then(show);
})();
