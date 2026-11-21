/* ==========================================================================
   sw.js — permite instalar NimbookGR y usarla sin conexión.
   Estrategia: primero la red (para recibir siempre los cambios) y, si no
   hay conexión, lo último guardado en caché.
   ========================================================================== */

const CACHE = 'nimbookgr-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/app.css',
  './css/pages.css',
  './js/app.js',
  './assets/logo/nimbook-logo-192.png',
  './assets/logo/nimbook-logo-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isDocument(request, url) {
  return request.mode === 'navigate'
    || url.pathname.endsWith('/')
    || url.pathname.endsWith('index.html');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;   // fotos y datos van directo a la red

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (isDocument(request, url)) {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
