# Staging Baseline Reconstruction Runbook

**Status:** Preparation only — NOT approved for execution  
**Target:** Isolated Supabase project `reflink-synthetic-staging` (`rcskuzmvyugbanygizri`)  
**Source artifact:** `reflink-production-schema.sql`  
**Source SHA-256:** `72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3`  
**Source size:** 64,434 bytes / 1,612 lines  
**Production safety:** Production project `uwwzbljufqbzkjflpnll` is read-only and out of scope.

## 1. Purpose and limits

Create a reproducible, reviewable staging schema baseline from the supplied current-state public-schema export. This is a **new baseline derived from a schema snapshot**, not recovery of the missing historical migration `20260928203447_reflink_v2_rural_first`. The historical SQL source remains unavailable.

The export contains no standalone table-data INSERT/COPY statements. It is not a full Supabase project backup: it does not recreate Auth users, Storage objects/buckets/policies, Realtime publication membership, project Auth settings, secrets, edge functions, or every managed-schema object. Do not describe it as a full environment restore.

No DDL has been applied to staging as part of this preparation. Staging was confirmed healthy and empty in `public`, with an empty migration ledger.

## 2. Verified environment compatibility

| Item | Production snapshot / prior read-only inventory | Staging observation | Assessment |
|---|---|---|---|
| PostgreSQL major | 17 | 17.11.0.018 | Same major; still validate restore behavior |
| `pgcrypto` | 1.3 installed | 1.3 installed in `extensions` | Required dependency available |
| `uuid-ossp` | 1.1 installed | 1.1 installed in `extensions` | Available; confirm whether export uses it |
| `plpgsql` | 1.0 | 1.0 installed | Available |
| `supabase_vault` | 0.3.1 | 0.3.1 installed in `vault` | Platform extension present; not a public-schema restore target |
| `pg_stat_statements` | 1.11 | 1.11 installed in `extensions` | Platform extension present |
| Public app tables | 14 in export | 0 | Empty target confirmed |
| Migration ledger | one historical version on production | 0 | Empty target confirmed |

Staging has many additional extensions available but not installed. Do not install optional extensions merely because they are available. Install only a dependency proven necessary by the schema and reviewed restore plan.

## 3. Restore dependency inventory

### Supabase-managed dependencies

The schema depends on the managed `auth` schema and functions, notably `auth.uid()`, and on platform roles including `anon`, `authenticated`, `service_role`, `postgres`, and `pg_database_owner`. The export does not create these roles or Auth objects. Read-only staging catalog inspection confirmed all six roles (`anon`, `authenticated`, `service_role`, `postgres`, `pg_database_owner`, `supabase_admin`) and the `auth`, `public`, `extensions`, and `vault` schemas exist. `auth` and `vault` are owned by `supabase_admin`; `public` is owned by `pg_database_owner`; `extensions` is owned by `postgres`. The role attributes show `postgres` and `supabase_admin` are privileged platform roles and `service_role` has BYPASSRLS. Keep these managed roles/schemas intact.

The `handle_new_user()` function is a SECURITY DEFINER trigger function intended to participate in Auth user provisioning. The export's public-schema trigger definitions must be inspected alongside the managed Auth trigger state. Read-only inspection found **no non-internal trigger on staging `auth.users`**. This means the staging project does not currently mirror any production Auth provisioning hook. Do not create one from assumption: first retrieve and review the exact intended production trigger definition and validate signup behavior in staging.

### Extensions and built-ins

- UUID defaults use `gen_random_uuid()`; staging's installed `pgcrypto` is available.
- The dump uses standard PostgreSQL types/functions including `uuid`, `jsonb`, `inet`, `now()`, identity columns, and PL/pgSQL.
- No `CREATE EXTENSION` statements are present in the export.
- The snapshot's extension schema placement and function resolution must be checked with the actual staging search path and extension catalog before execution.

### Object and dependency order

The export defines 16 public functions, 14 public tables, 2 views, 10 explicit indexes, 23 foreign keys, 9 triggers, and 30 RLS policies. A reviewed restore candidate should be applied in this order:

1. Preflight managed roles, schemas, Auth functions, extension versions/schemas, ownership capabilities, and clean target state.
2. Create/confirm the public schema and required functions whose dependencies are available.
3. Create tables and identity sequences.
4. Add primary/unique/check constraints and foreign keys after all referenced tables exist.
5. Create indexes.
6. Create views only after their base tables exist; review view security semantics before granting access.
7. Apply table and sequence ownership/ACLs only where the staging role model permits them.
8. Enable RLS on every exposed public table, then create and verify each policy.
9. Create table triggers after their functions and tables exist.
10. Apply function EXECUTE grants and narrowly scoped schema/table/sequence grants.
11. Apply reviewed default privileges only after resolving the production-vs-snapshot discrepancy below.
12. Run catalog assertions, Supabase security/performance advisors, and application-level smoke tests.

This is a dependency order, not executable SQL.

## 4. Mandatory blockers before any restore

### A. Default-privilege discrepancy

The dump includes default-privilege statements for `postgres` only. Read-only staging catalog inspection independently confirmed broad public-schema default ACLs for both `postgres` and `supabase_admin`, granting `anon`, `authenticated`, and `service_role` broad default rights on future sequences, functions, and tables. Prior live production inspection found the same pattern. The dump therefore does not fully represent the observed production default-privilege state.

Do not blindly replay the dump's broad default grants to `anon` and `authenticated`. Reconcile effective default ACLs for each object-creating role against a documented least-privilege target. Do not attempt to alter `supabase_admin` defaults unless the connected role is demonstrably authorized.

### B. View security semantics

The exported `referral_analytics` view includes patient identifiers and diagnosis information; the export does not show `security_invoker = true`. Its explicit grant is service-role-only. The `referral_analytics_summary` view is also service-role-only. Confirm view options, owners, effective grants, and RLS behavior on staging. Never broaden view access to `anon` or `authenticated` during baseline restoration. Treat any decision to change view security mode as a separate reviewed security change, not a silent restore edit.

### C. Auth trigger and function security

Several functions are SECURITY DEFINER and owned by `postgres`. Preserve their exact bodies only after reviewing their `search_path`, authorization checks, and required grants. Verify the Auth user-provisioning trigger separately; do not create or duplicate it from assumption.

### D. Ownership and grants

The dump contains ownership statements targeting `postgres`, and schema ownership targeting `pg_database_owner`. Confirm staging execution role can perform these operations. If not, produce a controlled owner/ACL adaptation with a line-by-line diff; do not remove ownership statements indiscriminately or replace them with broad grants.

### E. Sensitive-data and identity model

No production data should be imported. Use synthetic identities and synthetic referral records only. The export contains both `profiles` and `users`; document and test the authoritative identity/authorization source before enabling application integration.

## 5. Required preflight checks

Before staging DDL is authorized, capture and review:

- Project ref, PostgreSQL version, and clean public-schema state.
- Existence and attributes of required roles and managed schemas/functions.
- Installed extension names, versions, and schemas.
- Whether the current execution role can create/alter objects and set intended ownership.
- Current staging default ACLs: `postgres` and `supabase_admin` both have broad public-schema defaults (tables, sequences, functions); reconcile to least privilege before baseline application.
- Existing Auth triggers on `auth.users` (read-only inspection).
- Whether the dump's view definitions preserve expected privacy boundaries.
- Exact object inventory and dependency graph.
- A parser/restore dry run against a disposable local PostgreSQL 17 + Supabase-compatible environment, followed by SQL review.

## 6. Post-restore acceptance gates

A staging restore is not complete until all gates pass:

1. Object counts reconcile: 14 tables, 16 functions, 2 views, 10 explicit indexes, 23 FKs, 9 triggers, 30 policies.
2. All 14 public tables have RLS enabled.
3. No unexpected public/anon/authenticated access exists on analytics views or audit records.
4. Function owners, SECURITY DEFINER flags, safe search paths, and EXECUTE grants match the reviewed manifest.
5. All constraints, indexes, triggers, and FK dependencies are valid.
6. Identity columns/sequences work and sequence grants are least-privilege.
7. Auth signup provisioning works without duplicate triggers or privilege escalation.
8. Synthetic PHC, receiving-facility, and administrator workflows pass with negative cross-facility access tests.
9. Referral state transitions, counter-referral completion guard, audit behavior, and notification access pass tests.
10. Supabase security/performance advisors are reviewed and all high-risk findings are resolved or explicitly accepted.
11. Application smoke tests run against staging only; no production endpoint or credential is used.
12. Staging restore procedure is repeatable from a fresh empty staging database.

## 7. Execution controls

- This runbook does not authorize production changes.
- No production SQL, migrations, grants, Auth settings, Storage changes, or data changes are permitted.
- Do not import patient data, user records, tokens, secrets, Storage objects, or production Auth data.
- Do not execute the raw export as-is until all blockers above are resolved.
- Any staging DDL execution requires an explicitly reviewed candidate SQL artifact, a recorded preflight, a rollback/recreate plan, and a post-restore verification report.
- Keep the historical migration ledger distinction explicit: a new baseline migration records a new reconstruction point; it does not recreate the missing historical source.

## 8. Current decision

**NO-GO for applying the raw export.** Staging is healthy and empty, required platform roles/schemas and key extension versions are present, but no Auth user trigger exists in staging, broad default ACLs are present for both `postgres` and `supabase_admin`, and view security/ownership behavior still require explicit review. The next engineering deliverable is a normalized, staging-only baseline candidate plus a deterministic catalog verification script—not a production migration. The next engineering deliverable is a normalized, staging-only baseline candidate plus a deterministic catalog verification script—not a production migration.
