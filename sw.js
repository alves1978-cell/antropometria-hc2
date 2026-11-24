const CACHE_NAME = 'hc2-antropo-v2.1.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './api.js',
  './dashboard.js',
  './panels_extra.js',
  './report.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Nunca faz cache de chamadas à API do Google ou login
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('oauth2.googleapis.com')
  ) {
    return;
  }

  // Network-first para o app shell (garante atualizações instantâneas; fallback offline via cache)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
  }
});
