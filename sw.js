const CACHE_NAME = 'amt-cache-v2.4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './shared/storage.js',
  './shared/core.js',
  './shared/speech.js',
  './shared/ui.js',
  './shared/ui.css'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('amt-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first strategy: 常に最新を取得し、オフライン時のみキャッシュから返す
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 英語アプリは英語SWに任せる（数学SWではキャッシュ・介入しない）
  const englishPrefix = new URL('english/', self.registration.scope).pathname;
  if (url.origin === self.location.origin && url.pathname.startsWith(englishPrefix)) {
    return; // respondWithを呼ばず、ブラウザ/英語SWにフォールスルー
  }

  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
