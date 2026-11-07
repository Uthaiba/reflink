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

A fresh read-only migration-ledger query again returned exactly one recorded version: `20260928203447_reflink_v2_rural_first`. The branch's `supabase/migrations/` directory contains the seven November 5–6 proposal files listed above, but **does not contain the SQL file for the recorded 20260928203447 baseline**.

A metadata-only catalog inventory returned 16 live public routines. All 16 are owned by `postgres`; none is defined by the eight proposed November migrations. The seven files define new reporting, counter-referral and notification-outbox routines, not the missing historical baseline. Therefore, the branch cannot currently recreate the live public routine layer from its migration history.

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

The baseline is not ready to reconstruct from the current seven proposal files. The next source-control deliverable must be a separately reviewed, metadata-backed baseline package containing:

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

A source-only search of the current branch confirms that the React application already contains callers for proposed functions that are defined only in the seven unrecorded November migrations:

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
