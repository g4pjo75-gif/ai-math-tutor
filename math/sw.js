const CACHE_NAME = 'amt-cache-v3.1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './state.js',
  './theme-ui.js',
  './history.js',
  './similar.js',
  './quiz.js',
  './quiz-result.js',
  './init.js',
  './settings.js',
  './upload.js',
  './schema.js',
  './api-solve.js',
  './render.js',
  './simplify.js',
  './voice.js',
  './ui-status.js',
  './visual.js',
  './visual-graph.js',
  './visual-numberline.js',
  './chat-step.js',
  './chat-overall.js',
  './actions-map.js',
  './main.js',
  '../shared/actions.js',
  '../shared/storage.js',
  '../shared/core.js',
  '../shared/speech.js',
  '../shared/ui.js',
  '../shared/ui.css'
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
