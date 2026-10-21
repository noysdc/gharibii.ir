/* extra.js — رفتارهای اضافه (بعد از main.js لود می‌شود) */
(function () {
  'use strict';

  /* در صفحهٔ اصلی، دکمه‌های دستهٔ بالا (و نوار پایین موبایل) به باکس همان دسته می‌روند.
     در بقیهٔ صفحه‌ها یا وقتی باکسی نباشد، لینک عادی (صفحهٔ دسته) باز می‌شود. */
  var sections = document.querySelectorAll('.cat-section[id^="cat-"]');
  if (!sections.length) return;   /* فقط صفحهٔ اصلی */

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function slugOf(a) {
    var parts = (a.getAttribute('href') || '').split('#')[0].split('?')[0].split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }
  function offset() {
    var sb = document.getElementById('sticky-bar');
    return (sb ? sb.offsetHeight : 0) + 14;
  }
  function go(el) {
    var y = el.getBoundingClientRect().top + window.pageYOffset - offset();
    window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
    el.classList.remove('is-pulse');
    void el.offsetWidth;            /* ری‌استارت انیمیشن */
    el.classList.add('is-pulse');
    setTimeout(function () { el.classList.remove('is-pulse'); }, 1400);
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('.category-nav a, .ios-tabbar a') : null;
    if (!a) return;
    var slug = slugOf(a);
    var el = slug ? document.getElementById('cat-' + slug) : null;
    if (!el) return;
    e.preventDefault();
    go(el);
    try { history.replaceState(null, '', '#cat-' + slug); } catch (err) {}
  });

  /* ورود مستقیم با آدرس #cat-girls */
  if (location.hash.indexOf('#cat-') === 0) {
    var target = document.getElementById(location.hash.slice(1));
    if (target) setTimeout(function () { go(target); }, 400);
  }
})();


/* =====================================================================
   روش‌های دیگر سفارش — برای کسانی که واتساپ ندارند
   (تلگرام / بله / اینستاگرام / تماس / پیامک / کپی متن سفارش)
   تنظیمات از _config.yml  →  <script id="order-channels-data">
   ===================================================================== */
(function () {
  'use strict';
  var dataEl = document.getElementById('order-channels-data');
  if (!dataEl) return;
  var cfg = {};
  try { cfg = JSON.parse(dataEl.textContent) || {}; } catch (e) { return; }

  var isTouch = window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches;

  function toDisplay(n) {                      /* +989347688356 → 09347688356 */
    n = String(n || '').replace(/\D/g, '');
    if (n.indexOf('98') === 0) n = '0' + n.slice(2);
    return n;
  }
  function pretty(n) {                         /* 09347688356 → 0934 768 8356 */
    return /^09\d{9}$/.test(n) ? n.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3') : n;
  }
  function e164(n) {
    n = String(n || '').replace(/[^\d+]/g, '');
    return n.charAt(0) === '+' ? n : '+' + n;
  }

  /* ---- متن سفارش ---- */
  function productMessage() {
    var btn = document.getElementById('product-add-to-cart');
    var h1 = document.querySelector('h1');
    var title = (btn && btn.dataset.title) || (h1 && h1.textContent.trim()) || document.title;
    return 'سلام، من می‌خوام این محصول رو سفارش بدم:\n' + title + '\n' + location.href.split('#')[0];
  }
  function cartMessage() {
    var cart = [];
    try { cart = JSON.parse(localStorage.getItem('gharibii_cart')) || []; } catch (e) { cart = []; }
    var m = 'سلام، من این محصولات را از فروشگاه غریبی کیش سفارش می‌دهم:\n\n', total = 0;
    cart.forEach(function (it, i) {
      var p = Number(String(it.price).replace(/,/g, '')) || 0;
      total += p;
      m += (i + 1) + '. ' + it.title + '\n   💰 قیمت: ' + (p > 0 ? p.toLocaleString('fa-IR') + ' تومان' : 'تماس بگیرید') + '\n   🔗 ' + location.origin + it.url + '\n\n';
    });
    if (total > 0) m += '🧾 جمع کل: ' + total.toLocaleString('fa-IR') + ' تومان\n\n';
    return m + 'لطفاً برای نهایی‌سازی و هماهنگی ارسال (سایز، رنگ، آدرس) راهنمایی‌ام کنید. 🙏';
  }
  function homeMessage() { return 'سلام، درباره محصولات فروشگاه غریبی کیش سوال داشتم'; }
  function messageFor(kind) {
    return kind === 'cart' ? cartMessage() : kind === 'product' ? productMessage() : homeMessage();
  }

  /* ---- کپی و اعلان ---- */
  var toastEl = null, toastTimer = null;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'order-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 3200);
  }
  function copyText(t) {
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = t; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) { return false; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  /* ---- ساخت بلوک ---- */
  function build(kind) {
    var items = [];
    if (cfg.telegram) items.push({ ch: 'telegram', ico: '✈️', label: 'تلگرام', href: 'https://t.me/' + cfg.telegram, copy: true });
    if (cfg.bale) items.push({ ch: 'bale', ico: '💬', label: 'بله', href: 'https://ble.ir/' + cfg.bale, copy: true });
    if (cfg.instagram) items.push({ ch: 'instagram', ico: '📸', label: 'دایرکت اینستاگرام', href: 'https://ig.me/m/' + cfg.instagram, copy: true });
    var phones = cfg.phones || [];
    if (phones.length) items.push({ ch: 'sms', ico: '✉️', label: 'پیامک', href: 'sms:' + e164(phones[0].number) });
    items.push({ ch: 'copy', ico: '📋', label: 'کپی متن سفارش', copy: true, noOpen: true });

    var h = '<p class="order-alt-title">واتساپ ندارید؟ از این راه‌ها هم می‌توانید سفارش بدهید</p><div class="order-alt-grid">';
    items.forEach(function (it) {
      var attrs = ' data-ch="' + it.ch + '"' + (it.copy ? ' data-copy="1"' : '');
      if (it.noOpen) h += '<button type="button" class="order-alt-btn"' + attrs + '><span aria-hidden="true">' + it.ico + '</span>' + it.label + '</button>';
      else h += '<a class="order-alt-btn"' + attrs + ' href="' + it.href + '"' + (it.ch === 'sms' ? '' : ' target="_blank" rel="noopener"') + '><span aria-hidden="true">' + it.ico + '</span>' + it.label + '</a>';
    });
    h += '</div>';
    if (phones.length) {
      h += '<div class="order-alt-phones"><span>📞 تماس تلفنی:</span>';
      phones.forEach(function (p) {
        var d = p.display || pretty(toDisplay(p.number));
        h += '<a class="order-phone" href="tel:' + e164(p.number) + '" data-num="' + toDisplay(p.number) + '" dir="ltr" title="' + (p.label || '') + '">' + d + '</a>';
      });
      h += '</div>';
      if (!isTouch) h += '<p class="order-alt-hint">روی شماره بزنید تا کپی شود.</p>';
    }
    var box = document.createElement('div');
    box.className = 'order-alt';
    box.setAttribute('data-kind', kind);
    box.innerHTML = h;
    return box;
  }

  /* ---- کلیک‌ها ---- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : null;
    if (!t) return;

    var btn = t.closest('.order-alt-btn');
    if (btn) {
      var box = btn.closest('.order-alt');
      var kind = box ? box.getAttribute('data-kind') : 'home';
      var msg = messageFor(kind);
      var ch = btn.getAttribute('data-ch');
      if (ch === 'sms') {                         /* پیامک: فقط موبایل؛ متن آماده داخل لینک */
        btn.setAttribute('href', 'sms:' + (btn.getAttribute('href') || '').replace(/^sms:/, '').split('?')[0] + '?&body=' + encodeURIComponent(msg));
        return;
      }
      if (btn.getAttribute('data-copy')) {
        if (ch === 'copy') e.preventDefault();
        copyText(msg).then(function (ok) {
          toast(ok ? (ch === 'copy' ? 'متن سفارش کپی شد ✅' : 'متن سفارش کپی شد ✅ — در چت paste کنید') : 'کپی نشد؛ متن را دستی بنویسید');
        });
      }
      return;
    }

    var ph = t.closest('.order-phone');
    if (ph && !isTouch) {                         /* دسکتاپ: تماس مستقیم ممکن نیست → کپی شماره */
      e.preventDefault();
      var num = ph.getAttribute('data-num') || ph.textContent.trim();
      copyText(num).then(function (ok) { toast(ok ? 'شماره کپی شد: ' + num : 'شمارهٔ ' + num + ' را یادداشت کنید'); });
    }
  });

  /* ---- جاگذاری در صفحه‌ها ---- */
  function mountProduct() {
    var menu = document.getElementById('wa-menu');
    var open = document.getElementById('open-wa-menu');
    if (!menu || menu.querySelector('.order-alt')) return;
    menu.appendChild(build('product'));
    if (open && !document.querySelector('.order-alt-link')) {
      var link = document.createElement('button');
      link.type = 'button';
      link.className = 'order-alt-link';
      link.textContent = 'واتساپ ندارید؟ روش‌های دیگر سفارش';
      open.insertAdjacentElement('afterend', link);
      link.addEventListener('click', function () {
        if (menu.style.display === 'none') open.click();
        setTimeout(function () {
          var b = menu.querySelector('.order-alt');
          if (b && b.scrollIntoView) b.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      });
    }
  }
  function mountHome() {
    var panel = document.querySelector('.contact-panel');
    if (!panel || panel.querySelector('.order-alt')) return;
    panel.appendChild(build('home'));
  }
  function mountCart() {
    var content = document.querySelector('#cart-modal .cart-content');
    if (!content || content.querySelector('.order-alt')) return;
    var box = build('cart');
    content.appendChild(box);
    var badge = document.getElementById('cart-badge');
    function sync() { box.hidden = !badge || badge.textContent.trim() === '0'; }
    sync();
    if (badge && window.MutationObserver) new MutationObserver(sync).observe(badge, { childList: true, characterData: true, subtree: true });
  }
  function mountAll() { mountProduct(); mountHome(); mountCart(); }
  mountAll();
  /* سبد خرید را main.js بعداً می‌سازد */
  if (window.MutationObserver && !document.querySelector('#cart-modal .cart-content .order-alt')) {
    var mo = new MutationObserver(function () {
      if (document.querySelector('#cart-modal .cart-content')) { mountCart(); if (document.querySelector('#cart-modal .order-alt')) mo.disconnect(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
})();
