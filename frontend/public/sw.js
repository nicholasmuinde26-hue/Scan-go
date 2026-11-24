const CACHE_NAME = 'scango-v2'; // bumped from v1 to force update
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Add one by one so one missing file doesn't kill install
      for (const url of ASSETS_TO_CACHE) {
        try { await cache.add(url); } catch (e) { console.log('SW skip', url); }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 1. Only handle GET, ignore POST/PUT/DELETE
  if (event.request.method !== 'GET') return;

  // 2. Don't intercept API, SSE, or Render backend
  if (url.includes('/api/') || url.includes('onrender.com') || url.includes('events/stream')) {
    return;
  }

  // 3. Don't intercept chrome-extension etc
  if (!url.startsWith(self.location.origin)) return;

  event.respondWith(
    (async () => {
      // For pages like /app, /login - always go to network first, fallback to index.html
      if (event.request.mode === 'navigate') {
        try {
          const networkResponse = await fetch(event.request);
          return networkResponse;
        } catch (e) {
          const cached = await caches.match('/index.html');
          return cached || new Response('Offline', { status: 503 });
        }
      }

      // For JS/CSS/images - cache first, network fallback
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) return cachedResponse;

      try {
        return await fetch(event.request);
      } catch (e) {
        // FIX: Never return undefined
        return new Response('Offline', { status: 503 });
      }
    })()
  );
});