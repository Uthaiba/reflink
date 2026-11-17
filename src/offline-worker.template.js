/* Build replaces the static inventory and version. No runtime clinical data cache. */
const CACHE = "reflink-static-__VERSION__";
const STATIC_PATHS = __STATIC_PATHS__;
const allowed = new Set(STATIC_PATHS);
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_PATHS)));
  // No skipWaiting: a new version must not replace an in-progress clinical form.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names
    .filter((name) => name.startsWith("reflink-static-") && name !== CACHE)
    .map((name) => caches.delete(name)))));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      url.search || request.headers.has("authorization")) return;
  // Only the root Vite document has a navigation fallback. API/deep-link requests
  // and unknown paths are never replaced by a cached authenticated-looking page.
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(fetch(request).catch(async () => {
      const shell = await caches.match("/index.html", { cacheName: CACHE });
      return shell || Response.error();
    }));
    return;
  }
  if (!allowed.has(url.pathname) || url.pathname === "/index.html") return;
  event.respondWith(caches.match(url.pathname, { cacheName: CACHE }).then((cached) => cached || fetch(request)));
});
