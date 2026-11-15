/**
 * Service worker — faz o app funcionar offline e ser instalável (PWA).
 *
 * Na instalação, guarda no aparelho todos os arquivos listados em sw-manifest.js
 * (gerado por tools/build-web.mjs). Depois responde do cache primeiro; quando uma
 * nova versão é publicada, o cache antigo é apagado.
 */
importScripts('sw-manifest.js');

const CACHE = 'pta-' + self.PTA_PRECACHE.version;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(self.PTA_PRECACHE.files)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pta-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((res) => {
      if (res.ok && new URL(event.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return res;
    }))
  );
});
