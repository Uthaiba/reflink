# Privileged RPC Source Reconciliation — Phase 1

**Review date:** 7 November 2026  
**Scope:** Git source branch `reflink/phase-1-security-remediation` at reviewed source snapshot `d3c6c24e22eb426760065754bfef842911880542`  
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

A source-only search of the reviewed source snapshot `d3c6c24e22eb426760065754bfef842911880542` located the following direct application callers. The line numbers below are from that exact snapshot:

| Legacy RPC | Source call site | Observed caller behaviour | Required validation |
|---|---|---|---|
| `get_facility_user_count(uuid)` | `src/App.jsx` at lines 4821 and 6186 | Called after loading the signed-in user's profile and requiring a non-null `facility_id`; the returned count populates facility user-count state. | Confirm the RPC independently binds non-admin callers to their own facility, does not disclose counts for arbitrary facility IDs, and defines treatment of inactive users. Both application paths need role/facility regression coverage. |
| `get_facility_user_counts()` | `src/components/dashboards/AdminDashboard.jsx` at line 100 | Called by the Admin Dashboard loader; results are mapped by facility ID into dashboard state. | Confirm administrator-only authorization in the function itself. UI placement or dashboard visibility is not an authorization control. |
| `log_referral_print(uuid,text)` | `src/App.jsx` at line 981 | Called before browser printing; failures are caught and printing proceeds without a print number. | Confirm caller role and referral relationship/receiving assignment, allowed copy-label values and length, and concurrent print-number allocation. Test direct RPC invocation for unauthorized and wrong-facility identities. |
| `log_referral_read(uuid)` | `src/App.jsx` at lines 5123 and 6356 | Called when opening referral details; the returned promise is not awaited and errors are not surfaced to the user. | Confirm the function rejects wrong-facility and unauthorized roles, and that audit failures are observable through safe telemetry without blocking clinical access unexpectedly. Test audit event duplication/volume and direct RPC calls. |

The two `get_facility_user_count` calls are in separate application flows and both require a profile facility assignment before invoking the RPC. This client-side precondition does not replace the function's own caller authorization. The two read-event calls use the same referral-open interaction in separate UI paths; neither client call is proof that a valid audit row was written. The print flow deliberately degrades to ordinary printing if the audit RPC fails, which should be an explicit operationally approved behaviour.

The inventory is a source search, not a proof that no dynamic, generated, external or older client calls exist. Before changing grants or definitions, supplement it with repository-wide search, database dependency metadata and any deployed-client inventory available through the approved process.

**No legacy RPC definition or grant was changed.** This inventory only narrows the application dependency map and records test requirements; exact live definitions, ownership, ACLs, policy dependencies and staging validation remain blockers.


## 7. Snapshot verification and remaining boundaries

The reviewed snapshot is the exact Phase 1 branch head recorded on 7 November 2026. The application call-site line references above were checked against the files at that commit, not inferred from an earlier search result. The review remains source-only: it cannot establish that the live database objects match these proposed SQL files, that the five legacy RPCs have safe live definitions, or that any SECURITY DEFINER function is owned by a least-privileged role.

The source review found no reason to fabricate the missing legacy function definitions or alter their grants. The correct next action for those blockers is still an approved metadata-only export and a verified disposable/non-production database after baseline reconciliation. Until then, keep the proposed SQL migrations unapplied and PR #1 unmerged.


## 8. Live catalog metadata export — 7 November 2026

**Evidence source:** read-only PostgreSQL catalog queries against the linked REFLINK project. Queries returned function metadata/definitions, role attributes, schema privileges, policy expressions, trigger metadata and index definitions only. No patient-level or application rows were queried. No database object, ACL, policy, migration ledger entry or deployment was changed.

### 8.1 Exact live legacy function metadata

All five legacy functions exist in the live public schema, are owned by `postgres`, and are SECURITY DEFINER. The owner role is not a superuser but **does have BYPASSRLS**. Therefore, each function executes with a role that bypasses row-level security. The authorization logic inside each function is the effective control; RLS cannot be assumed to protect operations performed by these functions.

| Function | Language | Search path | anon EXECUTE | authenticated EXECUTE | service_role EXECUTE |
|---|---|---|---:|---:|---:|
| `get_facility_user_count(uuid)` | PL/pgSQL | empty (`search_path=""`) | No | Yes | Yes |
| `get_facility_user_counts()` | PL/pgSQL | `public` | No | Yes | Yes |
| `is_administrator()` | SQL | `public` | No | Yes | Yes |
| `log_referral_print(uuid,text)` | PL/pgSQL | `public` | No | Yes | Yes |
| `log_referral_read(uuid)` | PL/pgSQL | `public` | No | Yes | Yes |

The explicit ACLs include the owner, authenticated and service_role; effective privilege checks confirmed anon cannot execute any of the five functions. Authenticated can execute all five, so every internal authorization check is security-critical.

### 8.2 Function-by-function authorization review

- **`get_facility_user_count(uuid)`:** requires non-null `auth.uid()`; loads the caller's profile role and facility; non-administrators can only request their own non-null facility ID; administrators can request any facility ID. The function normalizes role using `lower(trim(role))`. It uses an empty search path. The query counts profiles assigned to the requested facility.
- **`get_facility_user_counts()`:** loads the caller's normalized role and rejects unless it is `administrator`; returns grouped user counts by non-null facility. It uses `search_path=public`. There is no explicit `auth.uid() IS NOT NULL` statement, but a null identity produces no matching profile and a null role, which is rejected.
- **`is_administrator()`:** returns whether a profile exists for `auth.uid()` with role exactly equal to `administrator`. It uses `search_path=public`. The role comparison is case-sensitive and does not normalize whitespace, unlike the two facility-count functions. The live `profiles_role_check` constraint restricts role values to exactly `phc_staff`, `receiving_staff`, and `administrator`, so canonical values are enforced for ordinary table writes. Preserve this invariant and test it before changing helper semantics.
- **`log_referral_print(uuid,text)`:** permits the administrator, the referral's `referring_user_id`, or a user whose profile facility equals the referral's `receiving_facility_id`. It then calculates `max(print_number)+1`, inserts the print event and returns the number. The table's catalog indexes show a primary key on `id` and a non-unique index on `(referral_id, created_at DESC)`; there is no unique index on `(referral_id, print_number)`. Concurrent calls can therefore allocate duplicate print numbers. The copy label is not length-bounded or allowlisted in the function.
- **`log_referral_read(uuid)`:** uses the same administrator/referrer/receiving-facility authorization predicate and inserts a READ audit event. It uses `search_path=public`. It does not return an audit identifier or prove to the client that the write succeeded.

For both logging RPCs, the receiving-side authorization is based on facility assignment and does not independently check the caller's profile role. Confirm whether every account assigned to a receiving facility is intentionally allowed to print/read referral records, or whether the intended contract is limited to specified clinical roles. The UI's role and facility checks are not a substitute for this database decision.

### 8.3 Actual helper dependencies

The live `is_administrator()` helper has **12 catalog dependency entries across 10 distinct RLS policies**. The two additional dependency entries arise because the profiles and users update policies reference the helper in both USING and WITH CHECK expressions.

| Table | Policy |
|---|---|
| `profiles` | Administrators can view all profiles |
| `profiles` | Administrators can create profiles |
| `profiles` | Administrators can update profiles (USING and WITH CHECK) |
| `users` | Administrators can view users |
| `users` | Administrators can insert users |
| `users` | Administrators can update users (USING and WITH CHECK) |
| `referral_notifications` | Admins can view notification log |
| `counter_referrals` | Participants can view counter referrals |
| `audit_log` | Administrators can view audit log |
| `referral_print_events` | Participants can view print history |

The helper is also called by the live `public.log_referral_print(uuid,text)`, `public.log_referral_read(uuid)`, and the non-SECURITY-DEFINER trigger function `public.guard_profile_security_fields()`. The latter is attached as a BEFORE UPDATE trigger on `public.profiles`; its function owner is postgres, it is SECURITY INVOKER, and it pins an empty search path. The trigger rejects non-administrator changes to protected profile fields, while allowing trusted database/service-role operations.

The catalog shows `public` CREATE privilege is false for anon, authenticated and service_role; only postgres has CREATE. This reduces the immediate ability of API roles to plant shadow objects in public, but does not remove the benefit of an empty search path for privileged functions.

### 8.4 Remediation priorities — source and staging only

1. Preserve the current authorization contracts while adding explicit regression cases for unauthenticated, wrong-role, wrong-facility, own-referral and administrator calls.
2. Review and then harden the four legacy functions that currently use `search_path=public` to an empty search path, retaining schema-qualified references and verifying the function bodies compile and behave identically.
3. Resolve the role canonicalization mismatch in `is_administrator()` only after confirming the live profile role constraint and actual stored role vocabulary. Do not silently broaden administrator matching.
4. Decide and document the intended receiving-side roles for `log_referral_print` and `log_referral_read`.
5. Fix print-number allocation with a transaction-safe allocation strategy and a verified unique constraint/index, after checking existing duplicate numbers and staging migration feasibility. Do not apply DDL to production from this source-only review.
6. Add a bounded/allowlisted copy-label contract and tests.
7. Preserve and test all 12 helper dependency entries across 10 policies and the three function/trigger callers before any helper replacement or grant change.
8. Test the SECURITY DEFINER owner and BYPASSRLS behavior explicitly in a disposable synthetic-data database; do not assume RLS protects privileged function internals.

**Current disposition:** the metadata gap is now closed for these five live functions, but remediation is not authorized by this evidence export. Migration baseline reconciliation, role/assignment semantics, synthetic staging and direct RPC authorization tests remain release blockers. No production changes were made.


### 8.5 Security advisor snapshot

The Supabase security advisor returned five warnings for the five authenticated-callable SECURITY DEFINER RPCs documented above. These warnings identify privileged RPC exposure, not proof of an authorization bypass; each function has an internal caller check and anon EXECUTE is false. The advisor also returned:
- two INFO findings for `public.referral_events` and `public.referral_feedback`: RLS is enabled but neither table has a policy. This is fail-closed for ordinary roles, but the intended future read/write workflows must be documented before policies are added.
- one WARN finding: Supabase Auth leaked-password protection is disabled. This requires a separately reviewed Auth configuration change; it was not changed during this source/metadata review.

Remediation links:
- [Authenticated SECURITY DEFINER RPC advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [RLS enabled with no policies advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Leaked-password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)



### 8.6 Audit trigger stores full row snapshots

The live `public.audit_referral_mutation()` function is SECURITY DEFINER, owned by postgres, has `search_path=public`, and is attached to INSERT/UPDATE/DELETE triggers on both `public.referrals` and `public.counter_referrals`. It writes `to_jsonb(NEW)` and/or `to_jsonb(OLD)` into `public.audit_log.new_data` and `old_data`.

This means the audit table stores full row snapshots, including any patient identifiers and clinical fields present in the referral/counter-referral records. The live `audit_log` SELECT policy is administrator-only; authenticated has table SELECT privilege but ordinary non-admin rows are filtered by RLS. The function owner has BYPASSRLS, and the trigger's SECURITY DEFINER execution is what allows audit writes to proceed independently of caller table policies.

No audit-log rows were queried. The catalog evidence establishes the storage behavior, not the actual patient data contained in existing audit rows.

**Required privacy governance:** define the minimum fields needed for clinical/legal audit, access logging for audit-log reads, retention and secure deletion periods, backup retention, encryption at rest/in transit, export controls, and the process for handling patient access/deletion requests where legally applicable. Do not remove full snapshots or alter the audit trigger without clinical governance and legal-retention review. The function's `search_path=public` should be hardened to an empty path in the reconciled source baseline after validating all references and trigger behavior in synthetic staging.
