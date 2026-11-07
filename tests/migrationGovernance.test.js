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
  "20261107000100",
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
    .filter((file) => /^2026110[567]\d{6}_/.test(file))
    .map((file) => file.slice(0, 14))
    .sort();

  assert.equal(new Set(migrationVersions).size, migrationVersions.length);
  assert.deepEqual([...migrationVersions].sort(), migrationVersions);
  assert.deepEqual(proposedVersions, migrationVersions);
});


test("historical production baseline remains an explicit blocker and is never fabricated", async () => {
  const files = await readdir(migrationDirectory);
  const historicalVersion = "20260928203447";
  assert.equal(
    files.some((file) => file.startsWith(historicalVersion)),
    false,
    "do not invent or reconstruct the missing historical migration from catalog summaries",
  );

  const plan = await readFile(
    new URL("../docs/MIGRATION_RECONCILIATION_PLAN.md", import.meta.url),
    "utf8",
  );
  const governance = await readFile(
    new URL("../docs/MIGRATION_GOVERNANCE.md", import.meta.url),
    "utf8",
  );

  assert.match(plan, /20260928203447_reflink_v2_rural_first/);
  assert.match(plan, /restore missing historical migrations|create a reviewed baseline\/squash/i);
  assert.match(plan, /Do not mark migrations applied merely to silence a mismatch/i);
  assert.match(governance, /complete source-controlled migration baseline/i);
  assert.match(governance, /Do not run `supabase db push`/i);
});

test("acknowledgement hooks explicitly depend on the outbox foundation", async () => {
  const sql = await migration(
    "20261106000100",
    "referral_acknowledgement_notification_hooks",
  );
  assert.match(sql, /Depends on 20261105000600_notification_outbox_foundation\.sql/);
  assert.match(sql, /create trigger trg_referral_ack_due_after_update/i);
  assert.doesNotMatch(sql, /create trigger trg_referral_ack_due_after_insert/i);
  assert.doesNotMatch(sql, /create trigger trg_profile_ack_due_after_/i);
});

test("acknowledgement hook migration does not enqueue or infer user recipients", async () => {
  const sql = await migration(
    "20261106000100",
    "referral_acknowledgement_notification_hooks",
  );
  assert.match(sql, /intentionally does not enqueue user-addressed/i);
  assert.match(sql, /cancel_referral_acknowledgement_reminders/i);
  assert.doesNotMatch(sql, /insert into private\.notification_outbox/i);
  assert.doesNotMatch(sql, /from\s+public\.profiles\s+p|p\.role\s*=\s*'receiving_staff'/i);
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
  assert.match(sql, /cancel_referral_acknowledgement_reminders/i);
  assert.doesNotMatch(sql, /sync_profile_acknowledgement_recipients/i);
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

test("outbox idempotency compares every event field, including expiry", async () => {
  const sql = await migration(
    "20261105000600",
    "notification_outbox_foundation",
  );
  const definition = functionDefinition(sql, "private", "enqueue_notification");
  for (const field of [
    "event_type",
    "channel",
    "recipient_user_id",
    "referral_id",
    "template_key",
    "expires_at",
  ]) {
    assert.ok(
      definition.toLowerCase().includes(`v_existing.${field} is distinct from p_${field}`),
      `Idempotency key reuse must reject changed ${field}`,
    );
  }
  assert.ok(definition.toLowerCase().includes("on conflict (event_key) do nothing"));
});

test("acknowledgement hook ignores updates that do not change lifecycle fields", async () => {
  const sql = await migration(
    "20261106000100",
    "referral_acknowledgement_notification_hooks",
  );
  const trigger = sql.slice(sql.indexOf("create trigger trg_referral_ack_due_after_update"));
  for (const field of ["status", "ack_due_at", "acknowledged_at", "receiving_facility_id"]) {
    assert.ok(
      trigger.toLowerCase().includes(`old.${field} is distinct from new.${field}`),
      `Reminder cancellation must be conditional on a changed ${field}`,
    );
  }
  assert.ok(trigger.toLowerCase().includes("for each row"));
  assert.ok(trigger.toLowerCase().includes("when ("));
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
    assert.match(definition, /set search_path\s*=\s*''/i, `${name} wrapper must pin search_path`);
    assert.ok(definition.includes(`private.${name}(`), `${name} wrapper must delegate to private implementation`);
    assert.ok(sql.includes(`grant execute on function public.${name}(`));
    assert.ok(sql.includes(`revoke all on function public.${name}(`));
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
  assert.match(definition, /o\.claim_token\s*=\s*a\.claim_token/i);
  assert.match(definition, /o\.attempt_count\s*<\s*8/i);
});

test("outbox lease reclamation locks queue rows before attempt-ledger rows", async () => {
  const sql = await migration(
    "20261105000600",
    "notification_outbox_foundation",
  );
  const definition = functionDefinition(sql, "private", "claim_notification_batch");
  const queueLock = definition.indexOf("perform o.id");
  const attemptUpdate = definition.indexOf("update private.notification_attempts");
  assert.notEqual(queueLock, -1);
  assert.notEqual(attemptUpdate, -1);
  assert.ok(queueLock < attemptUpdate, "queue rows must be locked before attempt rows");
  assert.match(definition.slice(queueLock, attemptUpdate), /for update/i);
});

test("referral cancellation trigger follows the outbox-first lock order", async () => {
  const sql = await migration(
    "20261106000100",
    "referral_acknowledgement_notification_hooks",
  );
  const definition = functionDefinition(
    sql,
    "private",
    "cancel_referral_acknowledgement_reminders",
  );
  const queueLock = definition.indexOf("perform o.id");
  const attemptUpdate = definition.indexOf("update private.notification_attempts");
  const queueUpdate = definition.indexOf("update private.notification_outbox");
  assert.notEqual(queueLock, -1);
  assert.notEqual(attemptUpdate, -1);
  assert.notEqual(queueUpdate, -1);
  assert.ok(queueLock < attemptUpdate, "queue rows must be locked before attempt rows");
  assert.ok(attemptUpdate < queueUpdate, "attempt audit must close before the queue lease is released");
  assert.match(definition.slice(queueLock, attemptUpdate), /for update/i);
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

test("outbox template keys escape the version separator as a literal dot", async () => {
  const sql = await migration(
    "20261105000600",
    "notification_outbox_foundation",
  );
  assert.ok(sql.includes("template_key ~ '^[a-z0-9_]+\\.v[0-9]+$'"));
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
    assert.match(sql, /auth\.uid\(\)\s+is\s+null/i);
    assert.match(sql, /public\.is_administrator\(\)/i);
    assert.match(sql, /revoke all on function[\s\S]*?from public/i);
    assert.match(sql, /revoke all on function[\s\S]*?from anon/i);
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


test("notification recipient policy fails closed until an authoritative assignment source is approved", async () => {
  const policy = await readFile(
    new URL("../docs/NOTIFICATION_RECIPIENT_ELIGIBILITY.md", import.meta.url),
    "utf8",
  );
  const hook = await migration(
    "20261106000100",
    "referral_acknowledgement_notification_hooks",
  );

  assert.match(policy, /no automatic user recipient is selected/i);
  assert.match(policy, /Facility-wide recipient fan-out is not approved/i);
  assert.match(policy, /must remain unapplied/i);
  // The migration itself must fail closed, not merely document the mismatch.
  assert.doesNotMatch(hook, /insert into private\.notification_outbox/i);
  assert.doesNotMatch(hook, /from\s+public\.profiles\s+p|p\.role\s*=\s*'receiving_staff'/i);
  assert.match(hook, /does not enqueue user-addressed/i);
});

test("authenticated notification inbox adapter stays owner-scoped and mutation-limited", async () => {
  const adapter = await readFile(
    new URL("../src/lib/notificationInbox.js", import.meta.url),
    "utf8",
  );
  const contract = await readFile(
    new URL("../docs/NOTIFICATION_INBOX_ADAPTER.md", import.meta.url),
    "utf8",
  );

  assert.match(adapter, /auth\.getUser\(\)/);
  assert.match(adapter, /\.eq\("recipient_user_id",\s*userId\)/);
  assert.match(adapter, /\.select\(NOTIFICATION_COLUMNS\)/);
  assert.match(adapter, /ALLOWED_EVENT_TYPES/);
  assert.match(adapter, /ALLOWED_TEMPLATE_KEYS/);
  assert.match(adapter, /mark_notification_read/);
  assert.doesNotMatch(adapter, /\.insert\(|\.update\(|\.delete\(/i);
  assert.match(contract, /not mounted in the application/i);
  assert.match(contract, /RLS remains the actual security boundary/i);
});

test("legacy privileged RPC source gaps and helper dependencies remain explicit release blockers", async () => {
  const files = await readdir(migrationDirectory);
  const sqlFiles = files.filter((file) => file.endsWith(".sql"));
  const sql = (await Promise.all(sqlFiles.map((file) =>
    readFile(new URL(file, migrationDirectory), "utf8"),
  ))).join("\n");
  for (const name of [
    "get_facility_user_count",
    "get_facility_user_counts",
    "is_administrator",
    "log_referral_print",
    "log_referral_read",
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, "i"),
      `Legacy function source must not be fabricated from catalog summaries: ${name}`,
    );
  }
  const review = await readFile(
    new URL("../docs/PRIVILEGED_RPC_SOURCE_RECONCILIATION.md", import.meta.url),
    "utf8",
  );
  assert.match(review, /five existing SECURITY DEFINER functions/i);
  assert.match(review, /12 policy dependency entries/i);
  assert.match(review, /exact live function definitions/i);
  assert.match(review, /cross-RPC, cross-period and cross-filter disclosure tests/i);
  assert.match(review, /Blocked: exact legacy function source/i);
  assert.match(review, /reviewed source snapshot `d3c6c24e22eb426760065754bfef842911880542`/i);
  assert.ok(review.includes("`src/App.jsx` at lines 4821 and 6186"));
  assert.ok(review.includes("`src/components/dashboards/AdminDashboard.jsx` at line 100"));
});

test("reporting SECURITY DEFINER RPCs pin search_path and require the administrator helper", async () => {
  const files = [
    ["20261105000100", "admin_aggregate_referral_volume"],
    ["20261105000200", "admin_lga_referral_summary"],
    ["20261105000300", "admin_facility_reporting_coverage"],
    ["20261105000400", "admin_referral_pathway_intelligence"],
    ["20261105000500", "admin_acknowledgement_delay_alerts"],
  ];
  for (const [version, suffix] of files) {
    const sql = await migration(version, suffix);
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path\s*=\s*''/i);
    assert.match(sql, /auth\.uid\(\)\s+is\s+null/i);
    assert.match(sql, /public\.is_administrator\(\)/i);
  }
});

test("facility coverage documentation identifies current-registry versus historical-activity semantics", async () => {
  const review = await readFile(
    new URL("../docs/PRIVILEGED_RPC_SOURCE_RECONCILIATION.md", import.meta.url),
    "utf8",
  );
  assert.match(review, /current-registry classification against a historical activity window/i);
  const sql = await migration(
    "20261105000300",
    "admin_facility_reporting_coverage",
  );
  assert.match(sql, /from public\.facilities f/i);
  assert.match(sql, /from cohort c/i);
});

test("migration governance reflects encrypted queue integration and preserves offline release limits", async () => {
  const governance = await readFile(
    new URL("../docs/MIGRATION_GOVERNANCE.md", import.meta.url),
    "utf8",
  );
  assert.match(governance, /integrates encrypted queue writes/i);
  assert.match(governance, /Chromium CI covers selected persistence/i);
  assert.match(governance, /not production approval/i);
  assert.doesNotMatch(governance, /Current IndexedDB records remain unencrypted/i);
});

test("foreign-key index recommendations require exact catalog evidence", async () => {
  const governance = await readFile(
    new URL("../docs/MIGRATION_GOVERNANCE.md", import.meta.url),
    "utf8",
  );
  const reconciliation = await readFile(
    new URL("../docs/MIGRATION_RECONCILIATION_PLAN.md", import.meta.url),
    "utf8",
  );
  assert.match(governance, /16 foreign-key columns/i);
  assert.match(governance, /exact table\/column list/i);
  assert.match(reconciliation, /count alone is not sufficient/i);
  assert.match(reconciliation, /no index migration is proposed/i);
  assert.match(reconciliation, /disposable database/i);
});

test("migration governance accurately describes acknowledgement hooks as cancellation-only", async () => {
  const governance = await readFile(
    new URL("../docs/MIGRATION_GOVERNANCE.md", import.meta.url),
    "utf8",
  );
  assert.match(governance, /cancellation-only reminder lifecycle semantics/i);
  assert.match(governance, /does not enqueue reminders, infer recipients, or dispatch messages/i);
  assert.doesNotMatch(governance, /stored-deadline\/in-app-only enqueue semantics/i);
});


test("live privileged RPC catalog reconciliation records owner, RLS bypass and helper dependencies", async () => {
  const review = await readFile(
    new URL("../docs/PRIVILEGED_RPC_SOURCE_RECONCILIATION.md", import.meta.url),
    "utf8",
  );
  assert.match(review, /All five legacy functions exist in the live public schema/i);
  assert.match(review, /owner role is not a superuser but \*\*does have BYPASSRLS\*\*/i);
  assert.match(review, /12 catalog dependency entries across 10 distinct RLS policies/i);
  assert.match(review, /guard_profile_security_fields\(\)/i);
  assert.match(review, /there is no unique index on/i);
  assert.match(review, /search_path=""|empty search path/i);
});

test("dependency remediation pins patched Vite and source-map-js versions", async () => {
  const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  ));
  const lock = JSON.parse(await readFile(
    new URL("../package-lock.json", import.meta.url),
    "utf8",
  ));
  const triage = await readFile(
    new URL("../docs/DEPENDENCY_SECURITY_TRIAGE.md", import.meta.url),
    "utf8",
  );
  const workflow = await readFile(
    new URL("../.github/workflows/quality.yml", import.meta.url),
    "utf8",
  );

  assert.equal(packageJson.devDependencies.vite, "^8.2.4");
  assert.equal(lock.packages["node_modules/vite"].version, "8.2.4");
  assert.equal(lock.packages["node_modules/source-map-js"].version, "1.2.2");
  assert.equal(lock.packages["node_modules/rolldown"].version, "1.2.4");
  assert.match(triage, /GHSA-68fv-2mgg-jv7q/i);
  assert.match(triage, /GHSA-587h-7wmj-h5pm/i);
  assert.match(workflow, /npm audit --json/);
  assert.match(workflow, /totals\.high[\s\S]*totals\.critical|totals\.critical[\s\S]*totals\.high/);
  assert.match(workflow, /High or critical dependency vulnerabilities block this workflow/);
  assert.match(workflow, /fixAvailable/);
});


test("notification log migration grants exactly the intended metadata columns", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261107000100_restrict_notification_log_column_access.sql", import.meta.url),
    "utf8",
  );
  const grantStatements = sql.match(/grant\s+[\s\S]*?;/gi) ?? [];
  const selectGrant = grantStatements.filter((statement) =>
    /grant select/i.test(statement) && /referral_notifications/i.test(statement),
  );
  assert.equal(selectGrant.length, 1, "exactly one authenticated SELECT grant is expected");

  const grant = selectGrant[0];
  const columnList = grant.match(/grant select\s*\(([\s\S]*?)\)\s*on table/i)?.[1];
  assert.ok(columnList, "column-level SELECT grant must be explicit");
  const columns = columnList.split(",").map((column) => column.trim().toLowerCase()).sort();
  assert.deepEqual(columns, [
    "channel",
    "created_at",
    "id",
    "notification_type",
    "referral_id",
    "sent_at",
    "status",
  ]);

  assert.match(sql, /revoke all privileges on table public\.referral_notifications\s+from anon, authenticated/i);
  assert.match(sql, /revoke all privileges \([\s\S]*?recipient_phone,[\s\S]*?provider,[\s\S]*?provider_message_id,[\s\S]*?error_message[\s\S]*?\)\s+on table public\.referral_notifications\s+from anon, authenticated/i);
  assert.match(grant, /on table public\.referral_notifications\s+to authenticated/i);
  assert.doesNotMatch(grant, /recipient_phone|provider_message_id|error_message/i);
  assert.doesNotMatch(sql, /grant\s+[\s\S]*?to anon/i);
  assert.doesNotMatch(sql, /to service_role|from service_role/i);
  assert.doesNotMatch(sql, /drop policy|disable row level security/i);
  assert.match(sql, /begin;[\s\S]*commit;/i);
});
