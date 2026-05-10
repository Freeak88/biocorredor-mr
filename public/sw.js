// FungiMap Service Worker — Offline-first PWA
const CACHE_VERSION = 'v4';
const STATIC_CACHE = `fungimap-static-${CACHE_VERSION}`;
const TILE_CACHE = `fungimap-tiles-${CACHE_VERSION}`;
const API_CACHE = `fungimap-api-${CACHE_VERSION}`;

const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
];
const API_HOSTS = ['generativelanguage.googleapis.com'];
const PB_PATHS = ['/api/', '/_/'];
const STATIC_EXTS = /\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|ico|webp)$/;

// — Install: pre-cache shell —
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(['/', '/index.html', '/offline.html']))
      .then(() => self.skipWaiting()),
  );
});

// — Activate: purge old caches —
self.addEventListener('activate', (event) => {
  const keep = new Set([STATIC_CACHE, TILE_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n.startsWith('fungimap-') && !keep.has(n)).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim()),
  );
});

// — Fetch router —
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Map tiles → stale-while-revalidate
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(staleWhileRevalidate(request, TILE_CACHE, 30 * 24 * 60 * 60));
    return;
  }

  // API → network-first
  if (API_HOSTS.some((h) => url.hostname.includes(h))) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // PocketBase API → network-first (never cache)
  if (PB_PATHS.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Static assets → cache-first (hashed filenames only)
  if (STATIC_EXTS.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML navigation → network-first (always fresh shell)
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }
});

// ——— Strategies ———

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    if (request.mode === 'navigate') {
      return (await caches.match('/offline.html')) || new Response('Offline', { status: 503 });
    }
    return new Response('', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request);
    return hit || new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);

  const refresh = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => hit);

  if (hit) return hit;
  return refresh;
}

// — Background sync —
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sightings') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) =>
        clients.forEach((c) => c.postMessage({ type: 'SYNC_COMPLETE' }))
      ),
    );
  }
});

// — Push —
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'FungiMap', {
      body: data.body || 'Nueva actividad en el Atlas',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: data.tag || 'fungimap',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});
