---
layout: null
sitemap: false
---
/* سرویس‌ورکر فروشگاه غریبی کیش — با تغییر VERSION کش قدیمی پاک می‌شود */
const VERSION = 'gharibii-v1';
const BASE = '{{ site.baseurl }}';
const SHELL = [
  BASE + '/',
  BASE + '/offline/',
  BASE + '/assets/css/style.css',
  BASE + '/assets/js/main.js',
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
  if (url.origin !== location.origin) return;               // فقط فایل‌های خود سایت

  // صفحات: اول شبکه، اگر نبود کش، در نهایت صفحه آفلاین
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(BASE + '/offline/')))
    );
    return;
  }

  // فایل‌های ثابت (CSS/JS/عکس/فونت): کش‌شده را بده و در پس‌زمینه تازه کن
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
