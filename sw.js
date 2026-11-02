// Path-independent service worker for GitHub Pages project subpaths.
const BASE = self.registration.scope;
const CACHE_PREFIX = "ph-report:" + BASE + ":";
const CACHE_NAME = CACHE_PREFIX + "v8";
const APP_SHELL = ["", "index.html", "manifest.json", "icons/icon-192.png", "icons/icon-512.png"]
  .map(path => new URL(path, BASE).href);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => {
      const isThisAppOldCache = key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME;
      // Remove legacy global cache names created by earlier PH-Matara-02 releases.
      const isLegacyPHCache = /^ph-report-v[0-9]+$/.test(key);
      return (isThisAppOldCache || isLegacyPHCache) ? caches.delete(key) : Promise.resolve(false);
    }))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(cached => {
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        return caches.open(CACHE_NAME).then(cache => cache.match(new URL("index.html", BASE).href));
      }
      return Response.error();
    }))
  );
});
