import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { configureOfflineShell } from "../src/lib/offlineShell.js";

test("offline shell registration is explicit and never reloads an editor", async () => {
  const calls = [];
  const result = await configureOfflineShell({ enabled: true, navigatorObject: { serviceWorker: { register: async (...args) => calls.push(args) } } });
  assert.equal(result.status, "registered");
  assert.equal(calls[0][0], "/reflink-sw.js");
  assert.equal(calls[0][1].updateViaCache, "none");
});
test("disabling offline shell removes only REFLINK workers and static caches", async () => {
  const removed = [];
  const result = await configureOfflineShell({ enabled: false,
    navigatorObject: { serviceWorker: { getRegistrations: async () => [
      { active: { scriptURL: "https://synthetic.test/reflink-sw.js" }, unregister: async () => removed.push("worker") },
      { active: { scriptURL: "https://synthetic.test/other.js" }, unregister: async () => removed.push("other") },
    ] } }, cacheStorage: { keys: async () => ["reflink-static-test", "other-cache"], delete: async (name) => removed.push(name) } });
  assert.equal(result.status, "disabled"); assert.deepEqual(removed, ["worker", "reflink-static-test"]);
});
test("worker registration failure is explicit and nonfatal", async () => {
  assert.equal((await configureOfflineShell({ enabled: true, navigatorObject: {} })).status, "unsupported");
  assert.equal((await configureOfflineShell({ enabled: true, navigatorObject: { serviceWorker: { register: async () => { throw Error("Synthetic unavailable"); } } } })).status, "unavailable");
});
function workerFixture() {
  const handlers = {}, touched = [];
  const source = readFileSync(new URL("../src/offline-worker.template.js", import.meta.url), "utf8")
    .replace("__VERSION__", "test").replace("__STATIC_PATHS__", JSON.stringify(["/index.html", "/assets/app-hash.js"]));
  vm.runInNewContext(source, { URL, Response,
    self: { location: { origin: "https://synthetic.test" }, addEventListener: (type, fn) => { handlers[type] = fn; } },
    caches: { match: async (path) => { touched.push(path); return new Response("synthetic static shell"); } },
    fetch: async () => { throw Error("Synthetic offline"); },
  });
  return { handlers, touched };
}
test("worker does not intercept API, external, authenticated, query or mutation requests", () => {
  const { handlers, touched } = workerFixture();
  for (const [path, options] of [
    ["https://database.test/rest/v1/referrals", {}], ["https://synthetic.test/rest/v1/referrals", {}],
    ["https://synthetic.test/assets/app-hash.js?patient=excluded", {}],
    ["https://synthetic.test/assets/app-hash.js", { headers: { authorization: "synthetic" } }],
    ["https://synthetic.test/assets/app-hash.js", { method: "POST" }],
  ]) handlers.fetch({ request: new Request(path, options), respondWith: () => assert.fail("Must not intercept") });
  assert.deepEqual(touched, []);
});
test("offline root navigation returns only the static shell; unknown paths pass through", async () => {
  const { handlers, touched } = workerFixture(); let response;
  handlers.fetch({ request: { url: "https://synthetic.test/", method: "GET", mode: "navigate", headers: new Headers() }, respondWith: (value) => { response = value; } });
  assert.equal(await (await response).text(), "synthetic static shell");
  assert.deepEqual(touched, ["/index.html"]);
  handlers.fetch({ request: { url: "https://synthetic.test/unknown", method: "GET", mode: "navigate", headers: new Headers() }, respondWith: () => assert.fail("Unknown navigation") });
});
