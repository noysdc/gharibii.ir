/* extra.js — رفتارهای اضافه (بعد از main.js لود می‌شود) */
(function () {
  'use strict';

  /* در صفحهٔ اصلی، دکمه‌های دستهٔ بالا (و نوار پایین موبایل) به باکس همان دسته می‌روند.
     در بقیهٔ صفحه‌ها یا وقتی باکسی نباشد، لینک عادی (صفحهٔ دسته) باز می‌شود. */
  var sections = document.querySelectorAll('.cat-section[id^="cat-"]');
  if (!sections.length) return;

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
