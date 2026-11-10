# REFLINK — Administrator Helpers and Read/Print RPC Security Review

**Review date:** 10 November 2026  
**Environment:** Connected production Supabase project; catalog-only inspection  
**Scope:** `is_administrator()`, `is_current_user_administrator()`, `log_referral_read(uuid)`, `log_referral_print(uuid,text)`  
**Safety:** No RPC was invoked against a patient referral. No patient rows were queried. No database object, ACL, Auth setting, secret, deployment or application data was changed.

## Executive findings

The four routines are owned by `postgres`, are SECURITY DEFINER and set `search_path=public`. Their inspected definitions schema-qualify the application table and auth helper references. None has effective EXECUTE for `anon`; the ACLs explicitly grant execution only to the listed trusted roles.

| Routine | anon | authenticated | service_role | Observation |
|---|---:|---:|---:|---|
| `is_administrator()` | No | Yes | Yes | Volatility is VOLATILE; used by RLS policies |
| `is_current_user_administrator()` | No | No | Yes | STABLE; same profile-role predicate |
| `log_referral_read(uuid)` | No | Yes | Yes | Inserts an audit event after a broad participant/facility check |
| `log_referral_print(uuid,text)` | No | Yes | Yes | Allocates sequence using MAX + 1; same broad facility check |

The two administrator helpers both return whether the profile whose ID equals `auth.uid()` has role `administrator`. Their different volatility and EXECUTE grants are material API differences. Do not consolidate, change volatility, or revoke grants until all application callers and database dependencies are mapped.

## 1. Administrator helper dependency and policy impact

The live `pg_depend` query found 12 dependency entries from `is_administrator()` to `pg_policy` objects. Some policies reference the helper in both USING and WITH CHECK expressions, so dependency-entry count is not the same as policy count.

The current policy inventory includes administrator checks on:
- `audit_log` SELECT
- `counter_referrals` SELECT
- `profiles` INSERT, UPDATE and SELECT
- `referral_notifications` SELECT
- `referral_print_events` SELECT
- `users` INSERT, UPDATE and SELECT

The helper is therefore part of the live authorization boundary, not an isolated convenience RPC. Revoking authenticated EXECUTE or renaming/replacing it without a dependency migration could break RLS evaluation across several application tables.

`is_administrator()` is VOLATILE while the duplicate `is_current_user_administrator()` is STABLE. The underlying query is a read-only existence check. STABLE may be a better volatility classification, but this is a performance/semantic review item, not a reason to change a live authorization helper without staging tests.

## 2. Read audit RPC

The routine:
- Requires an existing referral matching the supplied ID.
- Allows the administrator, the referring user, or any caller whose profile facility matches the referral's receiving facility.
- Inserts `actor_user_id=auth.uid()`, action `READ`, table `referrals`, record ID and a null client IP.
- Does not accept an actor ID from the caller, so the actor identity is not directly spoofable through its arguments.

Important limitations:
- The receiving-facility branch does not explicitly require `receiving_staff` role or an active assignment.
- The RPC proves that its own predicate passed; it does not prove that the caller actually retrieved or viewed the referral through the normal SELECT/RLS path. An authenticated caller can invoke the function directly for a matching referral ID and create an audit event without a corresponding read.
- Repeated calls can create repeated READ entries; no deduplication or rate control is present in the function.
- The insert writes no referral payload or diagnosis into the audit row, which is preferable to the full-row audit trigger snapshots reviewed separately.

Treat this as a caller-reported read event, not a cryptographically reliable record of successful patient-data disclosure. Do not use its counts as a definitive measure of actual chart access without a stronger server-side read boundary.

## 3. Print audit RPC

The routine:
- Applies the same administrator/referrer/receiving-facility predicate as the read RPC.
- Inserts the authenticated user as `printed_by`.
- Normalizes blank copy labels to `REFERRAL COPY`.
- Returns the allocated print number.

Findings:
- Receiving-facility access is not explicitly constrained to `receiving_staff` or an active facility assignment.
- `p_copy_label` is not length-limited or allowlisted in the routine.
- The number allocation uses `coalesce(max(print_number),0)+1` without a row lock, advisory lock or unique constraint on `(referral_id, print_number)`. Concurrent calls can allocate the same number.
- The table currently has a primary key on `id` and foreign keys to referrals and auth users, but no unique constraint on the referral/print-number pair.

A future implementation should serialize allocation on the parent referral row (or use a dedicated atomic sequence mechanism), add a unique constraint only after duplicate preflight, and validate label length/allowed values. This requires a reviewed role contract and synthetic concurrency tests first.

## 4. Search path and grants

All four functions are postgres-owned SECURITY DEFINER routines with `search_path=public`. Their inspected bodies qualify `public.profiles`, `public.referrals`, `public.audit_log`, `public.referral_print_events` and `auth.uid()`. Effective privilege checks showed no anon EXECUTE. The authenticated grants are limited to the administrator predicate helper and the two logging RPCs; `is_current_user_administrator()` is service_role-only.

No grant changes are recommended from this review. The SECURITY DEFINER functions are intentionally callable only through the current ACLs, and the helper is a dependency of RLS policies. A later hardening migration should consider an empty search path with fully qualified references, but must be staged and dependency-tested.

## Required decisions before remediation

1. Confirm whether receiving-facility users other than `receiving_staff` are ever permitted to read or print a referral, and how active facility assignment is represented.
2. Decide whether read audit entries are intended to represent client-reported read attempts or confirmed successful reads.
3. Approve a copy-label allowlist and maximum length.
4. Approve a print-number serialization strategy and duplicate-number remediation plan.
5. Reconstruct the production migration baseline and establish an isolated synthetic PostgreSQL environment before changing function definitions, grants or constraints.

## Verification performed

- Queried `pg_proc` for owner, SECURITY DEFINER, volatility, function settings and full definitions.
- Queried `has_function_privilege` for anon, authenticated and service_role.
- Queried explicit function ACLs.
- Queried `pg_depend` for policy dependencies on the administrator helper.
- Queried `pg_policies` for the current policy expressions.
- Queried audit-log column metadata and print-event constraints.
- No patient-level SELECT, function invocation or DDL/DML was performed.

## Release boundary

This is a production catalog review only. It is not a PostgreSQL integration test and does not certify runtime behavior under synthetic identities. No production or staging changes were made. PR #1 remains draft and unmerged.
