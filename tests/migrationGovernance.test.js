import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationVersions = [
  "20261105000100",
  "20261105000200",
  "20261105000300",
  "20261105000400",
  "20261105000500",
  "20261105000600",
  "20261106000100",
];

async function migration(version, suffix) {
  return readFile(
    new URL(`${version}_${suffix}.sql`, migrationDirectory),
    "utf8",
  );
}

test("proposed migration versions are unique and chronologically ordered", () => {
  assert.equal(new Set(migrationVersions).size, migrationVersions.length);
  assert.deepEqual([...migrationVersions].sort(), migrationVersions);
});

test("acknowledgement hooks explicitly depend on the outbox foundation", async () => {
  const sql = await migration(
    "20261106000100",
    "referral_acknowledgement_notification_hooks",
  );
  assert.match(sql, /Depends on 20261105000600_notification_outbox_foundation\.sql/);
  assert.match(sql, /create trigger trg_referral_ack_due_after_insert/i);
  assert.match(sql, /create trigger trg_referral_ack_due_after_update/i);
  assert.match(sql, /create trigger trg_profile_ack_due_after_insert/i);
  assert.match(sql, /create trigger trg_profile_ack_due_after_update/i);
});

test("acknowledgement reminder hooks queue in-app events at the stored deadline", async () => {
  const sql = await migration(
    "20261106000100",
    "referral_acknowledgement_notification_hooks",
  );
  assert.match(sql, /'in_app'/);
  assert.match(sql, /'pending',\s*new\.ack_due_at/i);
  assert.match(sql, /p\.role\s*=\s*'receiving_staff'/i);
  assert.match(sql, /p\.facility_id\s*=\s*new\.receiving_facility_id/i);
  assert.match(sql, /r\.status\s*=\s*'sent'/i);
  assert.match(sql, /r\.acknowledged_at\s+is\s+null/i);
  assert.doesNotMatch(sql, /http_request|net\.http_post|pg_net/i);
  assert.doesNotMatch(sql, /'sms'/i);
});

test("outbox queue functions are service-role-only and SECURITY INVOKER", async () => {
  const sql = await migration(
    "20261105000600",
    "notification_outbox_foundation",
  );
  for (const functionName of [
    "enqueue_notification",
    "claim_notification_batch",
    "finish_notification_attempt",
  ]) {
    const functionStart = sql.indexOf(`function private.${functionName}`);
    assert.notEqual(functionStart, -1, `Missing ${functionName}`);
    const functionBlock = sql.slice(functionStart, functionStart + 900);
    assert.match(functionBlock, /security invoker/i, `${functionName} must be SECURITY INVOKER`);
  }
  assert.match(sql, /revoke all on function private\.enqueue_notification[\s\S]*?from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function private\.claim_notification_batch[\s\S]*?from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function private\.finish_notification_attempt[\s\S]*?from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function private\.enqueue_notification[\s\S]*?to service_role/i);
  assert.match(sql, /grant execute on function private\.claim_notification_batch[\s\S]*?to service_role/i);
  assert.match(sql, /grant execute on function private\.finish_notification_attempt[\s\S]*?to service_role/i);
});

test("reporting RPC migrations retain administrator checks and browser grant restrictions", async () => {
  const files = [
    ["20261105000100", "admin_aggregate_referral_volume"],
    ["20261105000200", "admin_lga_referral_summary"],
    ["20261105000300", "admin_facility_reporting_coverage"],
    ["20261105000400", "admin_referral_pathway_intelligence"],
    ["20261105000500", "admin_acknowledgement_delay_alerts"],
  ];
  for (const [version, suffix] of files) {
    const sql = await migration(version, suffix);
    assert.match(sql, /auth\.uid\(\)\s+is\s+null/i, `${version}: missing authenticated-user check`);
    assert.match(sql, /public\.is_administrator\(\)/i, `${version}: missing administrator check`);
    assert.match(sql, /revoke all on function[\s\S]*?from public/i, `${version}: missing PUBLIC revoke`);
    assert.match(sql, /revoke all on function[\s\S]*?from anon/i, `${version}: missing anon revoke`);
  }
});

test("counter-referral RPC enforces receiving role and destination facility", async () => {
  const sql = await migration(
    "20261105000100",
    "admin_aggregate_referral_volume",
  );
  assert.match(sql, /v_role\s+is\s+distinct\s+from\s+'receiving_staff'/i);
  assert.match(sql, /v_receiving_facility_id\s+is\s+distinct\s+from\s+v_facility_id/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /grant execute on function public\.submit_counter_referral[\s\S]*?to authenticated/i);
});
