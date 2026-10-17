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
    return fetch('/search.json')
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
        '<small>' + (p.price ? p.price.toLocaleString('fa-IR') + ' \u062A\u0648\u0645\u0627\u0646' : '') +
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
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', floatingCartHtml);

    // ۵. آپدیت رابط کاربری سبد
    const updateCartUI = () => {
        const badge = document.getElementById('cart-badge');
        const container = document.getElementById('cart-items-container');
        
        if (badge) badge.textContent = cart.length;
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
        }
        
        // حذف آیتم
        if (e.target.closest('.cart-item-remove')) {
            const index = parseInt(e.target.closest('.cart-item-remove').dataset.index);
            cart.splice(index, 1);
            saveCart();
        }
    });

    // ۷. ارسال به واتساپ
    const checkoutBtn = document.getElementById('cart-checkout');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (cart.length === 0) return alert('سبد خرید خالی است!');

            const phone = "989347688356"; // شماره واتساپ اول
            let message = "سلام، من این محصولات را سفارش می‌دهم:\n\n";
            
            cart.forEach((item, i) => {
                message += `${i+1}. ${item.title}\n`;
                message += `قیمت: ${item.price} تومان\n`;
                message += `لینک: https://gharibii.ir${item.url}\n\n`;
            });

            const encodedMsg = encodeURIComponent(message);
            window.open(`https://wa.me/${phone}?text=${encodedMsg}`, '_blank');
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

})();