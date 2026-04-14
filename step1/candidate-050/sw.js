<<<<<<< HEAD
/* global self */

const CACHE_NAME = "token-tumbler:static:v2";
const PRECACHE_URLS = ["./", "./index.html", "./styles.css", "./script.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      self.skipWaiting();
    })(),
=======
const CACHE_NAME = "tokengambit-cache-v1";
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
>>>>>>> 15850032c97bdc0971805f62c0642c434c5aaefa
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
<<<<<<< HEAD
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      self.clients.claim();
    })(),
=======
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
      ),
      self.clients.claim(),
    ])
>>>>>>> 15850032c97bdc0971805f62c0642c434c5aaefa
  );
});

self.addEventListener("fetch", (event) => {
<<<<<<< HEAD
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res && res.ok && new URL(req.url).origin === self.location.origin) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        return (
          (await caches.match("./index.html", { ignoreSearch: true })) ||
          new Response("Offline. The model is buffering...", { status: 503, headers: { "Content-Type": "text/plain" } })
        );
      }
    })(),
=======
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
>>>>>>> 15850032c97bdc0971805f62c0642c434c5aaefa
  );
});

