# Referral analytics view and privileged RPC security review

**Review date:** 10 November 2026  
**Evidence:** read-only catalog snapshots `docs/catalog_exports/20261107_live_public_schema_catalog.md` and `docs/catalog_exports/20261107_live_public_routines.md`, current branch source at review time, and the active application route in `src/App.jsx`.

**Boundary:** static source/catalog review only. No view or RPC was executed. No patient rows, auth-user rows, secrets or application data were queried. No production or staging database changes were made.

## Executive conclusion

The legacy analytics objects are PHI-bearing at the source-view layer, but the captured ACLs do not expose them to browser roles:

- `public.referral_analytics` includes `patient_identifier`, referral number, provisional/final diagnoses, diagnosis category/status, facility IDs, urgency, status and event timestamps.
- `public.referral_analytics_summary` returns aggregate counts, classification percentage and median workflow intervals. It contains no patient identifier or diagnosis text in its output.
- Both views have owner `postgres`, `reloptions = NULL` (no `security_invoker=true` option captured), and the catalog snapshot records SELECT false for `anon` and `authenticated`, true for `service_role`.
- `public.get_referral_analytics_summary()` is SECURITY DEFINER, uses `search_path=public`, explicitly checks `public.is_current_user_administrator()`, and reads the aggregate summary view. Its captured ACL lists only `postgres` and `service_role`; it does not list `authenticated` or `anon`.
- Therefore, the captured database state does not establish a browser-role path to these legacy views or this RPC. The service-role path remains privileged and must stay server-side; never put a service-role key in the browser.

This is a catalog snapshot, not a live assertion about the current database. Re-run the included read-only verifier before any release decision.

## Data classification

### `public.referral_analytics` — restricted, PHI-bearing

The view definition projects patient identifier and referral number alongside diagnosis and care-pathway fields. It is a derived view, not an anonymized dataset. Its current output must be treated as identifiable health information.

### `public.referral_analytics_summary` — aggregate, but not automatically disclosure-safe

The view returns counts and medians, not direct identifiers. However, aggregates can still disclose sensitive information when cohorts are very small or when repeated queries allow differencing. The captured definition does not apply a minimum cohort threshold or complementary suppression. It is a single all-referrals summary, so the immediate disclosure risk is lower than a filterable granular report, but this is not a general-purpose public-health reporting interface.

The summary also uses `percentile_cont(0.5)` on event-duration values. Validate timestamp ordering, outliers, denominator semantics and minimum cohort rules before using these indicators for policy or programme decisions.

## Privilege and execution-path review

1. Direct SELECT: captured view ACL metadata says `anon=false`, `authenticated=false`, `service_role=true` for both views.
2. RPC execution: `get_referral_analytics_summary()` captured ACL is postgres/service_role only. It is not a browser-callable authenticated RPC in the captured state.
3. RPC body: administrator check is present, but it is not a substitute for least-privilege EXECUTE grants. If authenticated EXECUTE were ever added, the admin check would need fresh synthetic role tests.
4. View semantics: `reloptions=NULL` means `security_invoker=true` was not captured. A postgres-owned view can execute with owner privileges rather than caller RLS. This reinforces the requirement to keep direct view access restricted and not treat the view as RLS-safe.
5. Service role: service_role is a trusted backend role that bypasses RLS. Its access to the PHI-bearing view is not suitable for a browser client or general analytics consumer.

## Application reachability

The active `src/App.jsx` route imports and mounts `AdminDashboard.jsx`. That dashboard's current analytics implementation uses the dedicated administrator aggregate RPCs reviewed in `docs/ADMIN_ANALYTICS_PRIVACY_BOUNDARY_REVIEW.md`; it does not use `get_referral_analytics_summary()` or directly select from either legacy analytics view.

The legacy `AnalysisHub.jsx` and `AnalyticsDashboard.jsx` source files each contain direct referral-table queries and are not imported by the reviewed active `App.jsx` route. Treat them as dormant legacy code, not as active administrator functionality. Do not mount or reconnect them without a separate authorization and PHI-minimization review.

## Required controls and staging acceptance tests

- Keep SELECT on both views unavailable to anon/authenticated; keep service-role use confined to trusted server-side code.
- Keep `get_referral_analytics_summary()` unavailable to anon/authenticated unless a deliberate new product requirement is approved and its complete call chain is tested.
- If a browser-facing aggregate is required, expose a dedicated narrow aggregate RPC with an explicit administrator check, empty/hardened search path, explicit ACLs, bounded dimensions, date-window limits, small-cell and complementary suppression, and query-rate/differencing controls.
- Verify effective privileges with `has_table_privilege` and `has_function_privilege`, not only direct ACL text.
- On reconstructed synthetic staging, test anon, authenticated PHC staff, receiving staff, administrator and service-role contexts against direct view SELECT and RPC EXECUTE.
- Test that the PHI-bearing view cannot be queried by browser roles even when a user is an administrator.
- Test the aggregate RPC with no profile, non-admin, admin, empty cohort, small cohort, zero counts, date boundaries, and repeated/differencing queries.
- Confirm the service-role key is absent from Vite/browser bundles, local storage, client logs and exposed environment variables.
- Decide whether the legacy views and RPC are still needed. If retired, remove them only after dependency tracing and a reviewed migration on synthetic staging; do not drop them based only on source search.

## Release disposition

**No immediate production ACL change is recommended from this evidence.** The captured grants already keep both views and the legacy aggregate RPC away from anon/authenticated. The main requirements are to preserve that boundary, verify effective privileges against the live catalog, keep service-role use server-side, and prevent dormant PHI-bearing components from being remounted.

This review does not certify current production state beyond the dated catalog evidence. No SQL was executed and no production or staging object was changed.


## Live production catalog recheck — 10 November 2026

A fresh read-only catalog query against the linked production project rechecked effective privileges using `has_table_privilege` and `has_function_privilege`, and retrieved only view/function definitions and catalog metadata.

| Object | anon | authenticated | service_role | Additional metadata |
|---|---:|---:|---:|---|
| `public.referral_analytics` SELECT | false | false | true | owner postgres; `reloptions=NULL` |
| `public.referral_analytics_summary` SELECT | false | false | true | owner postgres; `reloptions=NULL` |
| `public.get_referral_analytics_summary()` EXECUTE | false | false | true | SECURITY DEFINER; `search_path=public` |

The live function body still checks `public.is_current_user_administrator()` before returning the aggregate summary. The query did not invoke the RPC or read any referral rows. The live results match the 7 November snapshot for these objects.

**Interpretation:** browser roles currently have no effective direct SELECT on either view and no effective EXECUTE on the legacy summary RPC. The service-role role does have these privileges and remains a privileged backend identity. The view's owner-execution semantics remain a reason not to grant it to browser roles. This is a point-in-time privilege check, not a guarantee against future ACL/default-privilege changes.

The read-only repeatable query is committed at `supabase/verification/referral_analytics_view_privilege_review.sql`. It should be rerun after any grant, migration, view or function change.
