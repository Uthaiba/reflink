// Synthetic-only browser checks. No hosted API, account or patient records.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer, preview } from "vite";

execFileSync("npm", ["run", "build"], { stdio: "pipe", env: { ...process.env,
  VITE_SUPABASE_URL: "https://reflink-synthetic.invalid", VITE_SUPABASE_ANON_KEY: "synthetic-public-client",
  VITE_PWA_ENABLED: "true",
} });
const production = await preview({ preview: { host: "127.0.0.1", port: 4179, strictPort: true } });
const harness = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import AggregateChart from '/src/components/dashboards/AggregateChart.jsx';
import '/src/aggregate-reporting.css';
const dataset = {title:'Synthetic facility activity', columns:['facility_label','referral_count','completed_count'],rows:[{facility_label:'Synthetic facility A',referral_count:12,completed_count:8},{facility_label:'Synthetic facility B',referral_count:null,completed_count:null}]};
createRoot(document.getElementById('root')).render(React.createElement(AggregateChart,{dataset}));
</script></body></html>`;
const development = await createServer({ server: { host: "127.0.0.1", port: 4180, strictPort: true }, plugins: [{ name: "synthetic-browser-harness", configureServer(server) {
  server.middlewares.use("/__synthetic-chart", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__synthetic-chart", harness));
  });
} }] });
let browser;
try {
  await development.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.REFLINK_CHROMIUM_PATH ? { executablePath: process.env.REFLINK_CHROMIUM_PATH } : {}) });
  const context = await browser.newContext();
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4179/");
  await page.waitForFunction(() => document.getElementById("root")?.textContent.includes("REFLINK"));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller != null);
  const cachedPaths = await page.evaluate(async () => {
    const keys = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) keys.push(new URL(request.url).pathname);
    return keys;
  });
  assert.ok(cachedPaths.includes("/index.html"));
  assert.ok(cachedPaths.every((path) => path === "/index.html" || path === "/manifest.webmanifest" || path === "/reflink-icon.svg" || /^\/assets\/[^/]+\.(js|css)$/.test(path)));
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.getElementById("root")?.textContent.includes("REFLINK"));
  assert.ok((await page.locator("body").textContent()).includes("Connection unavailable"));
  console.log("browser_offline_static_shell_and_cache_boundary: passed");
  await context.setOffline(false);
  await page.goto("http://127.0.0.1:4180/__synthetic-chart");
  await page.getByRole("heading", { name: "Synthetic facility activity visualization" }).waitFor();
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Chart overflow at ${width}px`);
    assert.ok((await page.locator(".aggregate-bars").textContent()).includes("Withheld / unavailable"));
  }
  await page.getByLabel("Count indicator").focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.getByLabel("Count indicator").inputValue(), "completed_count");
  assert.ok((await page.locator(".aggregate-bars").textContent()).includes("8"));
  console.log("browser_aggregate_chart_keyboard_suppression_and_responsive_layout: passed");
} finally {
  await browser?.close();
  await development.close();
  await new Promise((resolve) => production.httpServer.close(resolve));
}
