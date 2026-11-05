import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./App.css";
import "./reflink-theme-professional.css";
import "./admin-dashboard-modern.css";
import "./admin-workspace.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    // Vite development must not be controlled by a cached production worker.
    // Remove old local registrations/caches so edits and public assets load fresh.
    if (import.meta.env.DEV) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames
              .filter((name) => name.startsWith("reflink-shell-"))
              .map((name) => caches.delete(name))
          );
        }
      } catch (error) {
        console.warn("REFLINK development service-worker cleanup failed", error);
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("REFLINK service worker registration failed", error);
    });
  });
}
