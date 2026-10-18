/* گالری اسلایدی صفحه اصلی: swipe، دکمه‌ها، نقطه‌ها، پخش خودکار */
(function () {
  var root = document.querySelector('[data-gslider]');
  if (!root) return;
  var track = root.querySelector('.gslides');
  var slides = Array.prototype.slice.call(track.querySelectorAll('.gslide'));
  var dotsBox = root.querySelector('.g-dots');
  var prev = root.querySelector('.g-prev');
  var next = root.querySelector('.g-next');
  if (!slides.length) return;

  var current = 0, timer = null, ticking = false;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var dots = slides.map(function (_, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'g-dot'; b.setAttribute('aria-label', 'تصویر ' + (i + 1));
    b.addEventListener('click', function () { go(i); restart(); });
    dotsBox.appendChild(b);
    return b;
  });
  dotsBox.removeAttribute('aria-hidden');

  function mark(i) {
    current = i;
    slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
    dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
  }

  // نزدیک‌ترین اسلاید به مرکز (مستقل از راست‌به‌چپ بودن)
  function nearest() {
    var r = track.getBoundingClientRect(), c = r.left + r.width / 2, best = 0, bd = Infinity;
    slides.forEach(function (s, i) {
      var sr = s.getBoundingClientRect(), d = Math.abs(sr.left + sr.width / 2 - c);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function go(i) {
    i = (i + slides.length) % slides.length;
    var r = track.getBoundingClientRect(), sr = slides[i].getBoundingClientRect();
    var delta = (sr.left + sr.width / 2) - (r.left + r.width / 2);
    track.scrollBy({ left: delta, behavior: reduce ? 'auto' : 'smooth' });
    mark(i);
  }

  track.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; mark(nearest()); });
  }, { passive: true });

  prev.addEventListener('click', function () { go(current - 1); restart(); });
  next.addEventListener('click', function () { go(current + 1); restart(); });
  track.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { go(current + 1); restart(); }
    if (e.key === 'ArrowRight') { go(current - 1); restart(); }
  });

  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function start() { if (reduce || slides.length < 2 || timer) return; timer = setInterval(function () { go(current + 1); }, 4500); }
  function restart() { stop(); start(); }

  ['pointerdown', 'touchstart', 'mouseenter', 'focusin'].forEach(function (ev) { root.addEventListener(ev, stop, { passive: true }); });
  ['mouseleave', 'focusout'].forEach(function (ev) { root.addEventListener(ev, start); });
  root.addEventListener('touchend', function () { setTimeout(start, 6000); }, { passive: true });
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });

  // فقط وقتی گالری دیده می‌شود پخش شود
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { en[0].isIntersecting ? start() : stop(); }, { threshold: 0.25 }).observe(root);
  } else { start(); }

  // شروع از اسلاید اول
  window.addEventListener('load', function () { go(0); });
  mark(0);
})();
