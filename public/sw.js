/* game.it — service worker: carga instantánea en visitas repetidas y juegos cacheados al jugarlos. */
const VERSION = 'v1';
const CACHE = `gameit-${VERSION}`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gameit-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com';
  if (!sameOrigin && !fonts) return; // juegos externos / APIs online: sin intervenir

  // Páginas: red primero (siempre la versión nueva), caché si no hay conexión.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => put(req, r)).catch(() => caches.match(req).then((r) => r || caches.match('/'))));
    return;
  }

  // Archivos con hash (/assets/*) y fuentes: inmutables, caché primero.
  if (url.pathname.startsWith('/assets/') || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => put(req, r))));
    return;
  }

  // Resto (juegos, SDK, miniaturas): respuesta inmediata desde caché y actualización en segundo plano.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((r) => put(req, r))
        .catch(() => hit);
      return hit || net;
    }),
  );
});
