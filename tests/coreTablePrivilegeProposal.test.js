import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proposalPath = new URL(
  "../supabase/migrations/20261108000100_restrict_core_table_structural_privileges.sql",
  import.meta.url,
);
const proposal = readFileSync(proposalPath, "utf8");

test("core table structural privilege proposal is explicitly gated", () => {
  assert.match(proposal, /NOT APPROVED FOR EXECUTION/i);
  assert.match(proposal, /explicit release approval/i);
});

test("proposal revokes only structural privileges from authenticated on the four audited core tables", () => {
  assert.match(proposal, /revoke\s+truncate,\s*trigger,\s*references/i);
  for (const table of [
    "public.referrals",
    "public.counter_referrals",
    "public.profiles",
    "public.facilities",
  ]) {
    assert.ok(proposal.includes(table), `missing target table: ${table}`);
  }
  assert.match(proposal, /from authenticated/i);
});

test("proposal does not silently change row-level policies or ordinary DML grants", () => {
  assert.doesNotMatch(proposal, /create\s+policy|drop\s+policy|alter\s+table/i);
  assert.doesNotMatch(proposal, /revoke\s+(all|select|insert|update|delete)/i);
  assert.doesNotMatch(proposal, /\bgrant\s+(select|insert|update|delete|all)\b/i);
});

test("proposal contains post-change privilege assertions for every target and privilege", () => {
  assert.equal(
    proposal.match(/has_table_privilege\('authenticated'/g)?.length ?? 0,
    12,
  );
  assert.match(proposal, /still has TRUNCATE/i);
  assert.match(proposal, /still has TRIGGER/i);
  assert.match(proposal, /still has REFERENCES/i);
});
