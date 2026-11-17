/* Senap service worker — installability + faster repeat loads, zero staleness.
 *
 * Cached (cache-first): versioned Next.js static chunks, icons, product
 * photos and other same-origin static assets. These are content-hashed or
 * static files, so caching them is always safe.
 *
 * NEVER cached: navigations/HTML and /api/* (auth + live data). Those always
 * hit the network, so an installed app can never show a stale logged-in page
 * or outdated chats after a redeploy.
 */

const CACHE = "senap-v1";

self.addEventListener("install", () => {
  // Take over immediately on update — no "close all tabs" dance.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data — network only

  const cacheable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/products/") ||
    /\.(?:png|jpe?g|svg|webp|ico|woff2?)$/.test(url.pathname);
  if (!cacheable) return; // pages/HTML — network only

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    })(),
  );
});
