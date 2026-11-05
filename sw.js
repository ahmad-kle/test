/* متجر الكردي للزينة — Service Worker
   - يتجاهل لوحة الإدارة وكل الطلبات الخارجية (Firebase/Cloudinary/CDN) فلا يتدخل في منطق المتجر.
   - الصفحات والملفات: الشبكة أولاً مع بديل من الذاكرة، وصفحة offline.html عند انقطاع الاتصال. */
const VERSION = 'alkurdi-v1.2.0';
const SHELL = VERSION + '-shell';
const IMAGES = VERSION + '-img';
const PRECACHE = [
  './offline.html', './manifest.webmanifest',
  './assets/img/kurdi-logo.webp', './assets/img/kurdi-badge.webp', './assets/img/kurdi-icon.png',
  './assets/img/kurdi-icon-192.png', './assets/img/kurdi-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))));
});
self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.registration.navigationPreload && self.registration.navigationPreload.enable().catch(() => {}))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request, cacheName, timeoutMs) {
  return new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(request, { ignoreSearch: true }).then(hit => hit || null);
    const timer = setTimeout(() => {
      fallback().then(hit => { if (hit && !done) { done = true; resolve(hit); } });
    }, timeoutMs);
    fetch(request).then(res => {
      clearTimeout(timer);
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone(); caches.open(cacheName).then(c => c.put(request, copy)).catch(() => {});
      }
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      fallback().then(hit => { if (!done) { done = true; resolve(hit || Response.error()); } });
    });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Firebase / Cloudinary / CDN
  if (url.pathname.indexOf('/secure-') !== -1) return;        // لوحة الإدارة: لا تخزين
  if (url.pathname.endsWith('/sw.js')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      networkFirst(req, SHELL, 4500).then(res =>
        (res && res.type !== 'error') ? res : caches.match('./offline.html'))
    );
    return;
  }
  if (req.destination === 'image' || req.destination === 'font') {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(IMAGES).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    })));
    return;
  }
  event.respondWith(networkFirst(req, SHELL, 4000).then(res => res || Response.error()));
});
