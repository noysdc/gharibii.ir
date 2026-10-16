(function () {
  'use strict';
  const root = document.documentElement;

  /* ---- ۱. حالت شب و روز ---- */
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = themeToggle ? themeToggle.querySelector('.theme-icon') : null;
  function applyTheme(theme) {
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
      if (themeIcon) themeIcon.textContent = '☀️';
    } else {
      root.removeAttribute('data-theme');
      if (themeIcon) themeIcon.textContent = '🌙';
    }
  }
  applyTheme(localStorage.getItem('gharibii-theme') || 'light');
  if (themeToggle) themeToggle.addEventListener('click', function () {
    const c = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const n = c === 'dark' ? 'light' : 'dark';
    localStorage.setItem('gharibii-theme', n);
    applyTheme(n);
  });

  /* ---- ۲. تنظیم اندازه فونت (A- / A+) ---- */
  const FONT_MIN = 0.85, FONT_MAX = 1.5, FONT_STEP = 0.1;
  const fontDec = document.getElementById('font-decrease');
  const fontInc = document.getElementById('font-increase');
  function applyFontScale(scale) {
    scale = Math.max(FONT_MIN, Math.min(FONT_MAX, scale));
    root.style.setProperty('--font-scale', scale);
    localStorage.setItem('gharibii-font-scale', scale);
  }
  applyFontScale(parseFloat(localStorage.getItem('gharibii-font-scale')) || 1);
  function getScale() { return parseFloat(root.style.getPropertyValue('--font-scale')) || 1; }
  if (fontInc) fontInc.addEventListener('click', function () { applyFontScale(getScale() + FONT_STEP); });
  if (fontDec) fontDec.addEventListener('click', function () { applyFontScale(getScale() - FONT_STEP); });

  /* ---- ۳. گالری محصول ---- */
  const mainImg = document.getElementById('main-img');
  const thumbs = document.querySelectorAll('.thumbs button');
  if (mainImg && thumbs.length) {
    thumbs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const src = btn.getAttribute('data-src');
        if (src) mainImg.src = src;
        thumbs.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  /* ---- ۴. نوار قفل‌شونده (فقط sticky-bar) ---- */
  const stickyBar = document.getElementById('sticky-bar');
  if (stickyBar) {
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;pointer-events:none;';
    stickyBar.parentNode.insertBefore(sentinel, stickyBar);
    const obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        stickyBar.classList.toggle('is-stuck', !e.isIntersecting);
      });
    }, { threshold: [1] });
    obs.observe(sentinel);
  }

  /* ---- ۵. جستجوی محصولات ---- */
  const searchInput = document.getElementById('site-search');
  const searchResults = document.getElementById('search-results');
  let productsIndex = null;
  async function loadProducts() {
    if (productsIndex) return productsIndex;
    try {
      const res = await fetch('/search.json');
      productsIndex = await res.json();
    } catch (e) { productsIndex = []; }
    return productsIndex;
  }
  function normalize(str) {
    return (str || '').toString().toLowerCase()
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
      .replace(/[\u064B-\u065F\u0670]/g, '').trim();
  }
  function renderResults(list) {
    if (!searchResults) return;
    if (!list.length) {
      searchResults.innerHTML = '<div class="search-empty">محصولی یافت نشد</div>';
      searchResults.hidden = false; return;
    }
    searchResults.innerHTML = list.slice(0, 8).map(function (p) {
      const img = p.image ? '<img src="' + p.image + '" alt="" loading="lazy">' : '';
      return '<a class="search-item" href="' + p.url + '">' + img +
        '<span class="search-item-info"><strong>' + p.title + '</strong>' +
        '<small>' + (p.price ? p.price.toLocaleString('fa-IR') + ' تومان' : '') +
        '</small></span></a>';
    }).join('');
    searchResults.hidden = false;
  }
  if (searchInput && searchResults) {
    let timer = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(async function () {
        const q = normalize(searchInput.value);
        if (q.length < 2) { searchResults.hidden = true; return; }
        const products = await loadProducts();
        const matched = products.filter(function (p) {
          return normalize(p.title).includes(q) || normalize(p.category).includes(q);
        });
        renderResults(matched);
      }, 150);
    });
    document.addEventListener('click', function (e) {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.hidden = true;
      }
    });
  }
})();