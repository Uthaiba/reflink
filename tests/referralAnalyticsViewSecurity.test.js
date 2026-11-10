import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const catalog = await read("../docs/catalog_exports/20261107_live_public_schema_catalog.md");
const routines = await read("../docs/catalog_exports/20261107_live_public_routines.md");
const app = await read("../src/App.jsx");
const admin = await read("../src/components/dashboards/AdminDashboard.jsx");
const legacyAnalysis = await read("../src/components/dashboards/AnalysisHub.jsx");
const legacyAnalytics = await read("../src/components/dashboards/AnalyticsDashboard.jsx");
const verifier = await read("../supabase/verification/referral_analytics_view_privilege_review.sql");

const viewRecord = (name) => {
  const start = catalog.indexOf(`"view_name": "${name}"`);
  assert.notEqual(start, -1, `missing catalog view record: ${name}`);
  const begin = catalog.lastIndexOf("```json", start);
  const end = catalog.indexOf("```", start);
  return JSON.parse(catalog.slice(begin + 7, end).trim());
};

const routineRecord = (name) => {
  const start = routines.indexOf(`## ${name}`);
  assert.notEqual(start, -1, `missing routine section: ${name}`);
  const end = routines.indexOf("\n## ", start + 4);
  return routines.slice(start, end === -1 ? undefined : end);
};

test("patient-level referral analytics view is classified as PHI-bearing and not browser-readable", () => {
  const view = viewRecord("referral_analytics");
  for (const field of ["patient_identifier", "provisional_diagnosis", "final_diagnosis", "diagnosis_category"]) {
    assert.ok(view.definition.includes(field), `expected PHI-bearing field ${field}`);
  }
  assert.equal(view.anon_select, false);
  assert.equal(view.authenticated_select, false);
  assert.equal(view.service_role_select, true);
  assert.equal(view.reloptions, null);
});

test("legacy summary view is aggregate-only but remains restricted to trusted service access", () => {
  const view = viewRecord("referral_analytics_summary");
  for (const field of ["total_referrals", "median_hours_to_acknowledge", "diagnosis_classification_percentage"]) {
    assert.ok(view.definition.includes(field));
  }
  assert.equal(view.definition.includes("patient_identifier"), false);
  assert.equal(view.anon_select, false);
  assert.equal(view.authenticated_select, false);
  assert.equal(view.service_role_select, true);
  assert.equal(view.reloptions, null);
});

test("legacy aggregate SECURITY DEFINER RPC has an administrator body check and no browser EXECUTE grant", () => {
  const sql = routineRecord("get_referral_analytics_summary()");
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path TO 'public'/);
  assert.match(sql, /public\.is_current_user_administrator\(\)/);
  assert.match(sql, /postgres=X\/postgres/);
  assert.match(sql, /service_role=X\/postgres/);
  assert.doesNotMatch(sql, /authenticated=X\/postgres|anon=X\/postgres/);
});

test("active administrator route mounts aggregate dashboard, not legacy PHI analytics components", () => {
  assert.match(app, /import AdminDashboard from "\.\/components\/dashboards\/AdminDashboard\.jsx"/);
  assert.match(app, /<AdminDashboard/);
  assert.doesNotMatch(app, /import\s+\w+\s+from\s+["'][^"']*AnalysisHub/);
  assert.doesNotMatch(app, /import\s+\w+\s+from\s+["'][^"']*AnalyticsDashboard/);
  assert.match(admin, /get_admin_referral_volume/);
  assert.doesNotMatch(admin, /get_referral_analytics_summary|\.from\(["']referral_analytics/);
});

test("legacy direct-referral query components remain dormant and are flagged for separate review", () => {
  assert.match(legacyAnalysis, /\.from\(["']referrals["']\)/);
  assert.match(legacyAnalytics, /\.from\(["']referrals["']\)/);
  assert.doesNotMatch(app, /AnalysisHub|AnalyticsDashboard/);
});


test("analytics privilege verifier is catalog-only and read-only", () => {
  assert.match(verifier, /pg_get_viewdef/);
  assert.match(verifier, /pg_get_functiondef/);
  assert.match(verifier, /has_table_privilege/);
  assert.match(verifier, /has_function_privilege/);
  const executableSql = verifier.replace(/^\\s*--.*$/gm, "");
  assert.doesNotMatch(executableSql, /\\b(CREATE|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\\b/i);
});
