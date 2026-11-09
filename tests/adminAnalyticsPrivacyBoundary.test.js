import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const app = await read("../src/App.jsx");
const adminDashboard = await read("../src/components/dashboards/AdminDashboard.jsx");
const legacyAnalysisHub = await read("../src/components/dashboards/AnalysisHub.jsx");
const legacyAnalyticsDashboard = await read("../src/components/dashboards/AnalyticsDashboard.jsx");
const privilegeVerifier = await read("../supabase/verification/admin_analytics_privilege_review.sql");

const aggregateMigrations = await Promise.all([
  read("../supabase/migrations/20261105000100_admin_aggregate_referral_volume.sql"),
  read("../supabase/migrations/20261105000200_admin_lga_referral_summary.sql"),
  read("../supabase/migrations/20261105000300_admin_facility_reporting_coverage.sql"),
  read("../supabase/migrations/20261105000400_admin_referral_pathway_intelligence.sql"),
  read("../supabase/migrations/20261105000500_admin_acknowledgement_delay_alerts.sql"),
]);

test("administrator workspace re-verifies the canonical authenticated profile role", () => {
  assert.match(app, /function AdministratorRoute\(/);
  assert.match(app, /supabase\.auth\.getUser\(\)/);
  assert.match(app, /\.from\("profiles"\)/);
  assert.match(app, /\.select\("id, role"\)/);
  assert.match(app, /normalizedRole === "administrator"/);
  assert.match(app, /<AdministratorRoute>[\s\S]*?<AdminDashboard/);
});

test("active administrator dashboard uses aggregate RPCs, not direct referral-row reads", () => {
  assert.doesNotMatch(adminDashboard, /\.from\(["']referrals["']\)/i);
  assert.match(adminDashboard, /get_admin_referral_volume/);
  assert.match(adminDashboard, /get_admin_facility_referral_summary/);
  assert.match(adminDashboard, /get_admin_lga_referral_summary/);
  assert.match(adminDashboard, /get_admin_facility_reporting_coverage/);
  assert.match(adminDashboard, /get_admin_referral_pathway_summary/);
  assert.match(adminDashboard, /get_admin_acknowledgement_delay_alerts/);
  assert.match(adminDashboard, /setReferrals\(\[\]\)/);
  assert.match(adminDashboard, /Patient-level referral records are not available in the administrator workspace/);
  assert.ok(
    adminDashboard.indexOf('if (view === "referrals" || view === "active-referrals")') <
      adminDashboard.indexOf('if (\n    view ===\n    "referrals"'),
    "the privacy notice must execute before the legacy patient-level referral branch",
  );
});

test("legacy row-level analytics components remain unmounted from the administrator route", () => {
  assert.doesNotMatch(app, /from ["'][^"']*AnalysisHub/);
  assert.doesNotMatch(app, /from ["'][^"']*AnalyticsDashboard/);
  assert.doesNotMatch(adminDashboard, /from ["'][^"']*AnalysisHub/);
  assert.doesNotMatch(adminDashboard, /from ["'][^"']*AnalyticsDashboard/);

  // Guard the reason these modules must not be reintroduced without refactoring.
  assert.match(legacyAnalysisHub, /patient_identifier/);
  assert.match(legacyAnalysisHub, /patient_age_months/);
  assert.match(legacyAnalysisHub, /patient_address/);
  assert.match(legacyAnalyticsDashboard, /final_diagnosis/);
  assert.match(legacyAnalyticsDashboard, /\.from\("referrals"\)/);
});

test("administrator aggregate RPC migrations enforce server-side role and EXECUTE boundaries", () => {
  const sql = aggregateMigrations.join("\n");
  for (const functionName of [
    "get_admin_referral_volume",
    "get_admin_facility_referral_summary",
    "get_admin_lga_referral_summary",
    "get_admin_facility_reporting_coverage",
    "get_admin_referral_pathway_summary",
    "get_admin_acknowledgement_delay_alerts",
  ]) {
    assert.match(sql, new RegExp(`create (?:or replace )?function public\\.${functionName}\\(`, "i"));
  }

  for (const migration of aggregateMigrations) {
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path = ''/i);
    assert.match(migration, /auth\.uid\(\) is null or not public\.is_administrator\(\)/i);
    assert.match(migration, /revoke all on function public\./i);
    assert.match(migration, /from public/i);
    assert.match(migration, /from anon/i);
    assert.match(migration, /grant execute on function public\./i);
    assert.match(migration, /to authenticated/i);
  }
});

test("aggregate reporting enforces complete-month windows and small-cell protections", () => {
  const sql = aggregateMigrations.join("\n");
  assert.match(sql, /one complete calendar month/i);
  assert.match(sql, /between 1 and 4/);
  assert.match(sql, /complementary_suppression/i);
  assert.match(sql, /Africa\/Lagos/i);
  assert.match(sql, /coalesce\(r\.is_test, false\) = false/i);
});

test("analytics privilege verifier is read-only and checks effective execution access", () => {
  assert.match(privilegeVerifier, /READ-ONLY/i);
  assert.match(privilegeVerifier, /to_regprocedure/i);
  assert.match(privilegeVerifier, /aclexplode/i);
  assert.match(privilegeVerifier, /has_function_privilege/i);
  assert.match(privilegeVerifier, /pg_get_functiondef/i);
  assert.match(privilegeVerifier, /does not test future default privileges/i);
  assert.doesNotMatch(privilegeVerifier, /\\b(CREATE|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\\b/i);
});
