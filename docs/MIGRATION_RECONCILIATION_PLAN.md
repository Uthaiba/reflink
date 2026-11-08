# REFLINK Migration Reconciliation Plan

**Status:** Investigation and source review only. No production migration, schema mutation, migration-ledger update, or staging deployment has been performed.

## 1. Current evidence

The connected Supabase project's last read-only migration-ledger inspection returned exactly one recorded version:

- `20260928203447_reflink_v2_rural_first`

The current source branch contains eight later SQL files. Their absence from the remote ledger means they must be treated as **not recorded as applied**. It does not, by itself, prove that every object referenced by those files is absent from the live schema: some objects may predate the ledger entry, have been created manually, or be represented by a differently named migration.

The prior read-only catalog inspection confirmed these live objects/columns relevant to the latest work:

- `public.profiles`: `id`, `role`, `facility_id`; observed roles include `phc_staff`, `receiving_staff`, and `administrator`.
- `public.referrals`: `status`, `ack_due_at`, `acknowledged_at`, `receiving_facility_id`.
- An existing BEFORE trigger sets `ack_due_at` from referral urgency/creation data.
- Existing referral validation, status-transition, counter-referral and audit triggers are present.
- The connected schema has no demonstrated `profiles.is_active` field; do not add that assumption to recipient eligibility logic.

These observations do not establish the full schema baseline or prove that the proposed SQL compiles against the remote database.

## 1A. Repository baseline and environment re-check (7 November 2026)

A fresh Git object-tree inspection was performed against the PR base commit (`v2.0-release`), the `main` branch, and the current remediation branch:

- The `v2.0-release` base tree contains no `supabase/migrations/` directory.
- The `main` branch tree also contains no `supabase/migrations/` directory.
- The remediation branch contains exactly the eight November 2026 proposal migrations listed below; it does not contain a source file for `20260928203447_reflink_v2_rural_first`.
- A fresh read-only Supabase migration-ledger call still returns exactly one applied version: `20260928203447_reflink_v2_rural_first`.
- A fresh branch inventory returns one branch named `main`, marked non-persistent and data-free, with `project_ref` equal to the production project reference. It is not an isolated synthetic integration database and must not be treated as one.
- The fresh table inventory confirms production tables contain records. Do not use this project or branch to create synthetic referral fixtures or exercise live workflows.

**Decision:** the historical migration source cannot be recovered from either Git release baseline. No reconstruction, placeholder migration, migration-ledger edit, or migration replay is authorised. The next acceptable evidence is an owner-approved schema-only export and migration-history evidence, excluding patient rows, auth records, secrets and storage contents. Until a genuinely isolated synthetic database is approved, validation remains source-only.

## 2. Source migration inventory

| Version | Source file | Intended change | Reconciliation requirement |
|---|---|---|---|
| `20261105000100` | `20261105000100_admin_aggregate_referral_volume.sql` | Counter-referral completion RPC and aggregate referral/facility reporting RPCs | Inspect existing function signatures, dependencies, trigger behavior, ownership and grants. The file includes a `DROP FUNCTION IF EXISTS` for the referral-volume RPC; confirm dependent views/clients and return-type compatibility before any replay. |
| `20261105000200` | `20261105000200_admin_lga_referral_summary.sql` | Aggregate LGA referral activity RPC | Verify facility geography fields, administrator helper behavior, function ownership and disclosure-control behavior. |
| `20261105000300` | `20261105000300_admin_facility_reporting_coverage.sql` | Aggregate facility registry/observed-activity coverage RPC | Verify `facilities.is_active`, geography columns and the intended interpretation of current registry status. |
| `20261105000400` | `20261105000400_admin_referral_pathway_intelligence.sql` | Aggregate facility-type pathways and interval distributions | Verify facility type fields and referral timestamp semantics; test small-cell and complementary suppression across multiple groups. |
| `20261105000500` | `20261105000500_admin_acknowledgement_delay_alerts.sql` | Aggregate acknowledgement-delay snapshot | Verify urgency vocabulary and stored `ack_due_at` semantics. This is a snapshot RPC, not a notification dispatcher. |
| `20261105000600` | `20261105000600_notification_outbox_foundation.sql` | Private notification outbox, attempt ledger and service-role queue functions | Verify whether `private` schema or similarly named objects already exist, table/constraint definitions, function signatures, service-role grants, function owners and RLS posture. |
| `20261106000100` | `20261106000100_referral_acknowledgement_notification_hooks.sql` | Referral lifecycle trigger to cancel stale acknowledgement reminder work | Explicitly depends on `20261105000600`. It does not select recipients or enqueue reminders. Do not apply before the outbox objects and all trigger dependencies are verified. Review SECURITY DEFINER ownership and trigger interactions. |
| `20261107000100` | `20261107000100_restrict_notification_log_column_access.sql` | Remove broad authenticated privileges from the legacy notification log and re-grant SELECT on non-sensitive status columns only | Verify column-level ACL semantics, RLS participant/admin policies, PostgREST projections, and service-role SMS writes in synthetic staging. This migration preserves the existing RLS policies and does not grant phone/provider/error fields. |

## 3. Dependency graph

```text
Existing live schema baseline
  ├── 20261105000100  aggregate referral volume / counter-referral RPC
  ├── 20261105000200  LGA aggregate RPC
  ├── 20261105000300  facility coverage aggregate RPC
  ├── 20261105000400  pathway aggregate RPC
  ├── 20261105000500  acknowledgement delay aggregate RPC
  └── 20261105000600  private notification outbox
          └── 20261106000100  acknowledgement reminder triggers
```

The dependency graph expresses source intent only. It is not an execution plan. The six November 5 migrations may have additional object-level dependencies on the exact production baseline and must not be assumed independent simply because their filenames are sequential.

The `20261107000100` notification-log column-grant migration is a separate branch from the outbox chain: it depends on the pre-existing `public.referral_notifications` table, its RLS policies and the production role/grant baseline. It must not be treated as an outbox prerequisite, and it still requires synthetic PostgREST projection and service-role write validation.

## 4. Required reconciliation procedure

1. **Freeze database writes from this branch.** Do not run `supabase db push`, `apply_migration`, or manual DDL against production.
2. Obtain a schema-only export of the live project using an approved, read-only process. Exclude patient rows, auth user records, secrets and storage object contents.
3. Compare schema objects, function signatures/bodies, trigger definitions, constraints, indexes, grants, ownership and policies against the source migrations and production release tag.
4. Determine whether the repository lacks historical migrations, whether the remote ledger is incomplete, or whether schema changes were made outside migration history. Record the evidence for each object.
5. Select an explicit baseline strategy: restore missing historical migrations, create a reviewed baseline/squash for a clean non-production project, or reconcile the remote ledger only through an approved Supabase migration-history procedure. Never mark migrations applied merely to silence a mismatch.
6. Create or designate a separate non-production Supabase project. Confirm organisation, region, access, cost and data policy before creating it. Use synthetic facilities, profiles and referrals only.
7. Apply the reconstructed baseline to that disposable environment, then test each proposed migration in dependency order. Capture SQL errors, advisor findings, grants, trigger behavior and rollback/recovery behavior.
8. Run authenticated role/facility tests, concurrency tests, aggregate disclosure tests, and notification enqueue/cancellation tests. Do not use real patient data.
9. Obtain database/security and clinical governance review. Only after explicit release approval may a separate production change plan be prepared.

## 5. Mandatory tests before any approval

### Reporting RPCs
- Non-admin, unauthenticated, and each intended administrator account are tested.
- No patient, referral, facility, or staff identifiers are returned.
- Counts 0, 1–4, 5 and complementary suppression edge cases are covered.
- Cross-filter and overlapping-period differencing risks are evaluated.
- Africa/Lagos date boundaries, invalid chronology, test records and missing timestamps are tested.
- Referral activity is not labelled incidence, unmet need, non-reporting or care quality without validated denominators and governance approval.

### Counter-referral RPC
- Correct receiving role and destination facility succeed.
- PHC, wrong-facility, administrator and unauthenticated calls fail.
- Concurrent duplicate submissions and retries are serialized safely.
- Existing status, audit and counter-referral triggers behave as expected.
- Existing counter-referral data and downstream dependencies are preserved.

### Notification outbox and triggers
- Browser roles cannot access `private` objects or execute queue functions.
- Only the intended server role can enqueue, claim and settle.
- Idempotent duplicate keys, mismatched metadata, concurrent claims, lease expiry and stale tokens are tested.
- Referral acknowledgement, status, destination, deadline and staff assignment changes cancel/rebuild only the appropriate reminders.
- Recipient role and facility assignment are revalidated immediately before dispatch by any future worker.
- No phone number, message body, diagnosis, clinical narrative or raw provider response is stored.
- No SMS/provider dispatch is enabled until approved templates, consent/contact policy, provider sandbox, idempotency and privacy review are complete.

## 6. Current decision

**Blocked: migration baseline reconciliation and non-production verification.**

Safe work that may continue on the source branch includes documentation, static review and tests that do not connect to or mutate Supabase. The following remain prohibited without separate explicit approval: production migration application, migration-ledger edits, schema changes, RLS/grant/function changes, Edge Function deployment, worker scheduling, provider dispatch, and production release.

No patient-level data was queried for this review. No database or Auth settings were changed.


## 7. Static preflight coverage

The repository now includes `tests/migrationGovernance.test.js`. It statically checks the eight migration versions, the explicit outbox-to-hook dependency, stored acknowledgement deadline and in-app-only queue behavior, service-role-only outbox function grants, administrator checks for reporting RPCs, and receiving-role/facility checks for counter-referral completion.

These tests are not a SQL parser and do not compile or execute the migrations. A passing result is not evidence that the SQL applies cleanly or that PostgreSQL privileges/triggers behave correctly. Disposable-database validation remains mandatory.


## 8. Foreign-key index review evidence gap

A prior read-only catalog review reported 16 foreign-key columns without a supporting index. The exact constraint/table/column list and full index definitions are not preserved in the current source-controlled review evidence. The count alone is not sufficient to generate index DDL safely.

Before proposing indexes, obtain a metadata-only export of:
- each foreign-key constraint name, referencing table and ordered referencing columns;
- all existing indexes on each referencing table, including key-column order, included columns, uniqueness, expressions and partial predicates;
- table sizes and representative query plans/workload evidence where available;
- write volume and maintenance implications for the affected tables.

For each candidate, determine whether an existing composite index already has the foreign-key columns as a usable leading prefix. Do not add a redundant index merely because a single-column index is absent. Check whether the constraint is multi-column and preserve its column order. Confirm the candidate benefits real joins, deletes/updates or common application queries.

**Decision:** no index migration is proposed from the currently available evidence. Add an index only after the exact catalog export and query/workload review are attached to the source change, then validate it against a disposable database with representative synthetic data. No production index DDL is authorised by this review.


## 9. Live migration ledger and source-baseline gap — 7 November 2026

A fresh read-only migration-ledger query again returned exactly one recorded version: `20260928203447_reflink_v2_rural_first`. The branch's `supabase/migrations/` directory contains the eight November 5–7 proposal files listed above, but **does not contain the SQL file for the recorded 20260928203447 baseline**.

A metadata-only catalog inventory returned 16 live public routines. All 16 are owned by `postgres`; none is defined by the eight proposed November migrations. The seven routine-bearing files define new reporting, counter-referral and notification-outbox routines; the eighth file changes notification-log column grants. None is the missing historical baseline. Therefore, the branch cannot currently recreate the live public routine layer from its migration history.

| Live routine | SECURITY DEFINER | Search path | Effective EXECUTE |
|---|---:|---|---|
| `audit_referral_mutation()` | Yes | public | service_role |
| `get_facility_user_count(uuid)` | Yes | empty | authenticated, service_role |
| `get_facility_user_counts()` | Yes | public | authenticated, service_role |
| `get_referral_analytics_summary()` | Yes | public | service_role |
| `guard_profile_security_fields()` | No | empty | service_role |
| `handle_new_user()` | Yes | public | service_role |
| `is_administrator()` | Yes | public | authenticated, service_role |
| `is_current_user_administrator()` | Yes | public | service_role |
| `log_referral_print(uuid,text)` | Yes | public | authenticated, service_role |
| `log_referral_read(uuid)` | Yes | public | authenticated, service_role |
| `log_referral_status_change()` | Yes | public | service_role |
| `require_counter_referral_before_completion()` | No | public | service_role |
| `set_referral_ack_due_at()` | No | public | service_role |
| `update_referral_draft_timestamp()` | No | empty | service_role |
| `validate_referral_entry()` | No | public | service_role |
| `validate_referral_status_transition()` | No | empty | service_role |

Catalog privilege checks confirmed anon has no EXECUTE privilege on these 16 routines. Authenticated has EXECUTE on the five user-facing legacy RPCs above; service_role has EXECUTE on all 16. The owner role `postgres` has BYPASSRLS, so every SECURITY DEFINER routine owned by it executes with row-level security bypass. Do not infer that underlying table RLS protects a privileged routine.

### 9.1 Existing public trigger inventory

Nine non-internal triggers were returned for public tables:

- `counter_referrals.counter_referrals_audit_mutation` — AFTER INSERT/UPDATE/DELETE, calls `audit_referral_mutation()`.
- `profiles.guard_profile_security_fields` — BEFORE UPDATE, calls `guard_profile_security_fields()`.
- `referral_drafts.referral_draft_updated_at` — BEFORE UPDATE, calls `update_referral_draft_timestamp()`.
- `referrals.referral_ack_due_at_trigger` — BEFORE INSERT or UPDATE OF urgency/created_at, calls `set_referral_ack_due_at()`.
- `referrals.referral_counter_referral_guard` — BEFORE UPDATE OF status, calls `require_counter_referral_before_completion()`.
- `referrals.referral_entry_validation_trigger` — BEFORE INSERT/UPDATE, calls `validate_referral_entry()`.
- `referrals.referral_status_audit_trigger` — AFTER UPDATE OF status, calls `log_referral_status_change()`.
- `referrals.referral_status_transition_validation` — BEFORE UPDATE OF status, calls `validate_referral_status_transition()`.
- `referrals.referrals_audit_mutation` — AFTER INSERT/UPDATE/DELETE, calls `audit_referral_mutation()`.

The live `handle_new_user()` function exists, but the catalog query over non-internal triggers across schemas found no trigger currently referencing it. Treat this as an orphan/unattached function requiring historical baseline investigation; do not recreate or attach an auth trigger based on the function name alone.

### 9.2 Existing analytics views

Two public views exist, both owned by postgres, with no `security_invoker=true` reloption. Effective SELECT privileges are service_role only; anon and authenticated cannot SELECT either view.

- `referral_analytics` includes patient identifiers, diagnosis fields, referral IDs, status and lifecycle timestamps. It is not exposed to anon/authenticated.
- `referral_analytics_summary` aggregates operational referral metrics and is also service_role-only.

No rows from either view were queried. Their definitions and ACLs are catalog metadata only. Any future grant change must account for their default view-owner/RLS behavior and the sensitive columns in `referral_analytics`.

## 10. Required baseline reconstruction package

The baseline is not ready to reconstruct from the current eight proposal files. The next source-control deliverable must be a separately reviewed, metadata-backed baseline package containing:

1. The exact SQL migration file (or an approved historical source export) corresponding to recorded ledger version `20260928203447`.
2. Definitions, owner, ACL, security mode, search_path and volatility for all 16 live public routines listed above.
3. The nine public trigger definitions and their trigger-function definitions, plus the auth-schema trigger inventory.
4. The two public view definitions, owner, reloptions and effective grants.
5. All public table definitions, constraints, indexes, RLS enablement, policies and grants, with dependencies.
6. The complete migration ledger and an object-by-object explanation of anything present in the live schema but absent from the recorded migration chain.

Do not generate a squash/baseline migration from the current catalog summaries. The baseline must be reviewed against the exact live schema and then replayed only in a disposable synthetic-data environment. Preserve production as read-only until that package has passed staging validation and separate release approval.

**Current decision remains blocked:** the single recorded migration has no corresponding source SQL in this branch, and all 16 live public routines are outside the tracked migration history. No migration replay, ledger reconciliation or schema mutation is authorized by this metadata export.


## 11. Supabase security advisor snapshot — 7 November 2026

A read-only security-advisor run returned the following findings:

| Finding | Level | Count | Interpretation |
|---|---|---:|---|
| RLS enabled, no policy | INFO | 2 | `public.referral_events` and `public.referral_feedback` have RLS enabled and no policies. Ordinary API access is fail-closed; intended workflows must be defined before adding policies. |
| Authenticated SECURITY DEFINER executable | WARN | 5 | The five legacy RPCs in the privileged-RPC review are executable by authenticated. They have internal authorization checks and anon EXECUTE is false; the warning requires direct-RPC tests and careful review, not blind revocation. |
| Leaked password protection disabled | WARN | 1 | Supabase Auth leaked-password protection is disabled. Enabling it is an Auth configuration change and remains outside this read-only review. |

The `profiles_role_check` constraint was also exported and restricts role values to exactly `phc_staff`, `receiving_staff`, and `administrator`. This establishes canonical role strings at the database constraint layer and resolves the immediate concern that case/whitespace variants could be stored through ordinary writes. Do not remove or weaken this constraint without an explicit role migration plan.

Advisor remediation references:
- [RLS enabled with no policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Authenticated SECURITY DEFINER function executable](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

No advisor finding was modified. No policy, grant, Auth setting, function, migration or table was changed.


## 12. Exact foreign-key/index inventory — 7 November 2026

A fresh catalog-only comparison enumerated every public foreign-key constraint and compared its ordered referencing columns with the leading key columns of every valid, non-partial index on the referencing table. All current public foreign keys are single-column. The query found **16 foreign-key columns without a supporting valid, non-partial leading index**:

| Table | Foreign-key column | Constraint | Referenced table |
|---|---|---|---|
| `counter_referrals` | `receiving_user_id` | `counter_referrals_receiving_user_id_fkey` | `auth.users(id)` |
| `feedback` | `provided_by` | `feedback_provided_by_fkey` | `profiles(id)` |
| `feedback` | `referral_id` | `feedback_referral_id_fkey` | `referrals(id)` |
| `profiles` | `facility_id` | `profiles_facility_id_fkey` | `facilities(id)` |
| `referral_events` | `performed_by` | `referral_events_performed_by_fkey` | `profiles(id)` |
| `referral_events` | `referral_id` | `referral_events_referral_id_fkey` | `referrals(id)` |
| `referral_feedback` | `receiving_facility_id` | `referral_feedback_receiving_facility_id_fkey` | `facilities(id)` |
| `referral_feedback` | `referral_id` | `referral_feedback_referral_id_fkey` | `referrals(id)` |
| `referral_feedback` | `submitted_by` | `referral_feedback_submitted_by_fkey` | `profiles(id)` |
| `referral_print_events` | `printed_by` | `referral_print_events_printed_by_fkey` | `auth.users(id)` |
| `referral_updates` | `referral_id` | `referral_updates_referral_id_fkey` | `referrals(id)` |
| `referral_updates` | `updated_by` | `referral_updates_updated_by_fkey` | `profiles(id)` |
| `referrals` | `receiving_facility_id` | `referrals_receiving_facility_id_fkey` | `facilities(id)` |
| `referrals` | `referring_facility_id` | `referrals_referring_facility_id_fkey` | `facilities(id)` |
| `referrals` | `referring_user_id` | `referrals_referring_user_id_fkey` | `profiles(id)` |
| `users` | `facility_id` | `users_facility_id_fkey` | `facilities(id)` |

The comparison correctly recognizes composite indexes whose first key column is the FK column, including `audit_log(actor_user_id, created_at DESC)`, `referral_print_events(referral_id, created_at DESC)`, `referral_notifications(referral_id, created_at DESC)`, and the unique `counter_referrals(referral_id)` index. It does not count partial indexes as general FK coverage.

### 12.1 Existing index inventory observations

- `counter_referrals.referral_id` has both a unique constraint/index and a separate non-unique `counter_referrals_referral_idx` on the same single column. The non-unique index is a redundancy candidate, but do not drop it without query-plan and workload review.
- `referral_print_events.referral_id` is already supported by its composite index with `created_at` as the second key. Its separate `printed_by` FK remains unindexed.
- `audit_log.actor_user_id` is already supported by `audit_log_actor_idx(actor_user_id, created_at DESC)`; it is not part of the 16 missing-index list.
- The two referral facility FKs and the referral-user FK have no leading-key support in the current public index inventory.

### 12.2 Decision

The previous evidence gap about the exact FK list is now closed. This does **not** automatically authorize creating 16 indexes. Before any index migration, assess table size, write frequency, common join/filter patterns, delete/update behavior, existing query plans and index maintenance overhead in a disposable database with synthetic data. Prioritize indexes by measured workload and cascade/parent-row maintenance impact; avoid blindly adding every candidate. No production index DDL or redundant-index removal was performed.


## 13. Application-to-database RPC dependency cross-check

A source-only search of the current branch confirms that the React application already contains callers for proposed functions that are defined only in the unrecorded November migrations:

- `src/App.jsx` calls `submit_counter_referral` from the receiving-side counter-referral submission flow (around line 8395 in the reviewed snapshot).
- `src/components/dashboards/AdminDashboard.jsx` calls all six reporting functions: `get_admin_referral_volume`, `get_admin_facility_referral_summary`, `get_admin_lga_referral_summary`, `get_admin_facility_reporting_coverage`, `get_admin_referral_pathway_summary`, and `get_admin_acknowledgement_delay_alerts`.

None of these seven proposed RPCs appears in the live 16-routine public catalog inventory. The Admin Dashboard catches RPC failures and displays explicit “migration must be applied and tested” messages; the counter-referral submission flow catches RPC failure and does not claim completion without a returned completion record.

This is an expected source/database dependency gap while PR #1 remains draft and unmerged, but it is a release blocker: deploying the frontend without the reviewed, validated migration set leaves these features unavailable. Conversely, applying the migrations before the baseline, function-owner, grant, trigger and synthetic-data staging checks would be unsafe. Keep the frontend and database release sequence coordinated.


## 14. Source-controlled metadata snapshots

The read-only catalog evidence has now been preserved in two clearly labelled documentation snapshots:

- `docs/catalog_exports/20261107_live_public_routines.md` — exact `pg_get_functiondef` output and owner, SECURITY DEFINER, function settings and ACL for all 16 live public routines.
- `docs/catalog_exports/20261107_live_public_schema_catalog.md` — 162 public table-column records, 30 RLS policy records, 52 constraints, 28 indexes, 9 public triggers, 2 public views and 305 table-grant records.

These files are metadata evidence, **not executable migrations or a complete restore dump**. They exclude application rows and do not replace the missing source migration for `20260928203447`, nor do they capture every extension-managed object or every non-public schema dependency. A full schema-only export and exact baseline source are still required before a disposable database can be reconstructed.

The two snapshots were generated from read-only catalog queries. No database object, policy, grant, migration ledger entry, Auth setting or deployment was changed.


## 15. Legacy notification-log column exposure — 7 November 2026

A metadata-only privilege check found that `authenticated` has all table-level privileges on `public.referral_notifications`: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER and REFERENCES. Effective column checks confirmed authenticated can select `recipient_phone`, `provider_message_id` and `error_message`. The table has RLS policies that permit referral participants to select notification-log rows, so RLS does not prevent those sensitive columns from being returned to an authenticated participant with access to the referral.

A repository-wide source scan of all 18 JavaScript/TypeScript files under `src/` and `api/` found only service-role inserts in `api/referral-sms.js`; no current frontend code reads `referral_notifications`. The endpoint writes the recipient phone, Twilio provider message ID and raw provider error into the table. This makes the current authenticated table grant broader than the application's observed need.

**Source-only remediation added:** `20261107000100_restrict_notification_log_column_access.sql` revokes all table-level privileges from anon/authenticated and re-grants authenticated SELECT only on `id`, `referral_id`, `notification_type`, `channel`, `status`, `created_at` and `sent_at`. Existing RLS policies remain in place; service_role grants and endpoint writes are untouched. Phone numbers, provider IDs and raw provider errors are not in the authenticated projection.

This migration is a proposal only. It has not been applied. Before approval, verify PostgREST column-level projection behavior, any external consumers not present in this repository, and service-role write behavior in a synthetic non-production environment. If future administrative workflows require provider diagnostics, expose them through a separately authorized admin-only server path rather than broadening participant table SELECT.

**Risk disposition:** potential sensitive metadata overexposure is documented and a least-privilege source migration is proposed. Production grant changes remain prohibited pending baseline reconciliation and staging validation.


## 16. Sequence, extension and managed-schema boundary inventory

The public schema also contains two bigint sequences, both owned by `postgres` and owned by their corresponding table identity columns:

- `public.audit_log_id_seq` → `public.audit_log.id`
- `public.referral_print_events_id_seq` → `public.referral_print_events.id`

Installed extensions are `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1` and `uuid-ossp 1.1`. The catalog snapshot records their schemas and owners.

The database also contains Supabase-managed schemas (`auth`, `storage`, `realtime`, `vault`, `extensions`, `graphql`, `graphql_public`, `pgbouncer` and `supabase_migrations`). These are platform dependencies, not application-owned baseline objects. The REFLINK baseline should declare required extension/schema dependencies and must not recreate or mutate Supabase-managed objects.

The public catalog snapshot now includes 14 tables/162 columns, 2 sequences, 30 policies, 52 constraints, 28 indexes, 16 routines, 9 triggers, 2 views and 305 table-grant records. It remains a metadata inventory rather than a complete `pg_dump --schema-only` artifact. The missing recorded baseline SQL and a verified full schema-only export remain outstanding.

## 1B. Proposed migration dependency and risk review (7 November 2026)

A source-only review of all eight proposal files was completed. This is a dependency inventory, not PostgreSQL execution or proof of compatibility with the connected database.

### Dependency map

| Migration | Objects introduced or changed | Required pre-existing contract / dependency | Review disposition |
|---|---|---|---|
| `20261105000100_admin_aggregate_referral_volume.sql` | `submit_counter_referral`, `get_admin_referral_volume`, `get_admin_facility_referral_summary` | `auth.uid()`, `profiles`, `referrals`, `counter_referrals`, existing referral lifecycle guards, `is_administrator()` | Highest schema/dependency review priority |
| `20261105000200_admin_lga_referral_summary.sql` | LGA aggregate RPC | `referrals`, `facilities`, `is_administrator()` | Independent of the outbox; validate location fields and suppression behavior |
| `20261105000300_admin_facility_reporting_coverage.sql` | Facility coverage aggregate RPC | `referrals`, `facilities`, `is_administrator()` | Independent of the outbox; confirm registry/status semantics |
| `20261105000400_admin_referral_pathway_intelligence.sql` | Referral pathway and interval aggregate RPC | `referrals`, `facilities`, `is_administrator()` | Independent of the outbox; validate timestamp and denominator semantics |
| `20261105000500_admin_acknowledgement_delay_alerts.sql` | Acknowledgement delay aggregate RPC | `referrals`, `is_administrator()` | Independent of the outbox; validate deadline and status cohort |
| `20261105000600_notification_outbox_foundation.sql` | Private outbox/attempt tables, worker functions and public service-role wrappers | PostgreSQL roles `service_role`, `anon`, `authenticated`; UUID generation; private schema exposure configuration | Foundation for the later cancellation hook; no provider dispatch is included |
| `20261106000100_referral_acknowledgement_notification_hooks.sql` | Referral update trigger and cancellation function | Outbox and attempt tables/functions from `20261105000600`; existing `referrals` columns | Explicit dependency on migration 006; cancellation-only, no recipient inference or enqueue |
| `20261107000100_restrict_notification_log_column_access.sql` | Column-level ACL changes on `public.referral_notifications` | Exact existing table columns, grants, RLS policies, authenticated participant query requirements, service-role endpoint access | Separate ACL-sensitive change; require before/after privilege matrix and role tests |

### Specific findings and required preflight

1. **Migration 001 is not purely additive.** It executes `DROP FUNCTION IF EXISTS public.get_admin_referral_volume(date, date)` before creating the replacement with an expanded return shape. PostgreSQL will reject a drop that has dependent objects unless dependencies are handled; if it succeeds, existing grants on the dropped function do not carry over automatically. Before approval, inventory dependent views/functions and callers, record existing execute grants and ownership, and test the replacement contract with all callers in a disposable database. Do not add `CASCADE` as a shortcut.
2. **The five reporting RPCs share an authorization dependency.** They call the existing `public.is_administrator()` helper. The helper is not defined by these proposal files. Its live owner, SECURITY DEFINER status, search path, execute grants, policy dependencies and behavior must be reconciled against the authoritative source before these RPCs can be approved.
3. **Counter-referral completion depends on the existing clinical schema.** The first migration expects the receiving role/facility profile, referral destination/status, counter-referral columns and existing lifecycle triggers. Static tests verify source contracts only; they do not prove database trigger order, grants, constraints, concurrency or RLS behavior.
4. **The notification hook has one explicit file dependency.** Migration 007 calls objects created by migration 006. The five reporting RPC files do not reference the outbox. The hook currently only cancels stale reminder work; it must not be described as delivering reminders.
5. **The notification-log ACL change is not safe to infer from source alone.** Its table-level and column-level revokes can change existing authenticated application reads. Validate the exact column grants, RLS policies, all frontend query projections and service-role access in a synthetic environment before applying. Preserve least privilege without breaking participant status visibility.
6. **Timestamp order is not a complete dependency graph.** The listed timestamps provide a deterministic proposal order, but only migration 007 has a declared cross-file dependency. Schema prerequisites, role ownership, existing objects, trigger behavior and grants remain external dependencies.

### Current safe execution decision

- No SQL migration was run or applied during this review.
- No production or shared-project database was used for synthetic testing.
- The eight files remain proposals. The only database-safe next step is owner-approved schema-only baseline evidence plus a genuinely isolated synthetic database.
- The first SQL execution review should start with migration 001's drop/recreate behavior and the authoritative `is_administrator()` helper, then validate the independent reporting RPCs, outbox foundation, cancellation hook, and notification-log ACL change in their dependency order.

### Frontend RPC contract cross-check

The current `AdminDashboard.jsx` call sites were compared with the proposal RPC return columns. The displayed field names are aligned at source level:

- Volume: `referral_count`, `small_cell_suppressed`, lifecycle counts and their suppression flags.
- Facility summary: `facility_label`, `referral_count`, `small_cell_suppressed`, `complementary_suppressed`.
- LGA summary: `lga_label`, `referral_count` and suppression flags.
- Coverage: `coverage_group`, `facility_count` and suppression flags.
- Pathway: `referral_count`, acknowledgement/arrival medians and p90 values, plus interval suppression flags.
- Delay alerts: `alert_label`, `alert_count` and suppression flags.

This confirms only the current source-level property contract; it does not validate PostgREST schema-cache visibility, SQL return metadata, RPC execute grants, role authorization, or runtime rendering against a database. The frontend currently handles RPC errors with explicit “not yet available” messages, which is appropriate while these migrations remain unapplied.

## 10. Aggregate disclosure review — overlapping-window differencing risk

A focused source review of the five reporting RPCs found that the facility, LGA, coverage and pathway summaries require exactly one complete Africa/Lagos calendar month. Their source applies primary suppression to groups with 1–4 records and complementary suppression when exactly one small group exists within a reporting direction/grouping.

The referral-volume RPC is different: `get_admin_referral_volume(p_start_date, p_end_date)` accepts any valid date range up to 366 days. It suppresses individual counts from 1–4, but it does not require a fixed, non-overlapping reporting period. An administrator able to issue repeated overlapping date-range requests could subtract one returned aggregate from another and potentially recover a count that was suppressed in one of the responses. This is a query-composition/differencing risk; the single-response small-cell rule does not by itself prevent it.

**Decision: disclosure control not yet sufficient for approval.** Before the volume RPC is approved, choose and test a consistent period policy. Preferred options are:
- constrain the RPC to one complete calendar month, matching the other aggregate RPCs; or
- expose only server-defined, non-overlapping time buckets and prevent arbitrary overlapping ranges.

If the dashboard requires a custom date range, implement the aggregation as a sum of fixed protected buckets only if the API cannot expose bucket-level combinations that reintroduce differencing. Do not rely solely on client-side date-picker restrictions. Add synthetic tests for adjacent, nested, shifted and boundary-crossing date windows, including cases where a hidden 1–4 count can be recovered by subtraction.

The existing complementary suppression rule also needs formal test cases for multiple small groups, one small group plus a visible complement, zero-count groups, and combinations across separate reporting RPCs. It is a basic disclosure-control measure, not a formal privacy guarantee. Administrator-only access reduces the audience but does not eliminate the risk.

No SQL or frontend behavior was changed as part of this review. This is a source-level finding requiring a design decision and synthetic database validation before any migration is applied.

## 14. Aggregate reporting period disclosure control — 8 November 2026

A source review identified that `public.get_admin_referral_volume(date, date)` accepted any date interval up to 366 days, while the facility, LGA, coverage and pathway reporting RPCs required one complete calendar month. Repeated overlapping windows could allow a caller to infer counts hidden by the 1–4 small-cell suppression rule.

### Source-level mitigation

- The proposed referral-volume function now accepts exactly one complete calendar month: the start date must be the first day of that month and the end date must be its final day.
- The administrator reporting UI defaults to the latest completed Africa/Lagos calendar month and offers prior complete-month shortcuts only.
- Manually selected partial, rolling or cross-month windows do not trigger aggregate RPC requests. The screen explains the disclosure-control restriction.
- Regression coverage checks the SQL date guard, the UI request guard, and complete-month calculation across Lagos timezone boundaries, year changes and leap February.

### Validation and limits

This is a source-only correction to an unapplied proposal migration and the working branch UI. It does not alter the live Supabase schema, ACLs, RLS, migration ledger, production data or deployment. The SQL guard still requires execution in an approved isolated synthetic-data environment after the missing historical migration baseline is reconciled. Complementary suppression and cross-filter testing for each aggregate dimension remain release requirements.

## 15. Live environment and advisor recheck — 8 November 2026

A fresh read-only check of the connected REFLINK Supabase project confirmed:

- Project status is `ACTIVE_HEALTHY`.
- The migration ledger still contains only `20260928203447_reflink_v2_rural_first`. Its historical SQL source is not present in the working repository.
- The only listed development branch is named `main`, is non-persistent and has `with_data=false`; its `project_ref` and `parent_project_ref` both point to the production project reference. It is not accepted as an approved isolated integration environment for the proposed migration replay.
- No patient rows were read, and no migration, schema object, policy, grant, Auth setting, secret or branch was changed.

### Security advisor findings observed at 09:16 UTC

| Finding | Count | Required handling |
|---|---:|---|
| RLS enabled with no policy (`referral_events`, `referral_feedback`) | 2 | Remain fail-closed until intended role/facility access is defined and tested. |
| Authenticated-callable SECURITY DEFINER routines | 5 | Review ownership, body, search path, ACL and direct-RPC authorization; do not blindly revoke functions with policy dependencies. |
| Leaked-password protection disabled | 1 | Plan an Auth configuration change only after a reviewed rollout and user-impact assessment. |

### Performance advisor findings observed at 09:16 UTC

| Finding | Count | Required handling |
|---|---:|---|
| Foreign keys without a covering index | 16 | Prioritise from measured joins, parent-row update/delete behavior, table size and query plans; do not add all indexes blindly. |
| RLS policies with per-row auth/current-setting evaluation | 17 | Assess safe `(select auth.uid())` / equivalent rewrites against each exact policy and regression-test the effective access rules. |
| Unused indexes | 5 | Treat as candidates only; inspect workload and retention windows before removal. |
| Multiple permissive policies on the same role/action | 4 | Review policy overlap and OR semantics before consolidation; do not merge policies based only on a linter warning. |

These advisor results are metadata/performance observations, not authorisation to change the live schema. The baseline and isolated synthetic-database release gates remain in force.

## 16. Receiving assessment direct-discharge handover completeness — 8 November 2026

A source-level review found a path from `under_assessment` directly to `discharged` in the assessment disposition selector. That path wrote `discharged_at` but did not require the structured discharge diagnosis, condition-at-discharge and follow-up fields required by the separate inpatient discharge form.

The application now requires those three fields for the direct-discharge path and persists them with the status/timestamp update. Discharge medications remain optional. Existing values are restored when reopening the assessment. A regression source-contract test protects the validation and persistence contract.

This change does not define clinical discharge eligibility, replace professional judgement, or prove database enforcement. The status update remains a client-side compare-and-set operation. A database-side invariant and authenticated synthetic-role integration test still require the reconciled schema baseline and approved isolated database. No production database was modified.

## 17. Receiving queue counter-referral relation shape — 8 November 2026

The receiving referral projection uses `counter_referral:counter_referrals(*)`. Because this is a one-to-many PostgREST relation, a referral without a counter-referral is returned with an empty array rather than necessarily `null`. JavaScript treats `[]` as truthy, so checks using `!referral.counter_referral` incorrectly classified discharged referrals with no counter-referral as closed and excluded them from the pending KPI.

The source now normalises the relation shape: arrays are present only when `length > 0`, while a non-null object represents a present relation. Both active-queue classification and pending-counter-referral metrics use the shared helper. Regression fixtures cover null, empty and populated arrays.

This is an application-level data-shape correction. It does not establish the database foreign-key relationship, RLS visibility or production PostgREST response contract; those remain subject to synthetic-database validation after baseline reconciliation.

## 18. Fresh schema-baseline cross-check — 8 November 2026, 14:06 UTC

A second read-only inspection was performed against the linked Supabase project using the migration ledger, verbose public table inventory, and PostgreSQL catalogs for public/private routines, non-internal triggers, policies and selected indexes. The query scope was metadata only; no patient/application rows, auth-user rows, secrets or storage contents were selected.

### Migration and environment facts

- The remote migration ledger still contains only `20260928203447_reflink_v2_rural_first`.
- The connected project's only listed branch remains `main`, non-persistent, `with_data=false`, with both `project_ref` and `parent_project_ref` equal to the production project. It is not isolated staging.
- The repository contains eight November 2026 proposal migrations and no source file for the sole recorded historical migration.
- The public schema inventory confirms the current production referral status CHECK permits: `draft`, `sent`, `acknowledged`, `patient_arrived`, `under_assessment`, `admitted`, `discharged`, `referred_again`, `completed`, and `cancelled`. It does not permit `rejected`.
- The current status-transition trigger permits cancellation at pre-completion stages and `referred_again` transitions, but has no rejection transition. A receiving-facility rejection must not be silently represented as cancellation; a distinct status and mandatory reason need a reviewed schema/application contract.

### Confirmed referral audit and trigger model

The live catalog confirms the following trigger functions and triggers on the current public schema:

- `referral_status_transition_validation` invokes `validate_referral_status_transition()` before status updates.
- `referral_status_audit_trigger` invokes `log_referral_status_change()` after status updates. That function inserts the new status, actor and standard note into `public.referral_updates`.
- `referral_counter_referral_guard` invokes `require_counter_referral_before_completion()` before status updates and blocks transition to `completed` until a structured counter-referral exists.
- `referral_ack_due_at_trigger` maintains `ack_due_at` from urgency and creation time.
- `referrals_audit_mutation` and `counter_referrals_audit_mutation` invoke `audit_referral_mutation()` after row insert/update/delete. That function writes full OLD/NEW row JSON into `public.audit_log`; this means referral and counter-referral PHI may be duplicated in audit storage and requires a dedicated retention, access and data-minimisation review.

The application status timeline is therefore backed by a database status-history trigger writing to `referral_updates`. This is not evidence of an append-only/immutable audit guarantee: the current table has a participant SELECT policy and no demonstrated immutability enforcement in the reviewed trigger/function set. The `referral_events` table has no policy in the current catalog and no writer trigger in the reviewed trigger inventory; the current frontend source does not write to it. `referral_feedback` likewise has no policy. Keep both fail-closed until a least-privilege use case is defined.

### Consequences for the next implementation steps

1. Preserve the existing `referral_updates` status-history mechanism; do not duplicate status events in `referral_events` without a clear event taxonomy and idempotency contract.
2. Design rejection as a distinct terminal or recoverable pathway only after clinical governance defines who may reject, allowed reasons, whether the referring facility can resubmit, and what status transition follows. Do not reuse `cancelled`.
3. Add a separate assessment-start timestamp only after schema baseline recovery and a synthetic migration test; the current live schema inventory has no `assessment_started_at` column.
4. Review full-row audit JSON capture for PHI minimisation, access control, retention, and safe redaction. Do not inspect existing audit rows as part of this work.
5. Obtain a complete schema-only export / authoritative migration history and establish a separate synthetic-data database. The current metadata exports are valuable reconciliation evidence but are not a restorable schema dump and do not resolve the missing historical migration.

No live schema, policy, grant, migration ledger, Auth setting, branch, patient record or deployment was changed.


## 12. Isolated staging project provisioned — 8 November 2026

A separate Supabase project has now been created after the owner explicitly authorised the target project and region and resolved the free-project limit.

- Project: `reflink-synthetic-staging`
- Project ref: `rcskuzmvyugbanygizri`
- Organisation: `reflink` (`kczzvburxzfubiqhpcxd`)
- Region: `eu-west-2`
- Status at verification: `ACTIVE_HEALTHY`
- PostgreSQL: 17
- API URL: `https://rcskuzmvyugbanygizri.supabase.co`

Initial read-only checks on the new project:
- `public` contains no application tables.
- Migration ledger is empty.
- Security advisor returned no lints.
- Performance advisor returned no lints.
- No production records, auth users, secrets or storage contents were copied.

The staging project is now an isolated target, but it is not yet a REFLINK application environment. Do not connect the application or create Auth users until the baseline, schema, grants, RLS and required Auth configuration are prepared and reviewed.

## 13. Historical migration recovery attempt — 8 November 2026

A GitHub commit-history query for the exact path `supabase/migrations/20260928203447_reflink_v2_rural_first.sql` returned an empty list. This confirms the migration is not recoverable from the accessible Git history at that path. It does not prove that no separate private archive or owner-held export exists.

The existing `docs/catalog_exports/20261107_live_public_schema_catalog.md` and `docs/catalog_exports/20261107_live_public_routines.md` remain metadata evidence only. Their own headers explicitly exclude complete DDL/dependencies and state that they are not restore artifacts. Do not turn either export into an executable baseline.

**Decision remains:** obtain an owner-approved schema-only export from production using an approved Supabase/PostgreSQL export workflow, excluding all table data, auth records, secrets and storage contents. Include public and required non-public application schemas, extensions, types, functions, triggers, views, policies, grants, ownership and dependencies. Review and sanitize the dump before using it in staging. Production remains read-only.

## 14. Six-step staging execution status

| Step | Status | Evidence / gate |
|---|---|---|
| 1. Recover/establish baseline | Blocked | Historical migration absent from branch and accessible Git path history; existing catalog exports are incomplete. |
| 2. Reconcile proposal migrations | Partial | Eight files and their dependency relationships inventoried; exact baseline/object-level compatibility still needs schema-only export and replay analysis. |
| 3. Prepare synthetic fixtures | Specification required before execution | No schema or test identities exist yet. Define synthetic facilities, role identities and referrals only after baseline is restored. Never copy production data. |
| 4. Apply migrations to staging | Not started | Must not apply until the baseline has been reconstructed, reviewed and proven repeatable. |
| 5. Integration/security tests | Static only | Repository governance tests exist; live PostgreSQL/RLS/trigger/concurrency/aggregate-disclosure tests remain pending. |
| 6. Advisor verification | Initial clean scan | Security and performance advisors both returned no lints on the empty staging database. Re-run after every schema batch. |

The empty staging advisor scan is only a clean-initial-state result; it is not evidence that the proposed REFLINK schema is secure.


Synthetic fixture and database integration acceptance scenarios are specified in [STAGING_SYNTHETIC_TEST_PLAN.md](./STAGING_SYNTHETIC_TEST_PLAN.md). This is a test specification only; no Auth identities, synthetic rows, migrations or schema objects have been created in staging yet.
