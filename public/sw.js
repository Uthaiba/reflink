const CACHE_NAME = "reflink-shell-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/logo.png", "/reflink-mark.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("reflink-shell-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API, authenticated or explicitly non-cacheable requests.
  // Patient-related responses must never enter the service-worker cache.
  if (
    url.pathname.startsWith("/api/") ||
    request.headers.has("authorization") ||
    request.cache === "no-store" ||
    request.headers.get("cache-control")?.includes("no-store")
  ) return;

  // The app shell is a navigation fallback, never a fallback for asset URLs.
  const looksLikeFile = /\\.[a-z0-9]{2,10}$/i.test(url.pathname);
  const isAppNavigation = request.mode === "navigate" && !looksLikeFile;

  if (isAppNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cachedShell = await caches.match("/");
          return cachedShell || new Response("REFLINK is offline and the app shell is not cached.", {
            status: 503,
            statusText: "Offline",
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        })
    );
    return;
  }

  // Cache only known static app assets. Unknown same-origin GET endpoints
  // remain network-only so dynamic or patient-related responses are not stored.
  const staticAssets = new Set([
    "/manifest.webmanifest",
    "/logo.png",
    "/reflink-mark.png",
    "/favicon.ico",
  ]);
  const isStaticAsset =
    url.pathname.startsWith("/assets/") || staticAssets.has(url.pathname);
  if (!isStaticAsset) return;

  // Approved static assets use network-first caching for offline availability.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return cached || new Response("REFLINK resource unavailable offline.", {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })
  );
});