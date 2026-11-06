import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

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

function functionDefinition(sql, schema, name) {
  const marker = `create or replace function ${schema}.${name}(`;
  const start = sql.toLowerCase().indexOf(marker);
  assert.notEqual(start, -1, `Missing function ${schema}.${name}`);
  const end = sql.indexOf("$function$;", start);
  assert.notEqual(end, -1, `Unterminated function ${schema}.${name}`);
  return sql.slice(start, end + "$function$;".length);
}

test("proposed migration files exist exactly once and are chronologically ordered", async () => {
  const files = await readdir(migrationDirectory);
  const proposedVersions = files
    .filter((file) => /^2026110[56]\d{6}_/.test(file))
    .map((file) => file.slice(0, 14))
    .sort();

  assert.equal(new Set(migrationVersions).size, migrationVersions.length);
  assert.deepEqual([...migrationVersions].sort(), migrationVersions);
  assert.deepEqual(proposedVersions, migrationVersions);
});

test("acknowledgement hooks explicitly depend on the outbox foundation", async () => {
  const sql = await migration(
    "20261106000100",
    "referral_acknowledgement_notification_hooks",
  );
  assert.match(sql, /Depends on 20261105000600_notification_outbox_foundation\.sql/);
  for (const trigger of [
    "trg_referral_ack_due_after_insert",
    "trg_referral_ack_due_after_update",
    "trg_profile_ack_due_after_insert",
    "trg_profile_ack_due_after_update",
  ]) {
    assert.match(sql, new RegExp(`create trigger ${trigger}`, "i"));
  }
});

test("acknowledgement reminders use the stored deadline and assigned receiving staff", async () => {
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

test("acknowledgement hooks cancel stale work and close its in-flight attempt audit", async () => {
  const sql = await migration(
    "20261106000100",
    "referral_acknowledgement_notification_hooks",
  );
  assert.match(sql, /outcome\s*=\s*'cancelled'/i);
  assert.match(sql, /a\.finished_at\s+is\s+null/i);
  assert.match(sql, /o\.status\s+in\s*\('pending',\s*'retry_wait',\s*'processing'\)/i);
  assert.match(sql, /old\.role\s+is\s+distinct\s+from\s+new\.role/i);
  assert.match(sql, /old\.facility_id\s+is\s+distinct\s+from\s+new\.facility_id/i);
});

test("outbox queue functions are individually SECURITY INVOKER with empty search paths", async () => {
  const sql = await migration(
    "20261105000600",
    "notification_outbox_foundation",
  );
  for (const name of [
    "enqueue_notification",
    "claim_notification_batch",
    "finish_notification_attempt",
  ]) {
    const definition = functionDefinition(sql, "private", name);
    assert.match(definition, /security invoker/i, `${name} must be SECURITY INVOKER`);
    assert.match(definition, /set search_path\s*=\s*''/i, `${name} must pin search_path`);
  }
});

test("outbox queue functions have exact service-role-only execute grants", async () => {
  const sql = await migration(
    "20261105000600",
    "notification_outbox_foundation",
  );
  const grants = [
    ["enqueue_notification", "text, text, text, uuid, uuid, text, timestamptz"],
    ["claim_notification_batch", "integer"],
    ["finish_notification_attempt", "uuid, uuid, text, text, text, integer"],
  ];
  for (const [name, signature] of grants) {
    const escapedSignature = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      sql,
      new RegExp(`revoke all on function private\\.${name}\\(${escapedSignature}\\) from public, anon, authenticated;`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function private\\.${name}\\(${escapedSignature}\\) to service_role;`, "i"),
    );
  }
});

test("PostgREST outbox entry points stay in public but delegate as service-role-only invokers", async () => {
  const sql = await migration(
    "20261105000600",
    "notification_outbox_foundation",
  );
  for (const name of [
    "enqueue_notification",
    "claim_notification_batch",
    "finish_notification_attempt",
  ]) {
    const definition = functionDefinition(sql, "public", name);
    assert.match(definition, /security invoker/i, `${name} wrapper must not elevate privileges`);
    assert.match(definition, /set search_path\\s*=\\s*''/i, `${name} wrapper must pin search_path`);
    assert.match(definition, new RegExp(`private\\\\.${name}\\\\(`, "i"), `${name} wrapper must delegate to private implementation`);
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\\\.${name}\\\\(`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\\\.${name}\\\\(`, "i"),
    );
  }
});

test("outbox claiming is bounded, concurrent-safe and records each attempt", async () => {
  const sql = await migration(
    "20261105000600",
    "notification_outbox_foundation",
  );
  const definition = functionDefinition(sql, "private", "claim_notification_batch");
  assert.match(definition, /p_batch_size\s*>\s*50/i);
  assert.match(definition, /for update skip locked/i);
  assert.match(definition, /interval\s+'5 minutes'/i);
  assert.match(definition, /insert into private\.notification_attempts/i);
  assert.match(definition, /outcome\s*=\s*'cancelled'/i);
  assert.match(definition, /error_code\s*=\s*'EXPIRED'/i);
  assert.match(definition, /outcome\s*=\s*'dead_letter'/i);
  assert.match(definition, /error_code\s*=\s*'ATTEMPTS_EXHAUSTED'/i);
  assert.match(definition, /outcome\s*=\s*'retry_wait'/i);
  assert.match(definition, /error_code\s*=\s*'LEASE_EXPIRED'/i);
  assert.match(definition, /o\\.claim_token\\s*=\\s*a\\.claim_token/i);
  assert.match(definition, /o\.attempt_count\s*<\s*8/i);
});

test("outbox settlement validates the active lease and bounds retry delay", async () => {
  const sql = await migration(
    "20261105000600",
    "notification_outbox_foundation",
  );
  const definition = functionDefinition(sql, "private", "finish_notification_attempt");
  assert.match(definition, /o\.claim_token\s*=\s*p_claim_token/i);
  assert.match(definition, /o\.claimed_until\s*>\s*v_finished_at/i);
  assert.match(definition, /p_retry_after_seconds\s*<\s*1/i);
  assert.match(definition, /p_retry_after_seconds\s*>\s*3600/i);
  assert.match(definition, /v_attempt_number\s*>=\s*8/i);
  assert.match(definition, /finished_at\s*=\s*v_finished_at/i);
});

test("outbox schema excludes message bodies, phone numbers and arbitrary payload columns", async () => {
  const sql = await migration(
    "20261105000600",
    "notification_outbox_foundation",
  );
  const tableDefinition = sql.slice(
    sql.indexOf("create table if not exists private.notification_outbox"),
    sql.indexOf("create index if not exists notification_outbox_ready_idx"),
  );
  assert.match(tableDefinition, /recipient_user_id uuid not null/i);
  assert.match(tableDefinition, /referral_id uuid not null/i);
  assert.doesNotMatch(tableDefinition, /message_body|phone_number|payload\s+jsonb/i);
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
