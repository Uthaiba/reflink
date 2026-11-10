import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proposalPath = new URL(
  "../supabase/migrations/20261108000100_restrict_core_table_structural_privileges.sql",
  import.meta.url,
);
const proposal = readFileSync(proposalPath, "utf8");

const targetTables = [
  "public.audit_log",
  "public.counter_referrals",
  "public.diagnosis_categories",
  "public.facilities",
  "public.feedback",
  "public.profiles",
  "public.referral_drafts",
  "public.referral_notifications",
  "public.referral_print_events",
  "public.referral_updates",
  "public.referrals",
  "public.users",
];

test("structural privilege proposal remains explicitly gated from execution", () => {
  assert.match(proposal, /NOT APPROVED FOR EXECUTION/i);
  assert.match(proposal, /Production is read-only/i);
  assert.match(proposal, /synthetic staging database/i);
});

test("proposal covers every production table with authenticated structural privileges", () => {
  assert.match(proposal, /REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN/i);
  for (const table of targetTables) {
    assert.ok(proposal.includes(table), `missing target table: ${table}`);
  }
  assert.match(proposal, /FROM anon, authenticated/i);
});

test("proposal revokes browser sequence access for both public identity sequences", () => {
  assert.match(proposal, /REVOKE ALL PRIVILEGES[\s\S]*ON SEQUENCE/i);
  assert.match(proposal, /public\.audit_log_id_seq/);
  assert.match(proposal, /public\.referral_print_events_id_seq/);
  assert.match(proposal, /has_sequence_privilege/);
});

test("proposal preserves ordinary DML grants and existing RLS policies", () => {
  assert.doesNotMatch(proposal, /CREATE\s+POLICY|DROP\s+POLICY|ALTER\s+TABLE/i);
  assert.doesNotMatch(proposal, /REVOKE\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\s+ON\s+TABLE/i);
  assert.doesNotMatch(proposal, /\bGRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i);
});

test("post-change verification checks all four structural privileges for both browser roles", () => {
  for (const privilege of ["TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
    assert.ok(proposal.includes(`'${privilege}'`), `missing assertion for ${privilege}`);
  }
  assert.match(proposal, /has_table_privilege\('anon'/i);
  assert.match(proposal, /has_table_privilege\('authenticated'/i);
  assert.match(proposal, /Browser role retains/);
});
