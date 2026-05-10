// FungiMap Service Worker v5 — Passthrough, no caching
// This SW does NOT cache anything. It simply passes through all requests.
// This prevents stale app versions from being served.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Clear any old caches that might exist
  event.waitUntil(
    self.caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.map((n) => self.caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Pass-through: do not intercept or cache any requests
self.addEventListener('fetch', (event) => {
  // Let the browser handle all requests normally
});
