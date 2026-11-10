import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const review = await read("../docs/PRIVILEGED_RPC_SECURITY_REVIEW_20261110.md");
const verifier = await read("../supabase/verification/privileged_rpc_security_review.sql");

test("privileged RPC review records the live helper dependency and preserves the release boundary", () => {
  assert.match(review, /12 dependency entries/);
  assert.match(review, /audit_log/);
  assert.match(review, /profiles/);
  assert.match(review, /No production or staging changes were made/);
});

test("read logging is described as caller-reported, not proof of a successful data read", () => {
  assert.match(review, /does not prove that the caller actually retrieved or viewed the referral/);
  assert.match(review, /actor_user_id=auth\.uid\(\)/);
  assert.match(review, /Repeated calls/);
});

test("print sequence race and missing composite uniqueness are documented", () => {
  assert.match(review, /MAX\(print_number\)/i);
  assert.match(review, /no unique constraint on/);
  assert.match(review, /serialize allocation/);
});

test("verifier is catalog-only and contains no mutating SQL", () => {
  assert.match(verifier, /pg_get_functiondef/);
  assert.match(verifier, /pg_depend/);
  assert.match(verifier, /has_function_privilege/);
  const executableSql = verifier.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(executableSql, /\b(CREATE|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});
