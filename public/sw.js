// FungiMap Service Worker — EMERGENCY CACHE CLEAR v5
// This SW unregisters itself and clears all caches immediately

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => {
          if (client instanceof WindowClient) {
            client.navigate(client.url);
          }
        });
      })
      .then(() => self.caches.keys())
      .then((cacheNames) => Promise.all(
        cacheNames.map((cacheName) => self.caches.delete(cacheName))
      ))
  );
});

// Do not intercept any requests — pass through
self.addEventListener('fetch', (event) => {
  // No caching, just pass through
});
