import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("receiving queue subscribes to referrals scoped to the signed-in facility", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const effectStart = app.indexOf("const setupReceivingRealtime");
  assert.notEqual(effectStart, -1, "receiving realtime setup must exist");

  const effectEnd = app.indexOf("/* =======================================================", effectStart);
  assert.ok(effectEnd > effectStart, "receiving realtime effect must have a bounded source section");
  const source = app.slice(effectStart, effectEnd);

  assert.ok(source.includes('table: "referrals"'));
  assert.ok(source.includes('filter: `receiving_facility_id=eq.${profile.facility_id}`'));
  assert.ok(source.includes('event: "*"'));
  assert.ok(source.includes("void loadIncomingReferrals()"));
  assert.ok(source.includes("isActive = false"));
  assert.ok(source.includes("supabase.removeChannel(channel)"));
  assert.ok(source.includes('"CHANNEL_ERROR"'));
  assert.ok(source.includes('"TIMED_OUT"'));
});

test("receiving realtime does not subscribe without an authenticated facility profile", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const effectStart = app.indexOf("const setupReceivingRealtime");
  const effectEnd = app.indexOf("/* =======================================================", effectStart);
  const source = app.slice(effectStart, effectEnd);

  assert.ok(source.includes("if (userError || !user)"));
  assert.ok(source.includes("!profile?.facility_id"));
  assert.ok(source.includes("!isActive"));
});
