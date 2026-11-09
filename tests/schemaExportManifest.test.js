import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = await readFile(
  new URL("../docs/catalog_exports/20261108_public_schema_export_manifest.md", import.meta.url),
  "utf8",
);

test("public schema export manifest records the reviewed artifact identity", () => {
  assert.match(manifest, /72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3/);
  assert.match(manifest, /64,434 bytes; 1,612 lines/);
});

test("public schema inventory distinguishes exported objects from live trigger evidence", () => {
  for (const entry of [
    "Public tables | 14",
    "Public functions | 16",
    "Public views | 2",
    "RLS policies | 30",
    "Trigger DDL statements in this artifact | 0",
    "Explicit indexes | 10",
    "Foreign keys | 23",
    "Tables with RLS enabled | 14",
  ]) {
    assert.ok(manifest.includes(entry), `Missing manifest inventory entry: ${entry}`);
  }
  assert.match(manifest, /correcting the earlier inventory's count of 9/i);
  assert.match(manifest, /SQL artifact contains no `CREATE TRIGGER` statements/i);
});

test("manifest records missing creator-specific defaults and staging-only restore boundary", () => {
  assert.match(manifest, /does **not** contain statements for creator `supabase_admin`/i);
  assert.match(manifest, /broad public-schema default ACLs for both/i);
  assert.match(manifest, /not yet approved as a restore script/i);
  assert.match(manifest, /Production remains read-only/i);
  assert.match(manifest, /No standalone top-level `INSERT INTO` or `COPY` data-loading statements were found/i);
});

test("live trigger snapshot contains the nine catalog-confirmed trigger attachments", async () => {
  const snapshot = await readFile(
    new URL("../docs/catalog_exports/20261109_live_public_trigger_snapshot.sql", import.meta.url),
    "utf8",
  );
  const triggers = snapshot.match(/CREATE TRIGGER /g) ?? [];
  assert.equal(triggers.length, 9);
  for (const name of [
    "counter_referrals_audit_mutation",
    "guard_profile_security_fields",
    "referral_draft_updated_at",
    "referral_ack_due_at_trigger",
    "referral_counter_referral_guard",
    "referral_entry_validation_trigger",
    "referral_status_audit_trigger",
    "referral_status_transition_validation",
    "referrals_audit_mutation",
  ]) {
    assert.match(snapshot, new RegExp("CREATE TRIGGER " + name + "\\b"));
  }
});
