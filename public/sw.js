const OFFLINE_PAGE = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión · Pollos Roly</title><body style="font:16px system-ui,sans-serif;background:#f8f9fb;color:#121826;padding:12vh 8vw;text-align:center"><h1>Sin conexión</h1><p>Conéctate a internet para usar Pollos Roly y sincronizar tus datos.</p></body></html>`;

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).catch(() => {
    if (request.mode === 'navigate') return new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    return Response.error();
  }));
});
