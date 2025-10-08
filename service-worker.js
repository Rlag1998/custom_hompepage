// Minimal offline cache for static assets (optional). Works on https/localhost.
const CACHE = 'home-v5-cache';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.webmanifest'
  // Optionally pre-cache icons:
  // './icons/google.png', './icons/docevent.png', './icons/ChatGpt.png',
  // './icons/Azure.png', './icons/Azure DevOps.png', './icons/sharepoint.png',
  // './icons/ebay.png', './icons/youtube.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : null))).then(self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        try {
          const url = new URL(req.url);
          if (url.origin === location.origin) {
            const copy = resp.clone();
            caches.open(CACHE).then(cache => cache.put(req, copy));
          }
        } catch {}
        return resp;
      }).catch(() => cached || Promise.reject());
    })
  );
});
