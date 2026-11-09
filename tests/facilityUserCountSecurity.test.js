import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const routines = await read("../docs/catalog_exports/20261107_live_public_routines.md");
const dashboard = await read("../src/components/dashboards/AdminDashboard.jsx");
const grantReview = await read("../docs/BASELINE_FUNCTION_SECURITY_REVIEW.md");

const extractFunction = (name) => {
  const start = routines.indexOf(`## ${name}`);
  assert.notEqual(start, -1, `missing routine snapshot section: ${name}`);
  const next = routines.indexOf("\n## ", start + 4);
  return routines.slice(start, next === -1 ? undefined : next);
};

test("single-facility user count binds non-admin callers to their own facility", () => {
  const sql = extractFunction("get_facility_user_count(uuid)");
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path TO ''/);
  assert.match(sql, /auth\.uid\(\) IS NULL/);
  assert.match(sql, /FROM public\.profiles/);
  assert.match(sql, /WHERE id = auth\.uid\(\)/);
  assert.match(sql, /caller_role IS DISTINCT FROM 'administrator'/);
  assert.match(sql, /caller_facility_id IS DISTINCT FROM p_facility_id/);
  assert.match(sql, /p_facility_id IS NULL/);
  assert.match(sql, /WHERE facility_id = p_facility_id/);
});

test("all-facility user counts fail closed unless the canonical profile role is administrator", () => {
  const sql = extractFunction("get_facility_user_counts()");
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /FROM public\.profiles/);
  assert.match(sql, /WHERE id = auth\.uid\(\)/);
  assert.match(sql, /caller_role IS DISTINCT FROM 'administrator'/);
  assert.match(sql, /RETURN QUERY/);
  assert.match(sql, /GROUP BY p\.facility_id/);
  assert.match(sql, /WHERE p\.facility_id IS NOT NULL/);
});

test("active administrator dashboard uses only the all-facility aggregate RPC", () => {
  assert.match(dashboard, /supabase\.rpc\(\s*"get_facility_user_counts"/);
  assert.match(dashboard, /counts\[row\.facility_id\] = Number\(row\.user_count/);
  assert.doesNotMatch(dashboard, /supabase\.rpc\(\s*"get_facility_user_count"/);
});

test("captured grant review preserves the intended authenticated RPC dependencies", () => {
  assert.match(grantReview, /\| `authenticated` \| `get_facility_user_count\(uuid\)`, `get_facility_user_counts\(\)`/);
  assert.match(grantReview, /\| `anon` \| None recorded/);
  assert.match(grantReview, /point-in-time ACL inventory/i);
});
