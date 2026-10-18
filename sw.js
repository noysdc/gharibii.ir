---
layout: null
permalink: /sw.js
sitemap: false
---
/* سرویس‌ورکر فروشگاه غریبی کیش
   - با هر بیلد جدید سایت، VERSION عوض می‌شود و کش قدیمی خودکار پاک می‌شود
   - صفحه‌ها: اول شبکه (تا قیمت‌ها همیشه تازه باشد)، اگر اینترنت نبود کش، و در نهایت صفحهٔ آفلاین
   - CSS/JS/فونت: کش‌شده را بده و در پس‌زمینه تازه کن */
const VERSION = 'gharibii-{{ site.time | date: "%Y%m%d%H%M%S" }}';
const BASE = '{{ site.baseurl }}';
const SHELL = [
  BASE + '/',
  BASE + '/offline/',
  BASE + '/assets/css/style.css',
  BASE + '/assets/js/main.js',
  BASE + '/assets/js/gallery.js',
  BASE + '/assets/icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(BASE + '/offline/')))
    );
    return;
  }

  const cacheable = ['style', 'script', 'font'].indexOf(req.destination) !== -1 ||
                    url.pathname.indexOf(BASE + '/assets/icons/') === 0;
  if (!cacheable) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
