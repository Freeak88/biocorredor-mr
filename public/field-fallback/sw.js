const CACHE = 'biocorredor-field-fallback-v2';
const ASSETS = ['/field-fallback/', '/field-fallback/index.html', '/field-fallback/fallback.js', '/field-fallback/fallback.css', '/field-fallback/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('biocorredor-field-fallback-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(fetch(request).catch(() => caches.match('/field-fallback/index.html')));
    return;
  }

  if (!['script', 'style', 'worker', 'manifest'].includes(request.destination)) return;
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (!response.ok) throw new Error(`Asset unavailable: ${request.url}`);
      const contentType = response.headers.get('content-type') || '';
      if (request.destination === 'script' && !contentType.includes('javascript')) throw new Error(`Invalid MIME for script: ${contentType}`);
      if (request.destination === 'style' && !contentType.includes('css')) throw new Error(`Invalid MIME for style: ${contentType}`);
      return response;
    });
  }));
});
