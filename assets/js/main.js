(function () {
  'use strict';

  /* ---- ۱. حالت شب و روز ---- */
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = themeToggle ? themeToggle.querySelector('.theme-icon') : null;
  const root = document.documentElement;

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
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('gharibii-theme', next);
      applyTheme(next);
    });
  }

  /* ---- ۲. تنظیم اندازه فونت ---- */
  const fontToggle = document.getElementById('font-toggle');
  const sizes = ['normal', 'large', 'xlarge'];
  const sizeLabels = { normal: 'Aa', large: 'A+', xlarge: 'A++' };

  function applyFontSize(size) {
    root.setAttribute('data-font', size);
    if (fontToggle) {
      const icon = fontToggle.querySelector('.ctrl-icon');
      if (icon) icon.textContent = sizeLabels[size] || 'Aa';
    }
  }
  applyFontSize(localStorage.getItem('gharibii-font') || 'normal');
  if (fontToggle) {
    fontToggle.addEventListener('click', function () {
      const current = root.getAttribute('data-font') || 'normal';
      const idx = sizes.indexOf(current);
      const next = sizes[(idx + 1) % sizes.length];
      localStorage.setItem('gharibii-font', next);
      applyFontSize(next);
    });
  }

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

  /* ---- ۴. کلاس is-stuck برای نوار چسبان ---- */
  const navBar = document.querySelector('.nav-bar');
  if (navBar) {
    const obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          navBar.classList.toggle('is-stuck', e.intersectionRatio < 1);
        });
      },
      { threshold: [1] }
    );
    // یک سنتینل بالای نوار برای تشخیص چسبیدن
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;';
    navBar.parentNode.insertBefore(sentinel, navBar);
    obs.observe(sentinel);
  }

})();