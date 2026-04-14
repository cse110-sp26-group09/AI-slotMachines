// Tiny offline-first service worker for the slot machine.
// Cache-busting strategy: bump CACHE if you change asset filenames or want a hard refresh.
const CACHE = "ai-slots-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE ? Promise.resolve() : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const res = await fetch(event.request);
        // Best-effort cache for same-origin GET requests.
        if (event.request.method === "GET" && res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(event.request, res.clone()).catch(() => {});
        }
        return res;
      } catch {
        // If navigation fails, return index to keep the app usable offline.
        if (event.request.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }
        return new Response("Offline", { status: 503 });
      }
    })()
  );
});