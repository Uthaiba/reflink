# REFLINK baseline function security review

**Review basis:** `reflink-production-schema.sql` (SHA-256 `72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3`), a schema export supplied for baseline reconstruction.

**Review type:** Static source review only. No function was created, replaced, or executed as part of this review. The production database was not modified. This is not a substitute for runtime authorization tests on an isolated, populated staging environment.

## Executive result

The export contains 16 public functions: 10 marked `SECURITY DEFINER` and 6 invoker-context functions. All 10 definer functions are owned by `postgres`. Nine set `search_path = public`; `get_facility_user_count(uuid)` sets an empty search path. All reviewed references to application tables are schema-qualified with `public.`; identity/role helpers are schema-qualified with `auth.`.

The staging catalog currently reports zero public tables and zero public functions, so it cannot yet execute meaningful function-level authorization tests. The staging catalog also reports that `anon`, `authenticated`, and `service_role` do not have CREATE on schema `public`. This reduces the immediate object-shadowing exposure from those roles, but does not remove the need to use a hardened, explicit function search path in the reconstructed baseline.

## Function inventory and source observations

| Function | Context | Search path | Source-level observation / review requirement |
|---|---|---|---|
| `audit_referral_mutation()` | Definer | `public` | Writes complete OLD/NEW row JSON to `audit_log`. This can duplicate patient identifiers and clinical data into an audit store. Minimize logged fields and define retention/access controls before baseline. |
| `get_facility_user_count(uuid)` | Definer | empty | Explicitly checks authentication and caller facility/administrator status; reads `public.profiles`. Empty path is a good hardening starting point; preserve explicit qualification and test NULL/mismatched facility cases. |
| `get_facility_user_counts()` | Definer | `public` | Checks caller role against administrator; aggregates facility user counts. Test unauthenticated, non-admin, and administrator calls. Prefer an explicit hardened path. |
| `get_referral_analytics_summary()` | Definer, STABLE | `public` | Delegates authorization to `public.is_current_user_administrator()` and reads the summary view. Verify the view's underlying PHI access and that only intended callers can execute the RPC. |
| `guard_profile_security_fields()` | Invoker | empty | Allows trusted database/service-role contexts, otherwise delegates administrator check and blocks changes to protected profile fields. Test every protected field and trusted execution context; confirm the trigger cannot be bypassed through alternate update paths. |
| `handle_new_user()` | Definer | `public` | Inserts a profile with a fixed `phc_staff` role; copies full name and phone from Auth metadata. Keep role fixed and ensure metadata is treated as untrusted display/contact input. Confirm Auth trigger ownership and failure behavior. |
| `is_administrator()` | Definer | `public` | Boolean lookup against `public.profiles` using `auth.uid()`. Review grants and avoid exposing broader profile data through helper behavior. |
| `is_current_user_administrator()` | Definer, STABLE | `public` | Functionally duplicates `is_administrator()`. Decide whether both names are needed for compatibility; do not remove either without checking frontend/RPC/policy references. |
| `log_referral_print(uuid,text)` | Definer | `public` | Checks admin/referrer/receiving-facility access before recording a print event. `MAX(print_number)+1` is race-prone under concurrent requests; enforce uniqueness and use a transaction-safe allocation strategy before production use. |
| `log_referral_read(uuid)` | Definer | `public` | Checks referral participation before inserting a READ audit event. Test each participant path and ensure read logging cannot be called to probe referral existence. |
| `log_referral_status_change()` | Definer | `public` | Trigger inserts a status-history row when status changes. Actor may be NULL for non-user/service-triggered operations; define the intended actor semantics and test service workflows. |
| `require_counter_referral_before_completion()` | Invoker | `public` | Enforces a counter-referral record before transition to completed. Test atomicity and valid counter-referral linkage. |
| `set_referral_ack_due_at()` | Invoker | `public` | Computes acknowledgement deadline from urgency. Confirm urgency vocabulary and time semantics match application SLA definitions. |
| `update_referral_draft_timestamp()` | Invoker | empty | Updates `updated_at` using `now()`; low complexity, but verify trigger scope and whether clients can otherwise write the field. |
| `validate_referral_entry()` | Invoker | `public` | Validates required referral fields and emergency findings. Test NULL status, NULL/empty structured findings, and all supported urgency values. |
| `validate_referral_status_transition()` | Invoker | empty | Enforces explicit workflow transitions. Test every allowed edge, every rejected edge, and terminal-state immutability against the authoritative status model. |

## Live function EXECUTE grant matrix

The separate live routine metadata snapshot records these explicit grants (all 16 functions are owned by `postgres` and explicitly executable by `service_role`):

| Caller | Functions with explicit EXECUTE grant |
|---|---|
| `service_role` | All 16 functions in the inventory above |
| `authenticated` | `get_facility_user_count(uuid)`, `get_facility_user_counts()`, `is_administrator()`, `log_referral_print(uuid,text)`, `log_referral_read(uuid)` |
| `anon` | None recorded |
| `PUBLIC` | None recorded in the captured per-function ACLs |

This is a point-in-time ACL inventory, not proof of effective privileges after role inheritance or a replacement for `has_function_privilege` checks. Preserve the five authenticated grants until policy, trigger, frontend and RPC dependencies are traced and tested. Do not grant authenticated execution to the remaining definer functions merely because they exist. When reconstructing new functions, prevent default PUBLIC/direct-role execution first, then apply explicit grants according to this matrix only where the function contract still requires them.

## Priority findings

### P0 — Protect audit records from unnecessary PHI duplication

`audit_referral_mutation()` stores full row snapshots via `to_jsonb(NEW)` and `to_jsonb(OLD)`. Referral rows may contain patient identifiers and clinical information. The design requirements, candidate allowlists, actor semantics, compatibility gates, and synthetic-staging acceptance tests are documented in `docs/AUDIT_LOG_PHI_MINIMIZATION_DESIGN.md`. Do not replace broad snapshots until audit consumers, historical-data governance, and the trigger writer privilege path are verified.

### P1 — Make SECURITY DEFINER execution context explicit

Nine definer functions currently use `SET search_path = public`. Application roles currently lack CREATE on `public` in the isolated staging catalog, but a safer baseline should use an explicit hardened path (typically `pg_catalog` plus only strictly required trusted schemas) and schema-qualify every non-catalog object. Do not blindly change paths: validate extension/helper resolution and function behavior first. The function with an empty path already schema-qualifies its application objects and should retain that discipline.

### P1 — Eliminate print-number concurrency race

`log_referral_print()` allocates a number with `MAX(print_number)+1`. Two concurrent calls can select the same number. The row-lock plus unique-constraint design and synthetic-staging acceptance tests are documented in `docs/REFERRAL_PRINT_SEQUENCE_CONCURRENCY_DESIGN.md`. The same review also flags that the receiving-facility branch does not explicitly check the caller's role; trace call sites and approve the role contract before changing it.

### P1 — Reconcile administrator helper duplication and grants

`is_administrator()` and `is_current_user_administrator()` implement the same role check. Search policies, triggers, frontend RPC calls, and grants before consolidating. Preserve compatibility until all call sites are accounted for. Verify execute grants for every definer function; a function being definer-context does not itself restrict who may invoke it.

### P1 — Validate PHI-bearing analytics access end-to-end

The analytics summary function is administrator-gated in its body, but its underlying view and function grants must be assessed together. Verify that direct view access is restricted, that the view does not accidentally execute with owner privileges beyond the intended boundary, and that RPC callers cannot bypass the administrator check.

### P2 — Define system-actor semantics

The audit and status-history triggers use `auth.uid()`. Service jobs and Auth-triggered operations may have no user JWT, producing NULL actors. Decide whether the schema should record an explicit system actor/source rather than silently treating NULL as a normal user action.

## Required staging test matrix before baseline approval

1. **Definer authorization:** unauthenticated, ordinary PHC staff, receiving-facility staff, referring-facility staff, administrator, and service-role contexts for every callable definer RPC.
2. **Facility isolation:** same-facility, different-facility, missing-profile, NULL facility argument, and disabled/deleted user cases.
3. **Auth provisioning:** new Auth user with absent, malformed, and populated metadata; ensure role is always assigned server-side and cannot be elevated through metadata.
4. **Profile protection:** attempt to alter each protected field as ordinary user, administrator, and trusted service context.
5. **Audit minimization:** verify the audit payload contains no unnecessary patient identifiers or clinical narrative.
6. **Print concurrency:** simultaneous print requests for one referral; assert unique, monotonic print numbers with no duplicate event.
7. **Status lifecycle:** allowed and disallowed transitions, counter-referral precondition, and service/system-originated changes.
8. **Analytics:** direct view grants, function EXECUTE grants, RLS/view security semantics, and administrator/non-administrator results.

## Baseline decision

**NO-GO for reconstructing or applying the baseline from the raw export unchanged.** First resolve audit-data minimization, definer search paths and grants, print-number concurrency, analytics view security, Auth trigger reconstruction, and default ACL policy. Then create a reviewed candidate migration and run it only on the isolated staging project. Production remains read-only.

## Staging catalog verification note

The read-only catalog script is maintained at `supabase/verification/staging_baseline_catalog_verification.sql`. Its latest staging execution reported PostgreSQL 17.11, zero public tables/views/functions, no non-internal Auth triggers, and broad default ACL entries on the public schema for the `postgres` and `supabase_admin` owners. Application roles lacked CREATE on `public`. These are staging-platform facts, not evidence that the production schema has the same live catalog state.


## Follow-up design artifact

The P0 audit minimization finding is expanded in `docs/AUDIT_LOG_PHI_MINIMIZATION_DESIGN.md`. It is design-only and does not change the production trigger, audit schema, historical audit rows, or permissions.


## Follow-up design artifacts

- Audit PHI minimization: `docs/AUDIT_LOG_PHI_MINIMIZATION_DESIGN.md`.
- Referral print-number concurrency: `docs/REFERRAL_PRINT_SEQUENCE_CONCURRENCY_DESIGN.md`.

Both are design-only; no production or staging database objects were changed.
