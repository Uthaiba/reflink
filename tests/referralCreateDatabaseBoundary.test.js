import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20261109000100_enforce_referral_create_context.sql"),
  "utf8"
);

test("referral creation guard is an invoker trigger with an empty search path", () => {
  assert.match(migration, /LANGUAGE plpgsql\s+SECURITY INVOKER\s+SET search_path = ''/i);
  assert.match(migration, /BEFORE INSERT ON public\.referrals/i);
  assert.match(migration, /CREATE TRIGGER a_referral_creation_context_guard/i);
});

test("referral creation derives identity and sender facility from auth and profile", () => {
  assert.match(migration, /v_actor_id := auth\.uid\(\)/i);
  assert.match(migration, /FROM public\.profiles AS p/i);
  assert.match(migration, /v_profile_role IS DISTINCT FROM 'phc_staff'/i);
  assert.match(migration, /NEW\.referring_user_id := v_actor_id/i);
  assert.match(migration, /NEW\.referring_facility_id := v_sender_facility_id/i);
});

test("referral creation rejects missing or inactive sender and destination facilities", () => {
  assert.match(migration, /v_sender_facility_active boolean/i);
  assert.match(migration, /FROM public\.facilities AS f[\s\S]*?WHERE f\.id = v_sender_facility_id/i);
  assert.match(migration, /v_sender_facility_active IS DISTINCT FROM TRUE/i);
  assert.match(migration, /FROM public\.facilities AS f[\s\S]*?WHERE f\.id = NEW\.receiving_facility_id/i);
  assert.match(migration, /v_destination_active IS DISTINCT FROM TRUE/i);
});

test("referral creation forces initial state and server timestamps", () => {
  assert.match(migration, /NEW\.status := 'sent'/i);
  assert.match(migration, /NEW\.is_test := false/i);
  assert.match(migration, /NEW\.created_at := now\(\)/i);
  assert.match(migration, /NEW\.id := gen_random_uuid\(\)/i);
  assert.match(migration, /NEW\.acknowledged_at := NULL/i);
  assert.match(migration, /NEW\.completed_at := NULL/i);
  assert.match(migration, /NEW\.assessment_completed_at := NULL/i);
  assert.match(migration, /NEW\.discharged_at := NULL/i);
});

test("referral creation requires a stable idempotency key and explicit sync source", () => {
  assert.match(migration, /NEW\.sync_source NOT IN \('online', 'offline'\)/i);
  assert.match(migration, /nullif\(btrim\(NEW\.offline_client_id\), ''\) IS NULL/i);
});

test("proposal does not change table grants, RLS policies or execute production DDL", () => {
  assert.doesNotMatch(migration, /GRANT\s+.*ON TABLE public\.referrals/i);
  assert.doesNotMatch(migration, /REVOKE\s+.*ON TABLE public\.referrals/i);
  assert.doesNotMatch(migration, /CREATE POLICY|ALTER POLICY|DROP POLICY/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.referrals/i);
});

test("trigger guard does not rely on deprecated auth.role()", () => {
  assert.doesNotMatch(migration, /auth\.role\s*\(/i);
  assert.match(migration, /current_user IN \('postgres', 'supabase_admin', 'service_role'\)/i);
});
