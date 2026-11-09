# REFLINK Staging Baseline Reconstruction — Review Packet

**Status: PREPARATION / REVIEW ONLY — NOT APPROVED FOR EXECUTION**  
**Target:** isolated synthetic staging project `rcskuzmvyugbanygizri`  
**Source:** `reflink-production-schema.sql`  
**Source SHA-256:** `72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3`  
**Production boundary:** project `uwwzbljufqbzkjflpnll` remains read-only and is not a target.

## 1. Purpose

This packet turns the exported schema into an ordered reconstruction plan. It is not a migration and does not recreate the missing historical migration `20260928203447_reflink_v2_rural_first`. If approved later, it will establish a new baseline derived from a current-state snapshot.

No DDL, DML, grants, revokes, or configuration changes were performed in preparing this packet.

## 2. Source inventory

The export contains:

| Object class | Count |
|---|---:|
| Public tables | 14 |
| Public functions | 16 |
| Public views | 2 |
| Explicit indexes | 10 |
| Foreign keys | 23 |
| `CREATE TRIGGER` statements in schema export | 0 |
| Supplemental live public trigger attachments | 9 |
| RLS policies | 30 |
| Grant/revoke statements | 73 |
| Default-privilege statements | 9 |

Tables:
- `audit_log`
- `counter_referrals`
- `diagnosis_categories`
- `facilities`
- `feedback`
- `profiles`
- `referrals`
- `referral_drafts`
- `referral_events`
- `referral_feedback`
- `referral_notifications`
- `referral_print_events`
- `referral_updates`
- `users`

Functions:
- `audit_referral_mutation()`
- `get_facility_user_count(uuid)`
- `get_facility_user_counts()`
- `get_referral_analytics_summary()`
- `guard_profile_security_fields()`
- `handle_new_user()`
- `is_administrator()`
- `is_current_user_administrator()`
- `log_referral_print(uuid,text)`
- `log_referral_read(uuid)`
- `log_referral_status_change()`
- `require_counter_referral_before_completion()`
- `set_referral_ack_due_at()`
- `update_referral_draft_timestamp()`
- `validate_referral_entry()`
- `validate_referral_status_transition()`

Views:
- `referral_analytics`
- `referral_analytics_summary`

## 3. Why the raw dump order cannot be replayed

The export begins with function definitions before table creation. Several functions reference tables such as `referrals`, `profiles`, `audit_log`, and analytics views. The views themselves depend on `referrals`. Foreign keys depend on multiple tables and managed `auth.users`. Triggers depend on trigger functions and tables. Policies depend on helper functions.

The source order is therefore not a safe dependency order for a clean empty target. A reconstruction must split object classes and apply them in dependency-aware phases, with explicit validation between phases.

## 4. Proposed reconstruction phases

### Phase 0 — Freeze and preflight

Read-only only:
- Verify project ref, health, PostgreSQL major version, clean application schema and empty migration ledger.
- Verify managed roles, schemas, `auth.uid()`, `auth.users`, extension versions and execution-role capabilities.
- Capture current schema/default ACLs and Auth triggers.
- Preserve a checksum of the exact source export.
- Confirm no production data or credentials are part of the restore package.

**Current observation:** staging is PostgreSQL 17.11, has zero public application tables/functions/views, and has no non-internal Auth trigger. Production remains read-only.

### Phase 1 — Establish least-privilege policy before creating application objects

The staging catalog shows broad default ACLs for `postgres` and `supabase_admin` across managed and application schemas. Public-schema defaults include broad grants to `anon`, `authenticated`, and `service_role`.

Required decisions:
- Determine which REFLINK object-creating role will own future application objects.
- Establish least-privilege default privileges for that role and `public` only, subject to role authority and review.
- Do not modify `auth`, `storage`, `realtime`, `graphql`, `graphql_public`, `extensions`, or other platform-owned schema defaults as part of this app reconstruction.
- Avoid inheriting the export's broad default grants to `anon` and `authenticated`.
- Document effective privileges, including inherited role membership, not only direct ACL entries.

**Blocker:** no approved default-ACL remediation decision exists yet. Do not create app objects until this is resolved, because permissive defaults can automatically expose every new object.

### Phase 2 — Create tables and identity sequences

Create all 14 tables, columns, defaults, identity definitions, checks and primary/unique constraints. Where necessary to resolve circular references, create base tables first and add foreign keys in Phase 3.

Keep platform-managed `auth.users` intact. Do not create fake Auth schema objects.

Use synthetic fixtures only after schema creation and approval; no production patient records.

### Phase 3 — Add foreign keys and indexes

Add the 23 exported foreign keys only after every referenced table exists. Validate all referenced columns, delete actions and constraint names against the source snapshot.

Create the 10 explicit indexes after constraints. Review indexes for duplication with primary/unique constraints and verify partial-index predicates. Do not add proposed print uniqueness until the print-event integrity candidate has been separately approved.

### Phase 4 — Create and harden functions

Create the 16 functions only after their referenced tables and required managed functions exist.

Preserve intended SECURITY INVOKER/DEFINER semantics and exact signatures. The export has 10 SECURITY DEFINER functions; 9 declare `search_path = public`. Inspect every body for unqualified object references. Do not mechanically rewrite all functions. Any hardening changes must be independently reviewed and regression-tested.

Required function-level gates:
- Owner and EXECUTE grants.
- Search path and schema qualification.
- Authenticated, anonymous, service-role and NULL-actor behaviour.
- RLS interaction under realistic JWT claims.
- Trigger return semantics.
- Error behaviour and transaction rollback.
- No unexpected disclosure of patient or clinical data.

The audit and print candidate designs in the repository are not yet approved migrations. They must not silently replace the exported functions during baseline reconstruction.

### Phase 5 — Create views

Create `referral_analytics` after `referrals`; create `referral_analytics_summary` after its base view.

The base analytics view exposes patient identifiers and diagnosis-related fields. Preserve service-role-only access. Inspect view owner, security mode, and effective grants. Do not grant either view to `anon` or `authenticated`.

### Phase 6 — Enable RLS and create policies

Enable RLS on all 14 tables, then create and verify all 30 policies. Compare each policy's command, role, USING expression and WITH CHECK expression to the reviewed source.

The two tables `referral_events` and `referral_feedback` have RLS enabled but no policies in the export; this is fail-closed behaviour and must not be “fixed” by inventing permissive policies.

Test administrator, referring-user, receiving-facility, unrelated authenticated, anonymous and service-role contexts. Confirm that RLS is not being bypassed unintentionally by SECURITY DEFINER functions or view ownership.

### Phase 7 — Reconcile and create public triggers

The schema export contains no trigger DDL. The supplemental live catalog snapshot contains nine public trigger attachments. Review each attachment against its function definition, timing, event list, column list, row-level semantics and name; then include the reviewed attachments in the staging candidate. Do not claim they were exported from the SQL snapshot.

Do not create a trigger on `auth.users` based solely on the existence of `handle_new_user()`. The current staging catalog has no non-internal Auth trigger. Retrieve and verify the exact production trigger definition and expected signup lifecycle separately before any Auth trigger work.

### Phase 8 — Apply explicit grants

Apply only reviewed object-level grants. Reconcile the export's grants with the security proposals:
- audit log: decide no direct authenticated access versus administrator SELECT only; revoke excessive writes/maintenance/sequence rights.
- print events: participant SELECT only; no direct authenticated DML or sequence access; preserve RPC call.
- analytics views: service-role-only.
- RPCs: exact EXECUTE grants per caller contract.
- `referral_events` and `referral_feedback`: preserve service-role-only until a documented access design exists.
- avoid broad grants to `authenticated` where a narrower RPC is the intended write path.

Do not replay grant statements before the object-specific decisions are resolved.

### Phase 9 — Post-restore catalog and behavioural verification

Run the read-only verifier and compare expected object inventory. A zero-object count is a pre-restore observation, not a pass.

Acceptance:
- 14 tables, 16 functions, 2 views, 10 explicit indexes, 23 foreign keys and 30 policies from the schema export, plus nine public trigger attachments from the separate live catalog snapshot.
- All 14 tables have RLS enabled.
- Every function owner, security mode, search path and EXECUTE grant matches the approved manifest.
- All intended table, sequence, view and schema grants match least-privilege decisions.
- No unexpected Auth trigger.
- No public/anon/authenticated access to analytics views.
- All negative RLS tests deny access.
- Synthetic referral lifecycle and notification/outbox integration tests pass.
- Audit/print security candidates pass their independent acceptance suites.

## 5. Explicit blockers and unresolved design decisions

| ID | Blocker | Required resolution | Current disposition |
|---|---|---|---|
| B-01 | Historical migration source missing | Formally accept new snapshot-derived baseline and document provenance; do not claim historical recovery | Open |
| B-02 | Broad default ACLs | Approve app-owned public-schema default ACL target without modifying managed schemas | Open |
| B-03 | Auth signup trigger absent in staging | Retrieve exact intended trigger and validate signup lifecycle; do not invent | Open |
| B-04 | SECURITY DEFINER search paths | Function-by-function body review and tests | Open |
| B-05 | Analytics view privacy | Verify owner/security mode and service-role-only access | Open |
| B-06 | `profiles` and `users` both exist | Decide authoritative identity/role source and test sync/authorization assumptions | Open |
| B-07 | Audit snapshots and grants | Approve data-minimisation and privilege candidate decisions | Candidate docs only |
| B-08 | Print-event race and grants | Approve uniqueness/locking and least-privilege candidate decisions | Candidate doc only |
| B-09 | Migration ledger baseline | Decide how a snapshot-derived baseline is represented without falsely claiming historical migration replay | Open |
| B-10 | SQL parser / clean restore dry run | Run in disposable PostgreSQL 17 + Supabase-compatible environment; current execution environment lacks local PostgreSQL tooling | Open |

## 6. Required review artifacts before any DDL

1. Exact source snapshot and checksum.
2. This ordered reconstruction packet.
3. A line-by-line transformed SQL diff (source versus proposed baseline).
4. Function-by-function SECURITY DEFINER review.
5. Default ACL decision and effective-privilege matrix.
6. Auth trigger provenance and signup test plan.
7. View security/grant review.
8. Identity model decision (`profiles` versus `users`).
9. Migration-ledger strategy for the new baseline.
10. Disposable PostgreSQL 17 restore validation and a complete rollback plan.

## 7. Current execution status

- Source export inspected and object classes/dependencies inventoried.
- Staging catalog checked read-only on 2026-11-08.
- Staging remains empty in `public`.
- No staging DDL/DML/ACL changes have been applied.
- No production SQL has been executed.
- This packet is committed documentation only and does not authorize DDL.

**Decision:** baseline reconstruction is prepared for technical review, but execution remains blocked by B-01 through B-10. Resolve the blockers in order; do not bypass them to accelerate deployment.
