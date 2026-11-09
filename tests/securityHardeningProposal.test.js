import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const proposal = await readFile(
  new URL("../docs/SECURITY_HARDENING_PROPOSAL.md", import.meta.url),
  "utf8",
);

test("database hardening remains a proposal and cannot be mistaken for an applied migration", () => {
  assert.match(proposal, /source-level proposal only — NOT an executable migration and NOT applied/i);
  assert.match(proposal, /Production: read-only/i);
  assert.match(proposal, /Not ready to convert into an executable migration/i);
});

test("audit-log hardening removes dangerous browser privileges without bypassing RLS", () => {
  assert.match(proposal, /REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN/i);
  assert.match(proposal, /administrator-only RLS policy/i);
  assert.match(proposal, /Do not add a new broad SELECT policy/i);
  assert.match(proposal, /trigger execution identity/i);
});

test("default privilege remediation accounts for both creators and owner authority", () => {
  assert.match(proposal, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres/i);
  assert.match(proposal, /ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin/i);
  assert.match(proposal, /no membership in `supabase_admin`/i);
  assert.match(proposal, /separately authorised owner-level operation/i);
  assert.match(proposal, /Existing object ACLs are not retroactively changed/i);
});

test("function defaults are not blanket-revoked from existing workflow RPCs", () => {
  assert.match(proposal, /Do not blanket-revoke function execution/i);
  assert.match(proposal, /exact signature/i);
  assert.match(proposal, /SECURITY INVOKER by default/i);
  assert.match(proposal, /search_path/i);
});

test("staging matrix includes positive and negative access-control tests", () => {
  for (const phrase of [
    "authenticated cannot TRUNCATE",
    "cross-facility access",
    "anon/authenticated receive no implicit table/sequence privileges",
    "direct PostgREST invocation is denied",
    "supabase_admin creator",
    "Supabase security/performance advisors",
  ]) {
    assert.ok(proposal.includes(phrase), `Missing staging acceptance criterion: ${phrase}`);
  }
});

test("function default hardening revokes global PUBLIC execution, not only schema defaults", () => {
  assert.match(proposal, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/i);
  assert.match(proposal, /Do not substitute `IN SCHEMA public` on the final statement/i);
  assert.match(proposal, /per-schema default privileges are additive to global defaults/i);
  assert.match(proposal, /has_function_privilege/i);
  assert.match(proposal, /REVOKE ALL ON TABLES FROM anon, authenticated, service_role/i);
  assert.match(proposal, /REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role/i);
  assert.match(proposal, /REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role/i);
});
