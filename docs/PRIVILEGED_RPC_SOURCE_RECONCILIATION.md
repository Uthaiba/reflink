# Privileged RPC Source Reconciliation — Phase 1

**Review date:** 7 November 2026  
**Scope:** Git source branch `reflink/phase-1-security-remediation` at `690fe1063b1f786fbd1a0baeb29d6b42c022f79c`  
**Method:** Read-only GitHub source inspection. No Supabase connection, migration, grant, RLS, Auth, deployment or provider action was performed.

## 1. Important source-availability limitation

The live catalog review recorded five existing SECURITY DEFINER functions callable by `authenticated`:

- `public.get_facility_user_count(uuid)`
- `public.get_facility_user_counts()`
- `public.is_administrator()`
- `public.log_referral_print(uuid,text)`
- `public.log_referral_read(uuid)`

However, the seven SQL migration files present in this Phase 1 branch do not define any of these five existing functions. The branch also contains no earlier SQL migration baseline from which their current definitions can be reconstructed. The prior catalog review summarized their behavior and ACLs, but that summary is not a substitute for version-controlled function source.

**Decision:** Do not author replacement definitions or change grants based only on the summarized catalog observations. Before remediation, obtain the exact live function definitions, owners, ACLs, configuration settings, dependent functions, policies, triggers and application call sites through an approved metadata-only export. Add the reviewed definitions to source control through a separately reviewed baseline/reconciliation change.

## 2. Existing helper dependency

The prior read-only catalog review reported that `public.is_administrator()` has 12 policy dependency entries. Six reporting RPCs in the current branch call it:

- `get_admin_referral_volume(date,date)`
- `get_admin_facility_referral_summary(date,date)`
- `get_admin_lga_referral_summary(date,date)`
- `get_admin_facility_reporting_coverage(date,date)`
- `get_admin_referral_pathway_summary(date,date)`
- `get_admin_acknowledgement_delay_alerts()`

All six reporting functions are declared SECURITY DEFINER with an empty search path, explicitly check `auth.uid()` and `public.is_administrator()`, revoke execution from PUBLIC/anon, and grant execution to authenticated users. This is a meaningful caller gate, but the security of the boundary still depends on the exact live helper definition, ownership, ACL, role/profile integrity and policy dependencies.

Do not revoke authenticated execution from `is_administrator()` or replace it until all 12 recorded policy dependencies, all function dependencies, and all application call sites are mapped and regression-tested. A helper replacement must preserve the intended boolean semantics while fixing search-path and ownership concerns; it must not accidentally make policies fail closed in a way that breaks clinical workflows or fail open for any role.

## 3. Source-level observations on proposed RPCs

### 3.1 Fixed search path is consistently applied

The six reporting RPCs and the new counter-referral RPC use `SECURITY DEFINER SET search_path = ''` and schema-qualify their table/function references. This is the correct defensive pattern to preserve. It does not independently prove that the function owner has least privilege or that the caller gate is sufficient.

### 3.2 Authenticated EXECUTE is intentional but broad in surface

Each reporting RPC grants EXECUTE to `authenticated` and relies on its internal administrator check. This is acceptable only if every path checks the current authenticated subject and rejects null identity; the helper is safe and returns the expected result for the current subject; no alternate execution path bypasses the guard; and aggregate output and query parameters do not expose sensitive operational information through differencing.

The counter-referral RPC has a different contract: it grants authenticated execution but checks `receiving_staff`, a non-null facility assignment, the referral's receiving facility, and a `discharged` status while locking the referral row. Preserve the distinction between its receiving-staff authorization and the administrator-only reporting RPCs.

### 3.3 Aggregate suppression is not a complete disclosure-control proof

The reporting SQL applies primary small-cell suppression (counts 1–4) and, in selected group distributions, complementary suppression when exactly one small group exists. Pathway interval statistics require at least five valid observations.

These controls reduce direct small-cell disclosure within individual result sets. They do not, by themselves, prove protection against composition across the six different RPCs, adjacent monthly reporting periods, changes to facility registry attributes, combinations of totals/subgroup counts/interval distributions, or repeated queries by administrators with different external operational information.

Before release, test the combined reporting surface using synthetic cohorts and a documented differencing attack matrix. Consider limiting date windows, adding query auditing/rate limits, or suppressing additional groups where cross-report composition reveals a protected count. Do not describe the reporting surface as anonymous or disclosure-proof solely because each individual function suppresses counts 1–4.

### 3.4 Facility coverage is a current-registry snapshot

`get_admin_facility_reporting_coverage` combines the current `facilities.is_active` and geography fields with referral activity observed in a selected historical month. This is not a historical snapshot of facility status at that month. The output must be labelled as a current-registry classification against a historical activity window; otherwise, later registry edits can retrospectively change the interpretation of earlier periods.

### 3.5 SECURITY DEFINER ownership remains unverified

The source files declare SECURITY DEFINER but do not assign an owner. Ownership is determined by the role applying the migration. Since the migration baseline is unresolved and no disposable database has been used, the effective owner and privilege set are unknown. Do not assume that the migration runner, postgres owner, or least-privileged role will be used in production.

## 4. Required source and staging evidence

Before any privileged RPC remediation or deployment:

1. Export exact definitions for the five legacy functions and all dependent functions from the approved metadata-only catalog process.
2. Export exact ACLs, owners, proconfig/search_path, volatility, security mode and dependency graph.
3. Map all 12 `is_administrator()` policy dependency entries to their table, policy expression and operation; also enumerate function and application dependencies.
4. Identify every application caller for the five legacy RPCs and each new reporting/counter-referral RPC.
5. Reconstruct the full schema baseline before attempting to compile or apply the proposed migrations.
6. Test function ownership and grants using synthetic identities for anonymous, authenticated PHC staff, receiving staff, administrator, wrong-facility staff and service role.
7. Test direct SQL/PostgREST invocation, not only UI visibility.
8. Run cross-RPC, cross-period and cross-filter disclosure tests on synthetic data; document the attacks and mitigations.
9. Confirm that the reporting labels distinguish recorded referral activity from population need, incidence, performance and quality.
10. Re-run advisor and privilege checks after changes in a verified non-production database.

## 5. Current decision

**Blocked: exact legacy function source and dependency evidence are not in this branch; migration baseline and staging validation remain unresolved.**

This is a source-only review finding. No production object was read or changed in this turn. No SQL migration, grant, RLS policy, Auth setting, worker, provider dispatch or deployment was performed.


## 6. Application call-site inventory — 7 November 2026

A source-only search of the current branch at `ed623eb7be1dbbde02cbf1cf99bb3d8469d25197` located the following direct application callers:

| Legacy RPC | Source call site | Observed caller behaviour | Required validation |
|---|---|---|---|
| `get_facility_user_count(uuid)` | `src/App.jsx` around lines 4818 and 6183 | Called after loading the signed-in user's profile and requiring a non-null `facility_id`; the returned count populates facility user-count state. | Confirm the RPC independently binds non-admin callers to their own facility, does not disclose counts for arbitrary facility IDs, and defines treatment of inactive users. Both application paths need role/facility regression coverage. |
| `get_facility_user_counts()` | `src/components/dashboards/AdminDashboard.jsx` around line 100 | Called by the Admin Dashboard loader; results are mapped by facility ID into dashboard state. | Confirm administrator-only authorization in the function itself. UI placement or dashboard visibility is not an authorization control. |
| `log_referral_print(uuid,text)` | `src/App.jsx` around line 981 | Called before browser printing; failures are caught and printing proceeds without a print number. | Confirm caller role and referral relationship/receiving assignment, allowed copy-label values and length, and concurrent print-number allocation. Test direct RPC invocation for unauthorized and wrong-facility identities. |
| `log_referral_read(uuid)` | `src/App.jsx` around lines 5123 and 6356 | Called when opening referral details; the returned promise is not awaited and errors are not surfaced to the user. | Confirm the function rejects wrong-facility and unauthorized roles, and that audit failures are observable through safe telemetry without blocking clinical access unexpectedly. Test audit event duplication/volume and direct RPC calls. |

The two `get_facility_user_count` calls are in separate application flows and both require a profile facility assignment before invoking the RPC. This client-side precondition does not replace the function's own caller authorization. The two read-event calls use the same referral-open interaction in separate UI paths; neither client call is proof that a valid audit row was written. The print flow deliberately degrades to ordinary printing if the audit RPC fails, which should be an explicit operationally approved behaviour.

The inventory is a source search, not a proof that no dynamic, generated, external or older client calls exist. Before changing grants or definitions, supplement it with repository-wide search, database dependency metadata and any deployed-client inventory available through the approved process.

**No legacy RPC definition or grant was changed.** This inventory only narrows the application dependency map and records test requirements; exact live definitions, ownership, ACLs, policy dependencies and staging validation remain blockers.
