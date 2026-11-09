# REFLINK administrator analytics privacy-boundary review

**Status:** Source review and remediation requirements. No application code, database object, grant, or production data was changed.  
**Reviewed branch:** reflink/phase-1-security-remediation  
**Production boundary:** Production remains read-only.

## 1. Executive result

The current administrator route is materially safer than the legacy analytics components suggest:

- `src/App.jsx` renders `AdminDashboard` only for the Administrator workspace and wraps it in `AdministratorRoute`.
- `AdministratorRoute` calls `supabase.auth.getUser()`, then verifies the current user's canonical `profiles.role` is `administrator`. This is a client-side route gate and must not be treated as the database authorization boundary.
- The current `src/components/dashboards/AdminDashboard.jsx` does not import or render `AnalysisHub` or `AnalyticsDashboard`. Its reporting view calls dedicated aggregate RPCs, including `get_admin_referral_volume`, `get_admin_facility_referral_summary`, `get_admin_lga_referral_summary`, `get_admin_facility_reporting_coverage`, and `get_admin_referral_pathway_summary`.
- The reviewed aggregate SQL functions are `SECURITY DEFINER`, set an empty search path, check `auth.uid()` and `public.is_administrator()`, revoke execution from `PUBLIC` and `anon`, and grant execution to `authenticated`. Their return contracts are aggregate-only rather than patient-level rows.

**Important correction:** The legacy `AnalysisHub.jsx` source contains a broad direct query against `public.referrals`, including patient identifiers, age, sex, address, diagnoses, and facility data. `AnalyticsDashboard.jsx` also directly queries referral-level diagnosis fields. However, neither component is imported by the current `App.jsx` or `AdminDashboard.jsx` route inspected in this review. Treat these as dormant/legacy components, not evidence that the active administrator workspace currently mounts them. They remain a risk if reintroduced without a privacy review.

## 2. Current administrator route

The route in `src/App.jsx`:
1. Obtains the current authenticated user with `supabase.auth.getUser()`.
2. Reads the user's profile role from `public.profiles`.
3. Allows the administrator workspace only when the canonical role equals `administrator`.
4. Renders `AdminDashboard` inside the route guard.

This protects the UI from accidental role-state manipulation but does not secure an RPC or table by itself. Every privileged database function must enforce authorization independently. The aggregate functions reviewed do so through the authenticated UID and canonical administrator check.

The client-side gate is not a substitute for RLS, EXECUTE ACLs, and server-side authorization.

## 3. Active aggregate reporting path

The current administrator reporting component calls dedicated RPCs rather than downloading referral rows and aggregating them in JavaScript:

| RPC | Purpose | Privacy characteristics in reviewed SQL |
|---|---|---|
| `get_admin_referral_volume(date,date)` | Monthly referral and lifecycle counts, chronology anomalies | One aggregate result; small counts 1–4 suppressed |
| `get_admin_facility_referral_summary(date,date)` | Facility-level monthly counts | Aggregate output; inspect suppression and re-identification controls before expanding |
| `get_admin_lga_referral_summary(date,date)` | Sending/receiving LGA activity | No patient or facility identifiers; small-cell and complementary suppression |
| `get_admin_facility_reporting_coverage(date,date)` | Facility reporting participation | Aggregate reporting; verify output granularity and suppression in its defining migration |
| `get_admin_referral_pathway_summary(date,date)` | Facility-type pathway and timing metrics | No facility/patient/user identifiers; small-cell and interval-sample suppression |

The UI restricts these reports to complete calendar months and explains that overlapping date ranges are not available. The server functions also validate complete-month boundaries. This reduces straightforward differencing through arbitrary overlapping date windows, but does not eliminate all inference risk from repeated queries, external auxiliary data, rare categories, or future report dimensions.

Do not increase reporting granularity or add arbitrary filters without a formal disclosure-risk review.

## 4. Legacy components requiring quarantine or refactor

### `src/components/dashboards/AnalysisHub.jsx`

The component directly selects:
- referral number and patient identifier;
- patient age and sex;
- patient address;
- diagnosis category/status and provisional/final diagnosis;
- urgency/status and timestamps;
- referring and receiving facility information.

It then performs browser-side grouping, filtering, and report/export construction. Its search logic includes patient identifiers. Even if RLS currently restricts which referrals can be read, this is not an appropriate pattern for a network-level public-health analytics workspace: it transfers row-level and potentially identifying data to the browser.

**Required action before reuse:** replace its row-level query with approved aggregate RPCs and privacy-reviewed outputs. If a particular clinical workflow genuinely needs patient-level records, keep it in the role- and facility-scoped clinical workspace, not the network analytics module.

### `src/components/dashboards/AnalyticsDashboard.jsx`

This component directly queries referrals and retrieves final/provisional diagnosis values for browser-side aggregation. It is also not imported by the current administrator route inspected here. Do not mount it in the administrator workspace until it is refactored to use aggregate server-side functions.

### Quarantine recommendation

Do not delete either component in this security phase: that could break an undiscovered route or downstream integration. Keep them unmounted, add regression checks that the current administrator route does not import them, and schedule a separate dependency/usage search before removal or refactoring.

## 5. Aggregate-function security checklist

For each current and future administrator reporting RPC:
- Use `SECURITY DEFINER` only where needed; prefer invoker security when the function can operate safely under caller RLS.
- Set `search_path = ''` and schema-qualify every non-catalog object.
- Require `auth.uid() IS NOT NULL` and verify the canonical administrator profile in the function body.
- Revoke EXECUTE from `PUBLIC` and `anon`; grant only to the intended authenticated role.
- Return only the minimum aggregate fields required by the UI.
- Avoid patient identifiers, referral IDs/numbers, facility IDs/names, free text, exact dates/timestamps, and rare clinical labels unless separately justified and approved.
- Apply primary and complementary suppression; review whether multiple dimensions or repeated queries can reconstruct suppressed cells.
- Define the minimum cohort threshold, time window, geographic granularity, and query cadence in policy.
- Add synthetic tests for administrator, PHC staff, receiving staff, anonymous, and service-role behavior.
- Verify effective EXECUTE privileges with `has_function_privilege`, not ACL text alone.
- Verify every aggregate query's joins, filters, timezone boundaries, denominator, and test-record exclusion.
- State explicitly that referral activity is not disease incidence, population prevalence, unmet need, or quality of care.

## 6. Required next tests and implementation sequence

1. Add source-contract tests proving the current administrator dashboard uses the approved aggregate RPC surface and does not import legacy row-level analytics components.
2. Add/extend SQL verification for the aggregate functions' owner, `prosecdef`, `proconfig`, ACLs, and effective privileges.
3. Review the complete SQL definitions for facility summary and facility reporting coverage, including suppression and small-cell behavior.
4. Build synthetic test cases with small groups, rare categories, missing facility geography, cross-month boundaries, test referrals, and invalid chronology.
5. Conduct a query-composition review for differencing across all aggregate endpoints and reporting periods.
6. Only after the full baseline is reconstructed and staging is authorized, run integration tests in synthetic staging.
7. Keep production read-only until the change set, clinical governance, and disclosure-risk review are approved.

## 7. Decision

**Current administrator aggregate reporting is the preferred architecture and should be preserved.** The legacy row-level analytics components should remain unmounted until refactored. No production migration or application deployment is approved by this review.
