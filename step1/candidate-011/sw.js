const CACHE = "ai-slots-v1";
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        const url = new URL(req.url);
        if (url.origin === location.origin) {
          const c = await caches.open(CACHE);
          c.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        return caches.match("./index.html");
      }
    })(),
  );
});

