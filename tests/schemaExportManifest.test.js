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
  assert.ok(manifest.includes("does **not** contain statements for creator `supabase_admin`"));
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

test("staging reconstruction documents preserve trigger provenance", async () => {
  const [runbook, dependencyManifest, reviewPacket] = await Promise.all([
    readFile(new URL("../docs/STAGING_BASELINE_RECONSTRUCTION_RUNBOOK.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/catalog_exports/20261108_staging_baseline_dependency_manifest.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/STAGING_BASELINE_RECONSTRUCTION_REVIEW_PACKET.md", import.meta.url), "utf8"),
  ]);

  assert.match(runbook, /zero `CREATE TRIGGER` statements/i);
  assert.match(runbook, /supplemental live-catalog snapshot/i);
  assert.match(dependencyManifest, /`CREATE TRIGGER` statements in schema export | 0/);
  assert.match(dependencyManifest, /Live public trigger attachments in supplemental catalog snapshot | 9/);
  assert.match(reviewPacket, /`CREATE TRIGGER` statements in schema export | 0/);
  assert.match(reviewPacket, /supplemental live catalog snapshot contains nine public trigger attachments/i);
  assert.doesNotMatch(reviewPacket, /nine exported triggers/i);
});
