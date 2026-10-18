(function () {
  'use strict';

  var root = document.documentElement;

  /* ============================================
     1. Theme (حالت شب)
     ============================================ */
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
  applyTheme(localStorage.getItem('gharibii-theme') || 'light');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var c = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var n = c === 'dark' ? 'light' : 'dark';
      localStorage.setItem('gharibii-theme', n);
      applyTheme(n);
    });
  }

  /* ============================================
     2. Font Scale
     ============================================ */
  var FONT_MIN = 0.85, FONT_MAX = 1.5, FONT_STEP = 0.1;
  var fontDec = document.getElementById('font-decrease');
  var fontInc = document.getElementById('font-increase');

  function applyFontScale(scale) {
    scale = Math.max(FONT_MIN, Math.min(FONT_MAX, scale));
    root.style.setProperty('--font-scale', scale);
    localStorage.setItem('gharibii-font-scale', scale);
  }
  applyFontScale(parseFloat(localStorage.getItem('gharibii-font-scale')) || 1);

  function getScale() {
    return parseFloat(root.style.getPropertyValue('--font-scale')) || 1;
  }
  if (fontInc) fontInc.addEventListener('click', function () { applyFontScale(getScale() + FONT_STEP); });
  if (fontDec) fontDec.addEventListener('click', function () { applyFontScale(getScale() - FONT_STEP); });

  /* ============================================
     3. Product Gallery
     ============================================ */
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

  /* ============================================
     4. Sticky Bar
     ============================================ */
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

  /* ============================================
     5. Search
     ============================================ */
  var searchInput = document.getElementById('site-search');
  var searchResults = document.getElementById('search-results');
  var productsIndex = null;

  function loadProducts() {
    if (productsIndex) return Promise.resolve(productsIndex);
    var meta = document.querySelector('meta[name="site-baseurl"]');
    var base = meta ? meta.getAttribute('content') : '';
    return fetch(base + '/search.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { productsIndex = data; return data; })
      .catch(function () { productsIndex = []; return []; });
  }

  function normalize(str) {
    return (str || '').toString().toLowerCase()
      .replace(/\u064A/g, '\u06CC')
      .replace(/\u0643/g, '\u06A9')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .trim();
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
      return '<a class="search-item" href="' + p.url + '">' + img +
        '<span class="search-item-info"><strong>' + p.title + '</strong>' +
        '<small>' + (Number(String(p.price).replace(/,/g, '')) > 0 ? Number(String(p.price).replace(/,/g, '')).toLocaleString('fa-IR') + ' \u062A\u0648\u0645\u0627\u0646' : '') +
        '</small></span></a>';
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
          var matched = products.filter(function (p) {
            return normalize(p.title).indexOf(q) !== -1 || normalize(p.category).indexOf(q) !== -1;
          });
          renderResults(matched);
        });
      }, 150);
    });
    document.addEventListener('click', function (e) {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.hidden = true;
      }
    });
  }

  /* ============================================
     6. Welcome Toast
     ============================================ */
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
    if (sessionStorage.getItem('gharibii-welcome-shown')) return;
    toastText.textContent = '\u0628\u0647 \u0641\u0631\u0648\u0634\u06AF\u0627\u0647 \u0622\u0646\u0644\u0627\u06CC\u0646 \u063A\u0631\u06CC\u0628\u06CC \u062E\u0648\u0634 \u0627\u0648\u0645\u062F\u06CC\u062F';
    setTimeout(function () {
      toast.hidden = false;
      requestAnimationFrame(function () { toast.classList.add('is-visible'); });
      sessionStorage.setItem('gharibii-welcome-shown', '1');
    }, 1500);
    setTimeout(hideWelcomeToast, 6000);
  }
  if (toastClose) toastClose.addEventListener('click', hideWelcomeToast);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showWelcomeToast);
  } else {
    showWelcomeToast();
  }

  /* ============================================
     7. سبد خرید + واتساپ (نهایی)
     ============================================ */
  var cart = JSON.parse(localStorage.getItem('gharibii_cart')) || [];

  // فرمت قیمت با کاما (فارسی)
  function fmtPrice(num) {
    var n = Number(String(num).replace(/,/g, '')) || 0;
    if (n === 0) return 'تماس بگیرید';
    return n.toLocaleString('fa-IR');
  }

  function saveCart() {
    localStorage.setItem('gharibii_cart', JSON.stringify(cart));
    updateCartUI();
  }

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
    t._timer = setTimeout(function () {
      t.classList.remove('show');
    }, 2200);
  }

  function bindAddToCartButtons() {
    var buttons = document.querySelectorAll('.add-to-cart-btn');
    buttons.forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        var product = {
          title: btn.dataset.title,
          price: btn.dataset.price,
          image: btn.dataset.image,
          url: btn.dataset.url
        };

        var exists = cart.find(function (i) { return i.title === product.title; });
        if (exists) {
          showMiniToast('این محصول قبلاً در سبد شماست ⚠️');
          return;
        }

        cart.push(product);
        saveCart();

        btn.classList.add('is-added');
        var original = btn.innerHTML;
        btn.innerHTML = '✅ اضافه شد';
        setTimeout(function () {
          btn.classList.remove('is-added');
          btn.innerHTML = original;
        }, 1500);

        showMiniToast('محصول به سبد خرید اضافه شد 🛒');
      });
    });
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
          <button class="cart-checkout" id="cart-checkout" type="button">ارسال سفارش در واتساپ</button>
          <div class="wa-sellers cart-sellers" id="cart-sellers" hidden></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function updateCartUI() {
    var badge = document.getElementById('cart-badge');
    var container = document.getElementById('cart-items-container');
    var fc = document.getElementById('floating-cart');
    if (badge) badge.textContent = cart.length;
    if (fc) fc.classList.toggle('has-items', cart.length > 0);
    if (!container) return;

    if (cart.length === 0) {
      container.innerHTML = '<p style="text-align:center; color:#777;">سبد خرید شما خالی است.</p>';
      return;
    }
    container.innerHTML = cart.map(function (item, index) {
      return `
        <div class="cart-item">
          ${item.image ? `<img src="${item.image}" alt="${item.title}">` : ''}
          <div class="cart-item-info">
            <h4>${item.title}</h4>
            <span>${fmtPrice(item.price)} تومان</span>
          </div>
          <button class="cart-item-remove" data-index="${index}" type="button" aria-label="حذف">🗑️</button>
        </div>
      `;
    }).join('');
  }

  var sellers = [];
  try {
    var el = document.getElementById('wa-sellers-data');
    sellers = el ? JSON.parse(el.textContent) : [];
  } catch (err) { sellers = []; }
  if (!sellers.length) sellers = [{ name: 'فروشنده', number: '989347688356', photo: '' }];

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function buildMessage() {
    var message = "سلام، من این محصولات را از فروشگاه غریبی کیش سفارش می‌دهم:\n\n";
    var total = 0;
    cart.forEach(function (item, i) {
      var p = Number(String(item.price).replace(/,/g, '')) || 0;
      total += p;
      message += (i + 1) + ". " + item.title + "\n";
      message += "   💰 قیمت: " + (p > 0 ? p.toLocaleString('fa-IR') + ' تومان' : 'تماس بگیرید') + "\n";
      message += "   🔗 " + location.origin + item.url + "\n\n";
    });
    if (total > 0) {
      message += "━━━━━━━━━━━━━━\n";
      message += "🧾 جمع کل: " + total.toLocaleString('fa-IR') + " تومان\n\n";
    }
    message += "لطفاً برای نهایی‌سازی و هماهنگی ارسال (سایز، رنگ، آدرس) راهنمایی‌ام کنید. 🙏";
    return message;
  }

  function openWhatsApp(number) {
    window.open("https://wa.me/" + number + "?text=" + encodeURIComponent(buildMessage()), '_blank');
  }

  function renderSellers() {
    var box = document.getElementById('cart-sellers');
    if (!box) return;
    box.innerHTML = sellers.map(function (s, i) {
      return `
        <button type="button" class="wa-seller" data-i="${i}">
          <span class="wa-avatar">${s.photo ? `<img src="${esc(s.photo)}" alt="" width="160" height="160" onerror="this.remove()">` : ''}</span>
          <span class="wa-seller-info"><strong>${esc(s.name)}</strong><small>ارسال سفارش</small></span>
        </button>`;
    }).join('');
  }

  function initCart() {
    ensureCartShell();
    bindAddToCartButtons();
    updateCartUI();

    document.addEventListener('click', function (e) {
      if (e.target.closest('#floating-cart')) {
        document.getElementById('cart-modal').classList.add('active');
      }
      if (e.target.closest('#cart-close') || e.target.classList.contains('cart-modal')) {
        document.getElementById('cart-modal').classList.remove('active');
        var sb = document.getElementById('cart-sellers'); if (sb) sb.hidden = true;
      }
      if (e.target.closest('.cart-item-remove')) {
        var index = parseInt(e.target.closest('.cart-item-remove').dataset.index, 10);
        cart.splice(index, 1);
        saveCart();
      }
      if (e.target.closest('#cart-checkout')) {
        if (cart.length === 0) { showMiniToast('سبد خرید خالی است!'); return; }
        var box = document.getElementById('cart-sellers');
        if (sellers.length === 1) { openWhatsApp(sellers[0].number); return; }
        if (box) {
          if (box.hidden) renderSellers();
          box.hidden = !box.hidden;
        }
      }
      if (e.target.closest('#cart-sellers .wa-seller')) {
        var btn = e.target.closest('#cart-sellers .wa-seller');
        var s = sellers[parseInt(btn.dataset.i, 10)];
        if (s) openWhatsApp(s.number);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCart);
  } else {
    initCart();
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(bindAddToCartButtons, 500);
  });

  /* ============================================
     8. Card Sliders
     ============================================ */
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

      function mark() {
        dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); });
      }
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
      function startAuto() {
        if (reduce || timer || !visible) return;
        timer = setInterval(function () { if (!hold) go(idx + 1); }, 3200 + Math.random() * 1500);
      }
      function bind(btn, step) {
        if (!btn) return;
        btn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          go(idx + step);
        });
      }
      bind(prev, -1);
      bind(next, 1);
      card.addEventListener('mouseenter', function () { hold = true; });
      card.addEventListener('mouseleave', function () { hold = false; });
      card.addEventListener('focusin', function () { hold = true; });
      card.addEventListener('focusout', function () { hold = false; });
      card.addEventListener('touchstart', function () {
        hold = true;
        clearTimeout(card._resume);
        card._resume = setTimeout(function () { hold = false; }, 6000);
      }, { passive: true });

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          visible = entries[0].isIntersecting;
          if (visible) startAuto(); else stopAuto();
        }, { threshold: 0.35 }).observe(card);
      } else {
        visible = true; startAuto();
      }
    });
  })();

  /* ============================================
     9. Thumbnails Slider
     ============================================ */
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

      function page(dir) {
        strip.scrollBy({ left: dir * strip.clientWidth * 0.8, behavior: 'smooth' });
      }
      if (prev) prev.addEventListener('click', function () { page(-1); });
      if (next) next.addEventListener('click', function () { page(1); });

      var down = false, moved = false, startX = 0, startLeft = 0;
      strip.addEventListener('mousedown', function (e) {
        down = true; moved = false; startX = e.clientX; startLeft = strip.scrollLeft;
      });
      window.addEventListener('mousemove', function (e) {
        if (!down) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 5) { moved = true; strip.classList.add('is-dragging'); }
        if (moved) strip.scrollLeft = startLeft - dx;
      });
      window.addEventListener('mouseup', function () {
        if (!down) return;
        down = false;
        strip.classList.remove('is-dragging');
      });
      strip.addEventListener('click', function (e) {
        if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
      }, true);

      strip.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.scrollIntoView) btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        });
      });
    });
  })();

  /* ============================================
     10. Category Nav
     ============================================ */
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

    function step(dir) {
      nav.scrollBy({ left: dir * Math.max(nav.clientWidth * 0.7, 120), behavior: 'smooth' });
    }
    if (left) left.addEventListener('click', function () { step(-1); });
    if (right) right.addEventListener('click', function () { step(1); });

    var cur = nav.querySelector('[aria-current="page"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
    update();
  })();

})();