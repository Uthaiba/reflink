# REFLINK Migration Reconciliation Plan

**Status:** Investigation and source review only. No production migration, schema mutation, migration-ledger update, or staging deployment has been performed.

## 1. Current evidence

The connected Supabase project's last read-only migration-ledger inspection returned exactly one recorded version:

- `20260928203447_reflink_v2_rural_first`

The current source branch contains seven later SQL files. Their absence from the remote ledger means they must be treated as **not recorded as applied**. It does not, by itself, prove that every object referenced by those files is absent from the live schema: some objects may predate the ledger entry, have been created manually, or be represented by a differently named migration.

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
| `20261106000100` | `20261106000100_referral_acknowledgement_notification_hooks.sql` | Referral/profile triggers to enqueue due-time in-app reminders | Explicitly depends on `20261105000600`. Do not apply before the outbox objects and all trigger dependencies are verified. Review SECURITY DEFINER ownership and trigger interactions. |

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

The repository now includes `tests/migrationGovernance.test.js`. It statically checks the seven migration versions, the explicit outbox-to-hook dependency, stored acknowledgement deadline and in-app-only queue behavior, service-role-only outbox function grants, administrator checks for reporting RPCs, and receiving-role/facility checks for counter-referral completion.

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
