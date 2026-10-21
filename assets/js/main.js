(function () {
  'use strict';

  var root = document.documentElement;
  var BASE = (document.querySelector('meta[name="site-baseurl"]') || {}).content || '';

  /* ذخیره‌سازی امن: در حالت خصوصی سافاری یا وقتی ذخیره‌سازی بسته است، خطا نمی‌دهد */
  function mkStore(area) {
    return {
      get: function (k) { try { return window[area].getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { window[area].setItem(k, v); } catch (e) {} },
      remove: function (k) { try { window[area].removeItem(k); } catch (e) {} }
    };
  }
  var store = mkStore('localStorage');
  var sstore = mkStore('sessionStorage');

  /* ---- 1. Theme ---- */
  var themeToggle = document.getElementById('theme-toggle');
  var themeIcon = themeToggle ? themeToggle.querySelector('.theme-icon') : null;
  function applyTheme(theme) {
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
      if (themeIcon) themeIcon.textContent = '\u2600\uFE0F';
    } else {
      root.removeAttribute('data-theme');
      if (themeIcon) themeIcon.textContent = '\uD83C\uDF19';
    }
  }
  applyTheme(store.get('gharibii-theme') || 'light');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var c = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var n = c === 'dark' ? 'light' : 'dark';
      store.set('gharibii-theme', n);
      applyTheme(n);
    });
  }

  /* ---- 2. Font Scale ---- */
  var FONT_MIN = 0.85, FONT_MAX = 1.5, FONT_STEP = 0.1;
  var fontDec = document.getElementById('font-decrease');
  var fontInc = document.getElementById('font-increase');
  function applyFontScale(scale) {
    scale = Math.max(FONT_MIN, Math.min(FONT_MAX, scale));
    root.style.setProperty('--font-scale', scale);
    store.set('gharibii-font-scale', scale);
  }
  applyFontScale(parseFloat(store.get('gharibii-font-scale')) || 1);
  function getScale() {
    return parseFloat(root.style.getPropertyValue('--font-scale')) || 1;
  }
  if (fontInc) fontInc.addEventListener('click', function () { applyFontScale(getScale() + FONT_STEP); });
  if (fontDec) fontDec.addEventListener('click', function () { applyFontScale(getScale() - FONT_STEP); });

  /* ---- 3. Product Gallery ---- */
  var mainImg = document.getElementById('main-img');
  var thumbs = document.querySelectorAll('.thumbs button');
  if (mainImg && thumbs.length) {
    thumbs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var src = btn.getAttribute('data-src');
        if (src) mainImg.src = src;
        thumbs.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  /* ---- 4. Sticky Bar ---- */
  var stickyBar = document.getElementById('sticky-bar');
  if (stickyBar) {
    var sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;pointer-events:none;';
    stickyBar.parentNode.insertBefore(sentinel, stickyBar);
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        stickyBar.classList.toggle('is-stuck', !e.isIntersecting);
      });
    }, { threshold: [1] });
    obs.observe(sentinel);
  }

  /* ---- 5. Search ---- */
  var searchInput = document.getElementById('site-search');
  var searchResults = document.getElementById('search-results');
  var productsIndex = null;
  function loadProducts() {
    if (productsIndex) return Promise.resolve(productsIndex);
    var meta = document.querySelector('meta[name="site-baseurl"]');
    var base = meta ? meta.getAttribute('content') : '';
    return fetch(base + '/search.json').then(function (r) { return r.json(); }).then(function (data) { productsIndex = data; return data; }).catch(function () { productsIndex = []; return []; });
  }
  function normalize(str) {
    return (str || '').toString().toLowerCase().replace(/\u064A/g, '\u06CC').replace(/\u0643/g, '\u06A9').replace(/[\u064B-\u065F\u0670]/g, '').trim();
  }
  function renderResults(list) {
    if (!searchResults) return;
    if (!list.length) {
      searchResults.innerHTML = '<div class="search-empty">\u0645\u062D\u0635\u0648\u0644\u06CC \u06CC\u0627\u0641\u062A \u0646\u0634\u062F</div>';
      searchResults.hidden = false;
      return;
    }
    searchResults.innerHTML = list.slice(0, 8).map(function (p) {
      var img = p.image ? '<img src="' + p.image + '" alt="" loading="lazy">' : '';
      return '<a class="search-item" href="' + p.url + '">' + img + '<span class="search-item-info"><strong>' + p.title + '</strong><small>' + (Number(String(p.price).replace(/,/g, '')) > 0 ? Number(String(p.price).replace(/,/g, '')).toLocaleString('fa-IR') + ' \u062A\u0648\u0645\u0627\u0646' : '') + '</small></span></a>';
    }).join('');
    searchResults.hidden = false;
  }
  if (searchInput && searchResults) {
    var timer = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var q = normalize(searchInput.value);
        if (q.length < 2) { searchResults.hidden = true; return; }
        loadProducts().then(function (products) {
          var matched = products.filter(function (p) { return normalize(p.title).indexOf(q) !== -1 || normalize(p.category).indexOf(q) !== -1 || normalize(p.category_fa).indexOf(q) !== -1; });
          renderResults(matched);
        });
      }, 150);
    });
    document.addEventListener('click', function (e) {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) searchResults.hidden = true;
    });
  }

  /* ---- 6. Welcome Toast ---- */
  var toast = document.getElementById('welcome-toast');
  var toastText = document.getElementById('welcome-toast-text');
  var toastClose = document.getElementById('welcome-toast-close');
  function hideWelcomeToast() {
    if (!toast) return;
    toast.classList.remove('is-visible');
    setTimeout(function () { toast.hidden = true; }, 400);
  }
  function showWelcomeToast() {
    if (!toast || !toastText) return;
    if (sstore.get('gharibii-welcome-shown')) return;
    toastText.textContent = '\u0628\u0647 \u0641\u0631\u0648\u0634\u06AF\u0627\u0647 \u0622\u0646\u0644\u0627\u06CC\u0646 \u063A\u0631\u06CC\u0628\u06CC \u062E\u0648\u0634 \u0627\u0648\u0645\u062F\u06CC\u062F';
    setTimeout(function () {
      toast.hidden = false;
      requestAnimationFrame(function () { toast.classList.add('is-visible'); });
      sstore.set('gharibii-welcome-shown', '1');
    }, 1500);
    setTimeout(hideWelcomeToast, 6000);
  }
  if (toastClose) toastClose.addEventListener('click', hideWelcomeToast);
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', showWelcomeToast); } else { showWelcomeToast(); }

  /* ============================================
     سیستم سبد خرید و سفارش
     یک منبع داده (localStorage: gharibii_cart) و یک سازندهٔ پیام برای همهٔ صفحه‌ها
     ============================================ */
  var CART_KEY = 'gharibii_cart';
  var CART_TTL = 30 * 24 * 3600 * 1000;           /* انتخاب‌های قدیمی‌تر از ۳۰ روز خودکار پاک می‌شوند */
  var MAX_WA_URL = 4000;                          /* بالاتر از این، متن کامل کپی می‌شود و پیام کوتاه باز می‌شود */
  var HOME_MSG = 'سلام، درباره محصولات فروشگاه غریبی کیش سوال داشتم';
  var isTouch = !!(window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);

  var CFG = {};
  try { var cfgEl = document.getElementById('order-config'); CFG = cfgEl ? JSON.parse(cfgEl.textContent) : {}; } catch (err) { CFG = {}; }
  function cfgNum(k) { return Number(CFG[k]) || 0; }

  function toNum(v) { return Number(String(v == null ? '' : v).replace(/[,٬،\s]/g, '')) || 0; }

  /* آدرس‌ها بدون baseurl ذخیره می‌شوند تا بعد از وصل شدن دامنه، سبدهای قدیمی خراب نشوند */
  function toPath(u) {
    u = String(u || '');
    try {
      var a = new URL(u, location.origin);
      if (a.origin !== location.origin) return u;
      u = a.pathname;
    } catch (err) {}
    if (BASE && u.indexOf(BASE + '/') === 0) u = u.slice(BASE.length);
    return u;
  }
  function fullPath(p) { p = String(p || ''); return /^(https?:)?\/\//.test(p) ? p : BASE + p; }
  function fullUrl(p) { return /^(https?:)?\/\//.test(p) ? p : location.origin + BASE + p; }

  function readCart() {
    var list = [], legacy = null, changed = false;
    try { list = JSON.parse(store.get(CART_KEY)) || []; } catch (err) { list = []; }
    if (!Array.isArray(list)) list = [];
    /* مهاجرت از کلید قدیمی صفحهٔ محصول ('cart') */
    try { legacy = JSON.parse(store.get('cart')); } catch (err) { legacy = null; }
    if (Array.isArray(legacy)) { list = list.concat(legacy); changed = true; }
    if (store.get('cart') !== null) { store.remove('cart'); }

    var now = Date.now(), seen = {}, out = [];
    list.forEach(function (i) {
      if (!i || !i.title) return;
      var path = toPath(i.path || i.url);
      if (!path || seen[path]) { changed = true; return; }
      var ts = Number(i.ts) || now;
      if (now - ts > CART_TTL) { changed = true; return; }
      seen[path] = 1;
      out.push({ title: String(i.title), price: toNum(i.price), image: i.image ? toPath(i.image) : '', path: path, ts: ts });
    });
    if (changed) store.set(CART_KEY, JSON.stringify(out));
    return out;
  }
  var cart = readCart();

  function saveCart() {
    store.set(CART_KEY, JSON.stringify(cart));
    updateCartUI();
  }
  function inCart(path) { return cart.some(function (i) { return i.path === path; }); }

  function fmtPrice(num) {
    var n = toNum(num);
    if (n === 0) return 'تماس بگیرید';
    return n.toLocaleString('fa-IR');
  }
  function money(n) { return n.toLocaleString('fa-IR') + ' تومان'; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function showMiniToast(msg) {
    var t = document.getElementById('mini-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'mini-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---- محاسبهٔ جمع و هزینهٔ ارسال/گمرک (تنظیم از _config.yml) ---- */
  function calc(items) {
    var n = items.length, sub = 0, unpriced = 0;
    items.forEach(function (i) { if (i.price > 0) sub += i.price; else unpriced++; });
    var fees = n ? cfgNum('shippingCustoms') : 0;      /* ارسال + گمرک: یک مبلغ برای کل سفارش (_config.yml → shipping_customs_cost) */
    return { n: n, sub: sub, unpriced: unpriced, fees: fees, total: sub + fees };
  }

  /* ---- تنها سازندهٔ متن سفارش (واتساپ، کپی، تلگرام، بله، اینستاگرام) ---- */
  function buildMessage(items) {
    var c = calc(items);
    var m = 'سلام، من می‌خوام این ' + (items.length > 1 ? 'محصولات' : 'محصول') + ' رو از فروشگاه غریبی کیش سفارش بدم:\n\n';
    items.forEach(function (it, i) {
      m += (i + 1) + '. ' + it.title + '\n';
      m += '   💰 قیمت: ' + (it.price > 0 ? money(it.price) : 'تماس بگیرید') + '\n';
      m += '   🔗 ' + fullUrl(it.path) + '\n\n';
    });
    m += '━━━━━━━━━━━━━━\n';
    if (c.sub > 0) m += '🧾 جمع کالاها: ' + money(c.sub) + '\n';
    if (c.fees > 0) m += '🚚 هزینه ارسال و گمرک: ' + money(c.fees) + '\n';
    if (c.sub > 0) m += '💳 جمع کل: ' + money(c.total) + '\n';
    if (c.unpriced > 0) m += '⚠️ قیمت ' + c.unpriced.toLocaleString('fa-IR') + ' محصول با فروشنده هماهنگ می‌شود.\n';
    m += '\nلطفاً برای نهایی‌سازی (سایز، رنگ، آدرس و هزینهٔ دقیق ارسال) راهنمایی‌ام کنید. 🙏';
    return m;
  }

  /* محصولِ همین صفحه (برای باکس سفارش صفحهٔ محصول) */
  function productItem() {
    var b = document.querySelector('.buy-actions[data-title]');
    if (!b) return null;
    return { title: b.dataset.title, price: toNum(b.dataset.price), image: b.dataset.image ? toPath(b.dataset.image) : '', path: toPath(b.dataset.url || location.pathname) };
  }

  /* kind: product = همین محصول | cart = کل سبد | home = پیام عمومی */
  function messageFor(kind) {
    if (kind === 'cart') return cart.length ? buildMessage(cart) : '';
    if (kind === 'product') { var p = productItem(); return p ? buildMessage([p]) : HOME_MSG; }
    return HOME_MSG;
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
      } catch (err) { return false; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  function openWhatsApp(number, kind) {
    var msg = messageFor(kind);
    if (kind === 'cart' && !msg) { showMiniToast('سبد خرید خالی است!'); return; }
    var url = 'https://wa.me/' + number + '?text=' + encodeURIComponent(msg);
    if (url.length > MAX_WA_URL) {
      /* سفارش بلند: متن کامل کپی می‌شود تا در چت paste شود، و فقط یک پیام کوتاه باز می‌شود */
      copyText(msg);
      showMiniToast('سفارش طولانی است؛ متن کامل کپی شد — در واتساپ paste کنید ✅');
      window.open('https://wa.me/' + number + '?text=' + encodeURIComponent('سلام، سفارش من چند محصول است. متن کامل سفارش را در پیام بعدی می‌فرستم.'), '_blank', 'noopener');
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  /* ---- فروشنده‌ها ---- */
  var sellers = [];
  try {
    var el = document.getElementById('wa-sellers-data');
    sellers = el ? JSON.parse(el.textContent) : [];
  } catch (err) { sellers = []; }
  if (!sellers.length) sellers = [{ name: 'فروشنده', number: '989347688356', photo: '' }];

  function renderSellers() {
    var box = document.getElementById('cart-sellers');
    if (!box) return;
    box.innerHTML = sellers.map(function (s) {
      return `<button type="button" class="wa-seller" data-wa-number="${esc(s.number)}" data-kind="cart">
          <span class="wa-avatar">${s.photo ? `<img src="${esc(s.photo)}" alt="" width="160" height="160" onerror="this.remove()">` : ''}</span>
          <span class="wa-seller-info"><strong>${esc(s.name)}</strong><small>ارسال سفارش</small></span>
        </button>`;
    }).join('');
  }

  /* ---- قالب‌های مشترک (از _includes: یک متن، یک ظاهر) ---- */
  function tpl(id) { var t = document.getElementById(id); return t && t.content ? t.content.cloneNode(true) : null; }
  function mountAlt(slot, kind) {
    if (!slot || slot.querySelector('.order-alt-box')) return;
    var frag = tpl('tpl-order-alt');
    if (!frag) return;
    var box = frag.querySelector('.order-alt-box');
    if (box) box.setAttribute('data-kind', kind);
    slot.appendChild(frag);
    var hint = slot.querySelector('.order-alt-hint');
    if (hint && isTouch) hint.textContent = 'روی شماره بزنید تا تماس گرفته شود.';
  }

  function ensureCartShell() {
    if (document.getElementById('floating-cart')) return;
    var html = `
      <div class="floating-cart" id="floating-cart" aria-label="سبد خرید">
        🛒 <span class="cart-badge" id="cart-badge">0</span>
      </div>
      <div class="cart-modal" id="cart-modal">
        <div class="cart-content">
          <button class="cart-close" id="cart-close" type="button" aria-label="بستن">✕</button>
          <h3 style="margin-top:0; text-align:center;">سبد خرید شما</h3>
          <div id="cart-items-container"></div>
          <div id="cart-totals" class="cart-totals" hidden></div>
          <button type="button" class="cart-clear" id="cart-clear" hidden>🗑️ خالی کردن سبد</button>
          <div id="cart-note-slot"></div>
          <button class="cart-checkout" id="cart-checkout" type="button">ارسال سفارش در واتساپ</button>
          <div class="wa-sellers cart-sellers" id="cart-sellers" hidden></div>
          <div id="cart-alt-slot"></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    var n = tpl('tpl-order-note'), slot = document.getElementById('cart-note-slot');
    if (n && slot) slot.appendChild(n);
    mountAlt(document.getElementById('cart-alt-slot'), 'cart');
  }

  /* دکمهٔ «افزودن به سبد» صفحهٔ محصول: بعد از رفرش هم می‌داند محصول در سبد هست */
  function syncProductBtn() {
    var b = document.getElementById('product-add-to-cart');
    if (!b || b.disabled) return;
    if (b._orig === undefined) b._orig = b.innerHTML;
    if (b.classList.contains('is-added')) return;
    var yes = inCart(toPath(b.dataset.url || location.pathname));
    b.classList.toggle('is-in-cart', yes);
    b.innerHTML = yes ? '✅ در سبد شماست — مشاهدهٔ سبد' : b._orig;
  }

  function updateCartUI() {
    var badge = document.getElementById('cart-badge');
    var container = document.getElementById('cart-items-container');
    var fc = document.getElementById('floating-cart');
    if (badge) badge.textContent = cart.length;
    if (fc) fc.classList.toggle('has-items', cart.length > 0);
    syncProductBtn();
    if (!container) return;

    var empty = cart.length === 0;
    var totals = document.getElementById('cart-totals');
    var clearBtn = document.getElementById('cart-clear');
    var checkout = document.getElementById('cart-checkout');
    var alt = document.querySelector('#cart-modal .order-alt-box');
    if (clearBtn) clearBtn.hidden = empty;
    if (checkout) checkout.hidden = empty;
    if (alt) alt.hidden = empty;
    if (empty) {
      var sb = document.getElementById('cart-sellers'); if (sb) sb.hidden = true;
    }

    if (empty) {
      container.innerHTML = '<p style="text-align:center; color:#777;">سبد خرید شما خالی است.</p>';
      if (totals) totals.hidden = true;
      return;
    }
    container.innerHTML = cart.map(function (item, index) {
      return `
        <div class="cart-item">
          ${item.image ? `<img src="${esc(fullPath(item.image))}" alt="${esc(item.title)}">` : ''}
          <div class="cart-item-info">
            <h4><a href="${esc(fullPath(item.path))}">${esc(item.title)}</a></h4>
            <span>${fmtPrice(item.price)}${item.price > 0 ? ' تومان' : ''}</span>
          </div>
          <button class="cart-item-remove" data-index="${index}" type="button" aria-label="حذف">🗑️</button>
        </div>
      `;
    }).join('');

    if (totals) {
      var c = calc(cart);
      var rows = '';
      if (c.sub > 0) rows += `<div class="cart-totals-row"><span>جمع کالاها</span><b>${money(c.sub)}</b></div>`;
      if (c.fees > 0) rows += `<div class="cart-totals-row"><span>هزینه ارسال و گمرک</span><b>${money(c.fees)}</b></div>`;
      if (c.sub > 0) rows += `<div class="cart-totals-row is-total"><span>جمع کل</span><b>${money(c.total)}</b></div>`;
      if (c.unpriced > 0) rows += `<div class="cart-totals-row is-hint"><span>قیمت ${c.unpriced.toLocaleString('fa-IR')} محصول با فروشنده هماهنگ می‌شود.</span></div>`;
      totals.innerHTML = rows;
      totals.hidden = !rows;
    }
  }

  function resetClearBtn(btn) {
    btn.dataset.armed = '';
    btn.textContent = '🗑️ خالی کردن سبد';
  }

  function addToCart(btn) {
    var title = btn.dataset.title;
    if (!title || btn.disabled) return;
    var path = toPath(btn.dataset.url || location.pathname);

    if (inCart(path)) {
      if (btn.id === 'product-add-to-cart') {
        var m = document.getElementById('cart-modal'); if (m) m.classList.add('active');
      } else {
        showMiniToast('این محصول قبلاً در سبد شماست ⚠️');
      }
      return;
    }

    cart.push({ title: title, price: toNum(btn.dataset.price), image: btn.dataset.image ? toPath(btn.dataset.image) : '', path: path, ts: Date.now() });

    if (btn.id === 'product-add-to-cart') {
      btn.classList.add('is-added');
      btn.innerHTML = '✅ اضافه شد';
      setTimeout(function () { btn.classList.remove('is-added'); syncProductBtn(); }, 1500);
    }
    saveCart();
    showMiniToast('محصول به سبد خرید اضافه شد 🛒');
  }

  /* ✅ همهٔ کلیک‌ها یک‌جا (event delegation) */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    /* افزودن به سبد (کارت‌ها و صفحهٔ محصول) */
    var cartBtn = t.closest('.add-to-cart-btn, #product-add-to-cart');
    if (cartBtn) { e.preventDefault(); e.stopPropagation(); addToCart(cartBtn); return; }

    /* باز/بسته کردن منوی فروشنده‌ها در صفحهٔ محصول */
    var waBtn = t.closest('#open-wa-menu');
    var waMenu = document.getElementById('wa-menu');
    if (waBtn && waMenu) {
      e.preventDefault();
      waMenu.style.display = waMenu.style.display === 'none' ? 'block' : 'none';
      return;
    }

    /* انتخاب فروشنده (صفحهٔ محصول و سبد) → همین قالب پیام */
    var sel = t.closest('[data-wa-number]');
    if (sel) { e.preventDefault(); openWhatsApp(sel.getAttribute('data-wa-number'), sel.getAttribute('data-kind') || 'product'); return; }

    /* باکس «روش‌های دیگر سفارش» */
    var box = t.closest('.order-alt-box');
    if (box) {
      var kind = box.getAttribute('data-kind') || 'home';
      var act = t.closest('[data-action="copy"]');
      if (act) {
        e.preventDefault();
        var msg = messageFor(kind);
        if (!msg) { showMiniToast('سبد خرید خالی است!'); return; }
        copyText(msg).then(function (ok) { showMiniToast(ok ? 'متن سفارش کپی شد ✅' : 'کپی نشد؛ متن را دستی بنویسید'); });
        return;
      }
      var ch = t.closest('[data-ch]');
      if (ch) {                               /* تلگرام/بله/اینستاگرام: لینک باز می‌شود + متن کپی می‌شود */
        var m2 = messageFor(kind);
        if (ch.getAttribute('data-ch') === 'sms') {     /* پیامک: موبایل → متن آماده داخل لینک | دسکتاپ → کپی متن */
          if (!m2) { e.preventDefault(); showMiniToast('سبد خرید خالی است!'); return; }
          if (isTouch) { ch.setAttribute('href', 'sms:' + ch.getAttribute('data-sms') + '?&body=' + encodeURIComponent(m2)); return; }
          e.preventDefault();
          copyText(m2).then(function (ok) { showMiniToast(ok ? 'متن سفارش کپی شد ✅ — پیامک را از گوشی خود بفرستید' : 'کپی نشد؛ متن را دستی بنویسید'); });
          return;
        }
        if (m2) copyText(m2).then(function (ok) { if (ok) showMiniToast('متن سفارش کپی شد ✅ — در چت paste کنید'); });
        return;
      }
      var ph = t.closest('[data-phone]');
      if (ph && !isTouch) {                   /* دسکتاپ: تماس مستقیم ممکن نیست → کپی شماره */
        e.preventDefault();
        var num = ph.getAttribute('data-phone');
        copyText(num).then(function (ok) { showMiniToast(ok ? 'شماره کپی شد: ' + num : 'شمارهٔ ' + num + ' را یادداشت کنید'); });
        return;
      }
      return;
    }

    /* باز کردن مودال سبد */
    if (t.closest('#floating-cart')) {
      var waM = document.getElementById('wa-menu'); if (waM) waM.style.display = 'none';
      document.getElementById('cart-modal').classList.add('active');
      return;
    }

    /* بستن مودال */
    if (t.closest('#cart-close') || t.classList.contains('cart-modal')) {
      document.getElementById('cart-modal').classList.remove('active');
      var sb = document.getElementById('cart-sellers'); if (sb) sb.hidden = true;
      return;
    }

    /* حذف یک آیتم */
    if (t.closest('.cart-item-remove')) {
      var index = parseInt(t.closest('.cart-item-remove').dataset.index, 10);
      cart.splice(index, 1);
      saveCart();
      return;
    }

    /* خالی کردن کل سبد (دو مرحله‌ای، بدون پنجرهٔ confirm) */
    var clr = t.closest('#cart-clear');
    if (clr) {
      if (clr.dataset.armed === '1') {
        clearTimeout(clr._t);
        cart = [];
        saveCart();
        resetClearBtn(clr);
        showMiniToast('سبد خرید خالی شد');
      } else {
        clr.dataset.armed = '1';
        clr.textContent = 'مطمئنید؟ دوباره بزنید';
        clr._t = setTimeout(function () { resetClearBtn(clr); }, 3500);
      }
      return;
    }

    /* ارسال سفارش در واتساپ (از داخل سبد) */
    if (t.closest('#cart-checkout')) {
      if (cart.length === 0) { showMiniToast('سبد خرید خالی است!'); return; }
      if (sellers.length === 1) { openWhatsApp(sellers[0].number, 'cart'); return; }
      var sbox = document.getElementById('cart-sellers');
      if (sbox) {
        if (sbox.hidden) renderSellers();
        sbox.hidden = !sbox.hidden;
      }
      return;
    }
  });

  /* همگام‌سازی بین تب‌ها: اگر در تب دیگر چیزی اضافه/حذف شد، همین‌جا هم عوض می‌شود */
  window.addEventListener('storage', function (e) {
    if (e.key === CART_KEY || e.key === null) { cart = readCart(); updateCartUI(); }
  });

  function initCart() {
    ensureCartShell();
    mountAlt(document.querySelector('.contact-panel'), 'home');
    updateCartUI();
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initCart); } else { initCart(); }

  /* ---- 7. Card Sliders ---- */
  (function initCardSliders() {
    var cards = document.querySelectorAll('[data-slider]');
    if (!cards.length) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cards.forEach(function (card) {
      var track = card.querySelector('.slides');
      var slides = card.querySelectorAll('.slide');
      var dots = card.querySelectorAll('.slide-dot');
      var prev = card.querySelector('.slide-prev');
      var next = card.querySelector('.slide-next');
      if (!track || slides.length < 2) return;
      var idx = 0, timer = null, hold = false, visible = false;
      var dir = (window.getComputedStyle(track).direction === 'rtl') ? -1 : 1;
      function mark() { dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); }); }
      function go(i) {
        idx = (i + slides.length) % slides.length;
        track.scrollTo({ left: dir * idx * track.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
        mark();
      }
      track.addEventListener('scroll', function () {
        var w = track.clientWidth || 1;
        var i = Math.round(Math.abs(track.scrollLeft) / w);
        if (i !== idx && i >= 0 && i < slides.length) { idx = i; mark(); }
      }, { passive: true });
      function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }
      function startAuto() { if (reduce || timer || !visible) return; timer = setInterval(function () { if (!hold) go(idx + 1); }, 3200 + Math.random() * 1500); }
      function bind(btn, step) { if (!btn) return; btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); go(idx + step); }); }
      bind(prev, -1); bind(next, 1);
      card.addEventListener('mouseenter', function () { hold = true; });
      card.addEventListener('mouseleave', function () { hold = false; });
      card.addEventListener('focusin', function () { hold = true; });
      card.addEventListener('focusout', function () { hold = false; });
      card.addEventListener('touchstart', function () { hold = true; clearTimeout(card._resume); card._resume = setTimeout(function () { hold = false; }, 6000); }, { passive: true });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; if (visible) startAuto(); else stopAuto(); }, { threshold: 0.35 }).observe(card);
      } else { visible = true; startAuto(); }
    });
  })();

  /* ---- 8. Thumbnails Slider ---- */
  (function initThumbSlider() {
    var wraps = document.querySelectorAll('.thumbs-wrap');
    wraps.forEach(function (wrap) {
      var strip = wrap.querySelector('.thumbs');
      var prev = wrap.querySelector('.thumb-prev');
      var next = wrap.querySelector('.thumb-next');
      if (!strip) return;
      var first = strip.querySelector('button');
      if (first && !strip.querySelector('button.active')) first.classList.add('active');
      function update() {
        var max = strip.scrollWidth - strip.clientWidth;
        var pos = Math.abs(strip.scrollLeft);
        if (prev) prev.classList.toggle('is-off', pos >= max - 2);
        if (next) next.classList.toggle('is-off', pos <= 2);
      }
      strip.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      window.addEventListener('load', update);
      update();
      function page(dir) { strip.scrollBy({ left: dir * strip.clientWidth * 0.8, behavior: 'smooth' }); }
      if (prev) prev.addEventListener('click', function () { page(-1); });
      if (next) next.addEventListener('click', function () { page(1); });
      var down = false, moved = false, startX = 0, startLeft = 0;
      strip.addEventListener('mousedown', function (e) { down = true; moved = false; startX = e.clientX; startLeft = strip.scrollLeft; });
      window.addEventListener('mousemove', function (e) {
        if (!down) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 5) { moved = true; strip.classList.add('is-dragging'); }
        if (moved) strip.scrollLeft = startLeft - dx;
      });
      window.addEventListener('mouseup', function () { if (!down) return; down = false; strip.classList.remove('is-dragging'); });
      strip.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
      strip.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', function () { if (btn.scrollIntoView) btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); });
      });
    });
  })();

  /* ---- 9. Category Nav ---- */
  (function initCategoryNav() {
    var box = document.getElementById('category-box');
    var nav = document.getElementById('category-nav');
    if (!box || !nav) return;
    var left = box.querySelector('.cat-prev');
    var right = box.querySelector('.cat-next');
    function update() {
      var max = nav.scrollWidth - nav.clientWidth;
      var overflow = max > 2;
      box.classList.toggle('has-overflow', overflow);
      var pos = Math.abs(nav.scrollLeft);
      var atStart = pos <= 2;
      var atEnd = pos >= max - 2;
      nav.classList.toggle('can-right', overflow && !atStart);
      nav.classList.toggle('can-left', overflow && !atEnd);
      if (left) left.classList.toggle('is-off', atEnd);
      if (right) right.classList.toggle('is-off', atStart);
    }
    nav.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('load', update);
    function step(dir) { nav.scrollBy({ left: dir * Math.max(nav.clientWidth * 0.7, 120), behavior: 'smooth' }); }
    if (left) left.addEventListener('click', function () { step(-1); });
    if (right) right.addEventListener('click', function () { step(1); });
    var cur = nav.querySelector('[aria-current="page"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
    update();
  })();

  /* ---- چیدمان تصادفی: ترتیب دسته‌ها و کارت‌ها در هر بار بارگذاری عوض می‌شود ----
     (برای دیدن ترتیب ثابت: آدرس را با ?order=default باز کنید) */
  (function shuffleLayout() {
    if (/[?&]order=default/.test(location.search)) return;
    function shuffled(list) {
      var a = list.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    /* نودهای هم‌پدر را درجا جابه‌جا می‌کند */
    function reorder(nodes) {
      if (nodes.length < 2) return;
      var parent = nodes[0].parentNode;
      var end = document.createComment('');
      parent.insertBefore(end, nodes[nodes.length - 1].nextSibling);
      shuffled(nodes).forEach(function (n) { parent.insertBefore(n, end); });
      parent.removeChild(end);
    }
    function kids(parent, sel) {
      return Array.prototype.filter.call(parent.children, function (n) { return n.matches(sel); });
    }
    try {
      var tiles = document.querySelector('.tiles');
      if (tiles) reorder(kids(tiles, '.tile-col'));
      var scroller = document.querySelector('.cat-scroller');
      if (scroller) reorder(kids(scroller, '.cat-tile'));
      var main = document.querySelector('main');
      if (main) reorder(kids(main, '.cat-section'));
      Array.prototype.forEach.call(document.querySelectorAll('.grid'), function (g) {
        reorder(kids(g, '.card'));
      });
    } catch (err) { /* چیدمان پیش‌فرض می‌ماند */ }
  })();

  /* ---- 10. PWA: صفحهٔ لودینگ + سرویس‌ورکر + دکمهٔ نصب اپلیکیشن (اندروید و آیفون) ---- */
  (function initPWA() {
    /* --- صفحهٔ لودینگ اپ: بعد از آماده شدن صفحه با محو شدن کنار می‌رود --- */
    var splash = document.getElementById('app-splash');
    if (splash) {
      var shownAt = Date.now();
      var closed = false;
      var closeSplash = function () {
        if (closed) return;
        closed = true;
        sstore.set('gharibii-splash', '1');
        splash.classList.add('is-out');
        setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 700);
      };
      var armClose = function () {
        /* حداقل ~۱ ثانیه می‌ماند تا انیمیشن هولوگرامی دیده شود */
        setTimeout(closeSplash, Math.max(0, 1100 - (Date.now() - shownAt)));
      };
      if (document.readyState === 'complete') armClose();
      else window.addEventListener('load', armClose);
      setTimeout(closeSplash, 4000);                 /* اگر شبکه کند بود، گیر نکند */
    }

    var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if ('serviceWorker' in navigator && secure) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register(BASE + '/sw.js', { scope: BASE + '/' }).catch(function () {});
      });
    }

    var box = document.getElementById('install-footer-box');
    var btn = document.getElementById('install-btn');
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                     window.navigator.standalone === true;
    if (standalone) { if (box) box.style.display = 'none'; return; }   /* قبلاً نصب شده */

    var ua = navigator.userAgent || '';
    var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios|chrome|android/i.test(ua);
    /* مرورگرهای داخلی اینستاگرام/فیسبوک/لاین و... نصب را پشتیبانی نمی‌کنند */
    var inApp = /instagram|fban|fbav|fb_iab|line\/|micromessenger|twitter|snapchat|telegram/i.test(ua);
    var KEY = 'gharibii-install-dismissed';
    var deferred = window.__bip || null;             /* رویداد نصب که زودتر در <head> گرفته شده */

    function dismissedRecently() {
      var t = parseInt(store.get(KEY) || '0', 10);
      return !!t && (Date.now() - t) < 14 * 86400000;
    }
    function removeBar() {
      var b = document.getElementById('install-bar');
      if (b) b.remove();
    }
    function barText(mode) {
      if (mode === 'inapp') return 'این صفحه داخل مرورگر برنامهٔ دیگری باز شده. از منوی ⋯ گزینهٔ «باز کردن در مرورگر» (Safari یا Chrome) را بزنید و بعد نصب کنید.';
      if (mode === 'ios') return isSafari
        ? 'دکمهٔ اشتراک‌گذاری (Share) پایین یا بالای صفحه را بزنید، گزینهٔ «Add to Home Screen» را انتخاب و «Add» را بزنید.'
        : 'دکمهٔ اشتراک‌گذاری (Share) را بزنید، «Add to Home Screen» را انتخاب کنید. اگر گزینه را ندیدید، سایت را در Safari باز کنید.';
      if (mode === 'manual') return 'از منوی مرورگر (⋮) گزینهٔ «Install app» یا «افزودن به صفحه اصلی» را بزنید.';
      return 'مثل یک اپلیکیشن روی گوشی‌تان باشد؛ سریع‌تر و راحت‌تر.';
    }
    function showBar(mode, force) {
      if (document.getElementById('install-bar')) return;
      if (!force && (dismissedRecently() || !window.matchMedia('(max-width: 900px)').matches)) return;
      var bar = document.createElement('div');
      bar.className = 'install-bar';
      bar.id = 'install-bar';
      bar.innerHTML =
        '<img class="install-icon" src="' + BASE + '/assets/icons/icon-192.png" alt="" width="42" height="42">' +
        '<div class="install-text"><strong>نصب اپ غریبی کیش</strong>' + barText(mode) + '</div>' +
        (mode === 'prompt' ? '<button type="button" class="install-go" id="install-go">نصب</button>' : '') +
        '<button type="button" class="install-close" id="install-close" aria-label="بستن">✕</button>';
      document.body.appendChild(bar);
      var go = document.getElementById('install-go');
      if (go) go.addEventListener('click', doInstall);
      document.getElementById('install-close').addEventListener('click', function () {
        store.set(KEY, String(Date.now()));
        removeBar();
      });
    }
    function doInstall() {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () {
        deferred = null;
        window.__bip = null;
        removeBar();
      });
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      setTimeout(function () { showBar('prompt', false); }, 4000);
    });
    window.addEventListener('appinstalled', function () {
      deferred = null;
      removeBar();
      if (box) box.style.display = 'none';
    });
    if (deferred) setTimeout(function () { showBar('prompt', false); }, 4000);   /* رویداد قبل از main.js آمده بود */
    if (isIOS && !inApp) setTimeout(function () { showBar('ios', false); }, 5000);

    /* دکمهٔ فوتر: اگر مرورگر اجازهٔ نصب مستقیم داده باشد نصب می‌کند، وگرنه راهنمای مناسب دستگاه را نشان می‌دهد */
    if (btn) {
      btn.addEventListener('click', function () {
        if (deferred) doInstall();
        else showBar(inApp ? 'inapp' : (isIOS ? 'ios' : 'manual'), true);
      });
    }
  })();

})();
