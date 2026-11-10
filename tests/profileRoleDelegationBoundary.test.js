import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const design = await readFile(
  new URL("../supabase/verification/profile_role_delegation_trigger_design.sql", import.meta.url),
  "utf8",
);

test("administrator role guard remains a design-only proposal, not an applied migration", () => {
  assert.match(design, /DESIGN ONLY — NOT A MIGRATION AND NOT APPROVED FOR EXECUTION/);
  assert.match(design, /has NOT been integration-tested/);
  assert.doesNotMatch(design, /^\s*(?!\s*--)(CREATE|ALTER|DROP)\s+/m);
});

test("proposed trigger blocks authenticated administrator profile inserts", () => {
  assert.match(design, /IF NEW\.role = 'administrator'/);
  assert.match(design, /TG_OP = 'INSERT'/);
  assert.match(design, /USING ERRCODE = '42501'/);
});

test("proposed trigger blocks transitions into administrator role", () => {
  assert.match(design, /OLD\.role IS DISTINCT FROM NEW\.role/);
  assert.match(design, /BEFORE INSERT OR UPDATE ON public\.profiles/);
});

test("proposed guard permits only trusted database contexts to assign administrator", () => {
  assert.match(design, /current_user IN \('postgres', 'supabase_admin', 'service_role'\)/);
  assert.doesNotMatch(design, /auth\.role\(\)/);
});

test("design preserves the existing profile guard and documents critical staging cases", () => {
  assert.match(design, /Do not alter the existing guard_profile_security_fields trigger\/function/);
  for (const scenario of [
    "authenticated administrator INSERT",
    "authenticated administrator UPDATE",
    "must_change_password",
    "service_role provisioning INSERT",
    "current_user='authenticated'",
    "current_user='service_role'",
  ]) {
    assert.ok(design.includes(scenario), scenario);
  }
});
