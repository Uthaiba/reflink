// Static app-shell cache only. Patient/API responses never enter this cache.
export async function configureOfflineShell({ enabled, navigatorObject = navigator, cacheStorage = globalThis.caches } = {}) {
  if (!navigatorObject.serviceWorker) return { status: "unsupported" };
  try {
    if (enabled) {
      await navigatorObject.serviceWorker.register("/reflink-sw.js", { scope: "/", updateViaCache: "none" });
      return { status: "registered" };
    }
    const registrations = await navigatorObject.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const scripts = [registration.active, registration.waiting, registration.installing];
      if (scripts.some((worker) => worker && new URL(worker.scriptURL).pathname === "/reflink-sw.js")) {
        await registration.unregister();
      }
    }
    if (cacheStorage) for (const name of await cacheStorage.keys()) {
      if (name.startsWith("reflink-static-")) await cacheStorage.delete(name);
    }
    return { status: "disabled" };
  } catch { return { status: "unavailable" }; }
}
