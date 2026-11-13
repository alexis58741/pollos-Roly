const CACHE_NAME = 'pollos-roly-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.add(OFFLINE_URL);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      return (await caches.match(OFFLINE_URL)) || new Response('<!doctype html><html lang="es"><meta charset="utf-8"><title>Sin conexión · Pollos Roly</title><body><h1>Sin conexión</h1><p>Conéctate a internet para sincronizar Pollos Roly.</p></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  })());
});
