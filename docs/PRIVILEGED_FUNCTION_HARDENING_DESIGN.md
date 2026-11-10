# REFLINK privileged-function hardening design

**Status:** Design proposal only — not an executable migration.

**Source reviewed:** `reflink-production-schema.sql`, SHA-256 `72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3`.

**Environment boundary:** Production remains read-only. The isolated staging project currently has no REFLINK public tables or functions, so function behavior cannot yet be integration-tested there. This document does not authorize applying SQL to either project.

## 1. Design decisions

| Area | Proposed control | Acceptance condition |
|---|---|---|
| Definer search path | Use `SET search_path = pg_catalog` for reviewed SECURITY DEFINER functions; schema-qualify every application and Auth object. | Catalog confirms exact path; static scan finds no unqualified non-catalog object references. |
| Definer ownership | Keep privileged functions owned by a trusted migration/database owner, never an application login. | `proowner` and `prosecdef` verified after restore. |
| Function execution grants | Revoke PUBLIC execution explicitly; grant only intended RPC functions to authenticated/service_role. Trigger-only functions receive no client EXECUTE grant unless a documented requirement exists. | Catalog grant matrix matches approved list. |
| Audit data | Replace complete OLD/NEW JSON snapshots with a minimal operational audit record by default. | Test payloads contain no patient identifier, free-text complaint, findings, diagnosis, treatment, or other clinical narrative. |
| Print numbering | Serialize number allocation per referral with a transaction-scoped advisory lock and enforce a unique database constraint on `(referral_id, print_number)`. | Concurrent integration test proves no duplicates; direct client writes cannot bypass allocator. |
| Analytics | Keep analytics behind a single approved administrator RPC; review view owner/security-invoker behavior and direct grants. | Non-admin and unauthenticated callers cannot read the view or invoke the summary RPC. |
| Audit table permissions | Remove powerful direct table privileges from authenticated clients. | Authenticated role cannot TRUNCATE, alter triggers, or write/delete audit records directly. |

## 2. Hardened SECURITY DEFINER template

Apply only after confirming all object references and grants for each function. This is a template, not a blanket automated rewrite:

```sql
CREATE OR REPLACE FUNCTION public.example_privileged_function(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Qualify every non-pg_catalog reference:
  -- public.some_table, public.some_helper(...), auth.uid()
  ...
END;
$function$;
```

Do not rely on an assumed search path for `auth.uid()`, application tables, custom types, or helper functions. Preserve exact function signatures, volatility, trigger semantics, return types, and error behavior unless separately approved and tested.

## 3. Audit mutation redesign

### Current risk

`public.audit_referral_mutation()` stores `to_jsonb(NEW)` and `to_jsonb(OLD)` for INSERT, UPDATE, and DELETE. It is attached to `public.referrals` and `public.counter_referrals`. Those rows can contain direct identifiers and sensitive clinical information.

### Proposed default

Keep the audit event metadata:
- actor identifier (nullable for system-originated operations),
- action,
- table name,
- record identifier,
- timestamp,
- optionally a validated system actor/source label in a separately reviewed schema change.

Do not store whole row snapshots. If a before/after diff is a genuine operational requirement, create a strict per-table allowlist after data-protection review. Never include patient identifiers, chief complaint, physical findings, diagnosis, treatment, or free-text notes by default.

### Important implementation note

The existing `audit_log` schema has `old_data` and `new_data` JSONB columns. They may remain nullable for compatibility during transition, but the revised trigger should leave them NULL. A later schema cleanup can be considered only after all consumers, exports, retention rules, and audit review workflows are inspected.

### Audit access issue found in the export

The export grants `authenticated` SELECT, REFERENCES, TRIGGER, TRUNCATE, and MAINTAIN on `public.audit_log`, plus sequence privileges. RLS does not constrain TRUNCATE and does not make trigger/maintenance privileges safe. The policy “Administrators can view audit log” does not compensate for these table-level privileges.

**Required correction:** authenticated clients should receive only the minimum approved read privilege (if any), with RLS restricting rows. Prefer administrator-only SELECT; no client INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN. Sequence access should be limited to the trusted writer. Verify service-role and database-owner access separately.

## 4. Print-number concurrency redesign

### Current risk

`log_referral_print(uuid,text)` computes `MAX(print_number)+1` and inserts the event. Concurrent requests for the same referral can calculate the same number. The export has no unique constraint on `(referral_id, print_number)`.

### Proposed allocation algorithm

Within the function transaction:
1. Validate that the caller is an administrator, the referring user, or a member of the receiving facility.
2. Acquire a transaction-scoped advisory lock derived from the referral UUID. Use a fixed, documented lock-key namespace and a stable UUID-to-bigint hash; hash collisions may serialize unrelated referrals but must never weaken correctness.
3. Read the current maximum print number for that referral.
4. Insert the next number and return it.
5. Add a unique constraint/index on `(referral_id, print_number)` as the final integrity guard.

The advisory lock only protects callers that use this allocator. The export currently grants ALL on `referral_print_events` to `authenticated`; direct client INSERT can bypass the function. Revoke direct write privileges from authenticated clients and keep the RPC as the sole supported write path, unless a reviewed application requirement proves otherwise.

Before implementation, inspect frontend code to confirm no direct inserts/updates/deletes depend on those grants. Test concurrent RPC calls, transaction rollback, and repeated requests.

## 5. Function-by-function hardening disposition

| Function | Proposed disposition |
|---|---|
| `audit_referral_mutation()` | Rewrite to minimal metadata; `search_path=pg_catalog`; trigger-only invocation; do not grant client EXECUTE. |
| `get_facility_user_count(uuid)` | Retain empty/hardened path; qualify `auth.uid()`; retain facility/administrator authorization; review whether authenticated and service-role execution are both needed. |
| `get_facility_user_counts()` | Harden path; require authenticated administrator explicitly; grant only authenticated/service_role if UI requires it. |
| `get_referral_analytics_summary()` | Harden path; retain admin gate; review summary view security and service-role-only grant. |
| `guard_profile_security_fields()` | Retain invoker context and hardened path; trigger-only; validate trusted service context and ensure client JWT metadata cannot impersonate service_role. |
| `handle_new_user()` | Harden path; trigger-only; fixed role assignment remains server-controlled; treat Auth metadata as untrusted; confirm Auth trigger installation and owner. |
| `is_administrator()` | Harden path; retain only if policies/application still reference it; authenticated/service-role execution as required. |
| `is_current_user_administrator()` | Harden path; compatibility review before merging with the other admin helper; service-role-only grant in the export should be reconciled with actual call paths. |
| `log_referral_print(uuid,text)` | Harden path; serialized allocation plus unique constraint; remove direct authenticated writes to event table. |
| `log_referral_read(uuid)` | Harden path; retain participant authorization; prevent referral-existence probing; minimize audit payload. |
| `log_referral_status_change()` | Harden path; trigger-only; define explicit system actor behavior for NULL `auth.uid()`. |
| `require_counter_referral_before_completion()` | Retain invoker context; hardened path; trigger-only; verify counter-referral linkage and transaction atomicity. |
| `set_referral_ack_due_at()` | Retain invoker context; hardened path; trigger-only; validate urgency vocabulary and SLA values. |
| `update_referral_draft_timestamp()` | Retain invoker context and hardened path; trigger-only. |
| `validate_referral_entry()` | Retain invoker context; hardened path; trigger-only; test NULL status and structured findings edge cases. |
| `validate_referral_status_transition()` | Retain invoker context and hardened path; trigger-only; test every legal/illegal transition. |

## 6. Privilege review required before migration

The export grants authenticated users EXECUTE on these RPCs:
- `get_facility_user_count(uuid)`
- `get_facility_user_counts()`
- `log_referral_print(uuid,text)`
- `log_referral_read(uuid)`
- `is_administrator()`

The export grants service_role EXECUTE on all 16 functions, including trigger functions. Treat this as a starting snapshot, not a target privilege model. Trigger functions do not normally need to be directly callable by API clients. Review PostgREST exposure and every frontend call site before changing grants.

The export also grants authenticated users ALL on `referral_print_events`, and high-risk privileges on `audit_log`. RLS policies must be reviewed together with SQL grants; RLS alone does not neutralize table-level privileges such as TRUNCATE.

## 7. Test gates

Do not approve the baseline until all of the following pass on isolated staging with a representative schema and synthetic data:

1. Function catalog assertions for owner, SECURITY DEFINER flag, volatility, search path, and EXECUTE grants.
2. Role matrix: anon, authenticated non-admin, authenticated administrator, referring facility user, receiving facility user, and service_role.
3. Facility isolation and missing-profile cases.
4. Auth provisioning with missing/malformed/untrusted metadata; role must always be `phc_staff` at creation.
5. Profile-field protection across every protected column.
6. Audit payload inspection proving sensitive fields are absent.
7. Concurrent print RPC test with many simultaneous calls for one referral; no duplicate print numbers.
8. Direct authenticated DML attempts against print events and audit log must fail.
9. Analytics view direct access and summary RPC calls by non-admin must fail.
10. Full referral lifecycle and counter-referral trigger tests.
11. Rollback and retry tests for audit/status/print transaction behavior.
12. Frontend regression tests for all RPCs and any removed direct table writes.

## 8. Explicit non-actions

- No SQL in this document has been executed.
- No staging schema, function, grant, policy, or table has been changed.
- No production database operation has been performed.
- No migration is ready for application until frontend dependency checks and populated synthetic staging tests pass.

**Decision remains NO-GO** for applying the raw schema export or any function replacement before these gates are satisfied.
