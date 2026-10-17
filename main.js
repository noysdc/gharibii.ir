(function () {
  'use strict';

  var root = document.documentElement;

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
  applyTheme(localStorage.getItem('gharibii-theme') || 'light');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var c = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var n = c === 'dark' ? 'light' : 'dark';
      localStorage.setItem('gharibii-theme', n);
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
    localStorage.setItem('gharibii-font-scale', scale);
  }
  applyFontScale(parseFloat(localStorage.getItem('gharibii-font-scale')) || 1);

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
   ۶. سیستم سبد خرید و واتساپ
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('add-to-cart');
    const cartStatus = document.getElementById('cart-status');
    
    // ۱. دریافت سبد از حافظه مرورگر
    let cart = JSON.parse(localStorage.getItem('gharibii_cart')) || [];

    // ۲. تابع ذخیره سبد
    const saveCart = () => {
        localStorage.setItem('gharibii_cart', JSON.stringify(cart));
        updateCartUI();
    };

    // ۳. افزودن محصول به سبد
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const product = {
                title: addBtn.dataset.title,
                price: addBtn.dataset.price,
                image: addBtn.dataset.image,
                url: addBtn.dataset.url
            };
            
            // چک کن تکراری نباشه
            const exists = cart.find(item => item.title === product.title);
            if (!exists) {
                cart.push(product);
                saveCart();
                if (cartStatus) {
                    cartStatus.style.display = 'block';
                    setTimeout(() => cartStatus.style.display = 'none', 2000);
                }
            }
        });
    }

    // ۴. ساخت ظرف سبد شناور
    const floatingCartHtml = `
        <div class="floating-cart" id="floating-cart">
            🛒 <span class="cart-badge" id="cart-badge">0</span>
        </div>
        <div class="cart-modal" id="cart-modal">
            <div class="cart-content">
                <button class="cart-close" id="cart-close">✕</button>
                <h3 style="margin-top:0; text-align:center;">سبد خرید شما</h3>
                <div id="cart-items-container"></div>
                <button class="cart-checkout" id="cart-checkout">ارسال سفارش در واتساپ</button>
                <div class="wa-sellers cart-sellers" id="cart-sellers" hidden></div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', floatingCartHtml);

    // ۵. آپدیت رابط کاربری سبد
    const updateCartUI = () => {
        const badge = document.getElementById('cart-badge');
        const container = document.getElementById('cart-items-container');
        
        if (badge) badge.textContent = cart.length;
        const fc = document.getElementById('floating-cart');
        if (fc) fc.classList.toggle('has-items', cart.length > 0);
        if (!container) return;

        if (cart.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#777;">سبد خرید شما خالی است.</p>';
            return;
        }

        container.innerHTML = cart.map((item, index) => `
            <div class="cart-item">
                ${item.image ? `<img src="${item.image}" alt="${item.title}">` : ''}
                <div class="cart-item-info">
                    <h4>${item.title}</h4>
                    <span>${item.price} تومان</span>
                </div>
                <button class="cart-item-remove" data-index="${index}">🗑️</button>
            </div>
        `).join('');
    };

    updateCartUI(); // اجرای اولیه

    // ۶. باز و بسته کردن مودال
    document.addEventListener('click', (e) => {
        if (e.target.closest('#floating-cart')) {
            document.getElementById('cart-modal').classList.add('active');
        }
        if (e.target.closest('#cart-close') || e.target.classList.contains('cart-modal')) {
            document.getElementById('cart-modal').classList.remove('active');
            const sb = document.getElementById('cart-sellers'); if (sb) sb.hidden = true;
        }
        
        // حذف آیتم
        if (e.target.closest('.cart-item-remove')) {
            const index = parseInt(e.target.closest('.cart-item-remove').dataset.index);
            cart.splice(index, 1);
            saveCart();
        }
    });

    // ۷. ارسال به واتساپ (انتخاب فروشنده با عکس)
    let sellers = [];
    try {
        const el = document.getElementById('wa-sellers-data');
        sellers = el ? JSON.parse(el.textContent) : [];
    } catch (err) { sellers = []; }
    if (!sellers.length) sellers = [{ name: 'فروشنده', number: '989347688356', photo: '' }];

    const sellersBox = document.getElementById('cart-sellers');
    const checkoutBtn = document.getElementById('cart-checkout');

    const buildMessage = () => {
        let message = "سلام، من این محصولات را سفارش می‌دهم:\n\n";
        cart.forEach((item, i) => {
            message += `${i+1}. ${item.title}\n`;
            message += `قیمت: ${item.price} تومان\n`;
            message += `لینک: ${location.origin}${item.url}\n\n`;
        });
        return message;
    };
    const openWhatsApp = (number) => {
        window.open(`https://wa.me/${number}?text=${encodeURIComponent(buildMessage())}`, '_blank');
    };
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const renderSellers = () => {
        if (!sellersBox) return;
        sellersBox.innerHTML = sellers.map((s, i) => `
            <button type="button" class="wa-seller" data-i="${i}">
                <span class="wa-avatar">${s.photo ? `<img src="${esc(s.photo)}" alt="" width="160" height="160" onerror="this.remove()">` : ''}</span>
                <span class="wa-seller-info"><strong>${esc(s.name)}</strong><small>ارسال سفارش</small></span>
            </button>`).join('');
    };

    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (cart.length === 0) return alert('سبد خرید خالی است!');
            if (sellers.length === 1 || !sellersBox) return openWhatsApp(sellers[0].number);
            if (sellersBox.hidden) renderSellers();
            sellersBox.hidden = !sellersBox.hidden;
        });
    }
    if (sellersBox) {
        sellersBox.addEventListener('click', (e) => {
            const btn = e.target.closest('.wa-seller');
            if (!btn) return;
            const s = sellers[parseInt(btn.dataset.i, 10)];
            if (s) openWhatsApp(s.number);
        });
    }
});
// ============================================
// باز و بسته کردن منوی واتساپ
// ============================================
const waBtn = document.getElementById('open-wa-menu');
const waMenu = document.getElementById('wa-menu');

if (waBtn && waMenu) {
    waBtn.addEventListener('click', function() {
        if (waMenu.style.display === 'none') {
            waMenu.style.display = 'block';
        } else {
            waMenu.style.display = 'none';
        }
    });
}


  /* ---- 7. Card sliders (cover images) ---- */
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


  /* ---- 8. Thumbnails slider (product page) ---- */
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
        var pos = Math.abs(strip.scrollLeft);          /* RTL-safe */
        if (prev) prev.classList.toggle('is-off', pos >= max - 2);   /* left handle */
        if (next) next.classList.toggle('is-off', pos <= 2);         /* right handle */
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

      /* drag with mouse */
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

      /* keep the chosen thumbnail in view */
      strip.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.scrollIntoView) btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        });
      });
    });
  })();


  /* ---- 9. Category menu: single row, swipe + left/right handles ---- */
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
      var pos = Math.abs(nav.scrollLeft);           /* RTL-safe */
      var atStart = pos <= 2;                        /* right edge in RTL */
      var atEnd = pos >= max - 2;                    /* left edge in RTL  */
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


  /* ---- 10. PWA: service worker + install prompt ---- */
  (function initPWA() {
    var meta = document.querySelector('meta[name="site-baseurl"]');
    var base = meta ? meta.getAttribute('content') : '';
    var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if ('serviceWorker' in navigator && secure) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register(base + '/sw.js', { scope: base + '/' }).catch(function () {});
      });
    }

    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                     window.navigator.standalone === true;
    if (standalone) return;                       /* قبلاً نصب شده */

    var ua = navigator.userAgent || '';
    var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios|chrome|android/i.test(ua);
    var KEY = 'gharibii-install-dismissed';
    var deferred = null;
    var link = document.getElementById('install-link');

    function dismissedRecently() {
      try {
        var t = parseInt(localStorage.getItem(KEY) || '0', 10);
        return t && (Date.now() - t) < 14 * 86400000;
      } catch (e) { return false; }
    }
    function removeBar() {
      var b = document.getElementById('install-bar');
      if (b) b.remove();
    }
    function showBar(mode, force) {
      if (document.getElementById('install-bar')) return;
      if (!force && (dismissedRecently() || !window.matchMedia('(max-width: 900px)').matches)) return;
      var bar = document.createElement('div');
      bar.className = 'install-bar';
      bar.id = 'install-bar';
      var text = mode === 'ios'
        ? 'دکمه اشتراک‌گذاری (Share) را بزنید و «Add to Home Screen» را انتخاب کنید.'
        : 'مثل یک اپلیکیشن روی گوشی‌تان باشد؛ سریع‌تر و راحت‌تر.';
      bar.innerHTML =
        '<img class="install-icon" src="' + base + '/assets/icons/icon-192.png" alt="" width="42" height="42">' +
        '<div class="install-text"><strong>نصب اپ غریبی کیش</strong>' + text + '</div>' +
        (mode === 'ios' ? '' : '<button type="button" class="install-go" id="install-go">نصب</button>') +
        '<button type="button" class="install-close" id="install-close" aria-label="بستن">✕</button>';
      document.body.appendChild(bar);

      var go = document.getElementById('install-go');
      if (go) go.addEventListener('click', doInstall);
      document.getElementById('install-close').addEventListener('click', function () {
        try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
        removeBar();
      });
    }
    function doInstall() {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () {
        deferred = null;
        removeBar();
        if (link) link.hidden = true;
      });
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      if (link) link.hidden = false;
      setTimeout(function () { showBar('prompt', false); }, 4000);
    });
    window.addEventListener('appinstalled', function () {
      deferred = null; removeBar();
      if (link) link.hidden = true;
    });

    if (isIOS && isSafari) {
      if (link) link.hidden = false;
      setTimeout(function () { showBar('ios', false); }, 5000);
    }
    if (link) {
      link.addEventListener('click', function () {
        if (deferred) doInstall();
        else showBar(isIOS ? 'ios' : 'prompt', true);
      });
    }
  })();

})();