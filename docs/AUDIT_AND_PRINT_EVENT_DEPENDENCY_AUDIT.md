# REFLINK audit, print-event, and privileged-RPC dependency audit

**Branch reviewed:** `reflink/phase-1-security-remediation`  
**Repository commit inspected:** `35c9193126153f9de0fd9420765ac78720c0880e`  
**Review type:** Static frontend and test-source dependency scan. No runtime database calls were made. No schema or permission changes were applied.

## Executive result

The current frontend has a narrow dependency on the two event-writing RPCs:

- `src/App.jsx` calls `log_referral_print` from the print workflow.
- `src/App.jsx` calls `log_referral_read` when opening referral details (in two code paths).

The scanned frontend files do not directly reference `audit_log`, `referral_print_events`, `referral_analytics`, `audit_referral_mutation`, or either administrator helper by name. This is a source-level finding for the inspected files, not proof that no external consumer exists (e.g. SQL policies, triggers, reporting exports, edge functions, scripts, or integrations).

The print workflow does **not** require a successful event insert to proceed with printing: `printReferralForm()` catches RPC failures, leaves the print number null, and still calls `window.print()`. The read-event calls are fire-and-forget and do not block opening the referral. These are important compatibility facts for hardening.

## Files and evidence inspected

| File | Relevant dependency observed |
|---|---|
| `src/App.jsx` | Calls `log_referral_print`, `log_referral_read`, and `get_facility_user_count`; direct table access includes `profiles`, `facilities`, `referrals`, `diagnosis_categories`, and an investigation-results Storage bucket. |
| `src/components/dashboards/AdminDashboard.jsx` | Calls `get_facility_user_counts` and five admin aggregate RPCs; direct table access includes `facilities` and `profiles`. |
| `src/components/dashboards/AnalysisHub.jsx` | Directly queries `referrals`; no audit/print table or reviewed helper references. |
| `src/components/dashboards/AnalyticsDashboard.jsx` | Directly queries `referrals`; no audit/print table or reviewed helper references. |
| `src/UserManagement.jsx` | Directly queries `users` and `facilities`; no audit/print table or reviewed helper references. |
| `src/components/notifications/NotificationCenter.jsx` and notification model/inbox files | No audit/print table or reviewed helper references. |
| `tests/migrationGovernance.test.js` | Explicitly protects migration expectations for `is_administrator`, `log_referral_print`, and `log_referral_read`. |
| `tests/securityHardeningProposal.test.js` | Enforces that DB hardening remains proposal-only and checks the planned privilege controls. |

The source scan also included `src/lib/supabase.js`, `src/lib/rphiDisclosure.js`, and `src/lib/rphiFacilityReporting.js`; no direct references to the audited objects were found there.

## Detailed call-site behavior

### 1. Print event RPC

At `src/App.jsx:980-995`:

- Calls `supabase.rpc("log_referral_print", { p_referral_id, p_copy_label })`.
- Converts the returned value to a number only when no RPC error is returned.
- Catches thrown errors and logs a warning.
- Calls the optional count callback with a number or `null`.
- Continues to `window.print()` regardless of RPC success.

**Hardening consequence:** preserve the RPC signature and return semantics initially. The server-side allocation algorithm can be made concurrency-safe without requiring a frontend behavior change. Do not make successful logging a precondition for printing without a separate product decision; the current UI explicitly tolerates logging failure.

### 2. Referral read event RPC

At `src/App.jsx:5255-5259` and `6525-6528`:

- Both referral-opening paths call `supabase.rpc("log_referral_read", { p_referral_id: referral.id })`.
- The RPC promise is intentionally not awaited.
- The selected referral opens immediately.

**Hardening consequence:** preserve the function name, argument name, and non-blocking behavior. Authorization must remain inside the database function; do not trust the frontend to enforce participant access. Confirm rejected calls do not reveal referral existence through distinguishable errors or timing.

### 3. Facility user count RPCs

- `src/App.jsx` calls `get_facility_user_count`.
- `src/components/dashboards/AdminDashboard.jsx` calls `get_facility_user_counts`.

**Hardening consequence:** these are live application dependencies. Do not blanket-revoke authenticated execution or rename/consolidate the administrator helper functions until their internal authorization, RLS/policy usage, and exact signatures are verified against the frontend and database export.

### 4. Admin aggregate RPCs

`AdminDashboard.jsx` calls:
- `get_admin_referral_volume`
- `get_admin_facility_referral_summary`
- `get_admin_lga_referral_summary`
- `get_admin_facility_reporting_coverage`
- `get_admin_referral_pathway_summary`
- `get_admin_acknowledgement_delay_alerts`

These are distinct from `get_referral_analytics_summary`. The current frontend's admin analytics path is therefore not evidence that `referral_analytics` or `get_referral_analytics_summary()` can be removed. Keep the latter under separate database-consumer review.

## Permission-remediation implications

### Print events

The current frontend calls the print RPC rather than inserting into `referral_print_events` directly in the inspected client source. This supports a design in which:
- authenticated clients lose direct INSERT/UPDATE/DELETE privileges on the print-event table;
- the narrowly scoped RPC remains the only supported client write path;
- the RPC validates referral participation and allocates the number safely;
- a unique constraint on `(referral_id, print_number)` is the final integrity control.

Before preparing an executable migration, search non-frontend consumers and inspect current RLS policies, triggers, service jobs, and any reporting/exports. Add a synthetic staging test proving the UI still prints if logging fails and the RPC still rejects unauthorized users.

### Audit log

No direct client read/write path for `audit_log` was found in the inspected frontend source. This supports removing direct authenticated table privileges, but the final read policy must still account for any administrator audit viewer, SQL-based reporting, or external compliance process. The export's authenticated SELECT grant must not be preserved merely because it exists in the snapshot. No new broad SELECT policy should be introduced.

### Administrator helper functions and analytics view

The scanned frontend calls do not directly invoke `is_administrator()`, `is_current_user_administrator()`, or `get_referral_analytics_summary()`. They may still be required by RLS policies, trigger functions, SQL RPC dependencies, or third-party consumers. Preserve their signatures until the complete database dependency graph and grant matrix is reviewed.

## Remaining dependency checks before an executable migration

1. Inspect every policy expression and trigger body for calls to the administrator helpers.
2. Inspect every function body for references to `audit_log`, `referral_print_events`, `referral_analytics`, and `get_referral_analytics_summary()`.
3. Inspect edge functions, scheduled jobs, external exports, and any server-side code not included in this scan.
4. Confirm no browser client inserts into the two event tables using dynamic table names or generic data helpers.
5. Confirm whether an administrator audit-log viewer or compliance export exists outside the scanned UI components.
6. Build the populated synthetic staging schema, then test positive and negative access for all relevant roles.
7. Run existing Node tests and the browser suite after any frontend or migration proposal change.

## Decision

**Frontend dependency evidence supports preparing a narrow print-event write restriction, but does not yet authorize an executable migration.** Preserve both event RPC contracts and current UI failure behavior. Do not change audit-log SELECT policy, helper grants, or analytics view grants until the remaining database and non-frontend dependency checks are complete.

Production remains read-only. The isolated staging database remains unchanged.
