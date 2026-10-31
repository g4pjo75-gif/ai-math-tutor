const CACHE_NAME = 'amt-cache-v3.4';
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
  './tailwind.config.js',
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
    // HTTP キャッシュを迂回して常に最新ファイルを事前キャッシュ
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) =>
        fetch(new Request(url, { cache: 'reload' }))
          .then((res) => (res && res.ok ? cache.put(url, res) : null))
          .catch(() => null)
      ))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('amt-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // ESM importにはクエリバージョンがなくHTTPキャッシュが古い版を返す可能性がある
  // same-origin GET（ナビゲーション除外）はキャッシュを迂回し、オフラインはcatchでキャッシュにフォールバック
  const sameOrigin = new URL(event.request.url).origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';
  const request = (sameOrigin && !isNavigation)
    ? new Request(event.request, { cache: 'no-store' })
    : event.request;

  event.respondWith(
    fetch(request)
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
