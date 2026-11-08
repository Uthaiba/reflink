# REFLINK Migration Governance

The live Supabase project currently reports a migration-history entry but the production repository does not contain a complete source-controlled migration baseline. Therefore:

1. Do not run `supabase db push` from this branch yet.
2. Export and review the existing remote schema and migration history in a non-production workspace.
3. Reconstruct or baseline the existing schema without replaying destructive DDL.
4. Validate each proposed migration against a disposable database.
5. Only then apply approved migrations through a reviewed deployment process.

The migration in `supabase/migrations/20261105000100_admin_aggregate_referral_volume.sql` is a proposed, additive RPC. It intentionally does not add administrator row-level SELECT access to referrals. It is not applied to the connected production database.

## Read-only schema verification (5 November 2026)

The connected production database was inspected through metadata/catalog queries only; no patient-level rows were queried or changed.

Verified against the live schema:

- `public.referrals.is_test` exists and is non-null with a default of `false`.
- `public.counter_referrals` contains the columns used by the proposed RPC: `referral_id`, `receiving_user_id`, `final_diagnosis`, `treatment_provided`, `outcome`, `follow_up_instructions`, `referred_further_to`, and `additional_notes`.
- `counter_referrals.referral_id` is unique, and its outcome constraint permits `recovered`, `improved`, `referred_further`, `died`, and `other`.
- The existing referral status-transition trigger permits `discharged -> completed`; the counter-referral guard checks for a counter-referral row before completion.
- The existing status-audit trigger records status changes in `referral_updates`.
- The remote migration history currently contains one recorded migration: `20260928203447_reflink_v2_rural_first`.

These checks reduce schema-assumption risk but do not prove that the proposed migration compiles, that the function owner/privileges are correct, or that the transaction works under concurrent authenticated requests. Those tests still require a non-production database and synthetic accounts/referrals.

## Verified baseline and branch re-check (7 November 2026)

- Git tree inspection of `v2.0-release` and `main` found no historical `supabase/migrations/` directory. The remediation branch contains only the eight November proposal migrations; the source for recorded production version `20260928203447_reflink_v2_rural_first` remains absent.
- A fresh read-only migration-ledger query returned only `20260928203447_reflink_v2_rural_first`.
- The only listed Supabase branch is named `main`, non-persistent and data-free, but its `project_ref` is the production project reference. It is not an isolated synthetic integration environment and must not be used for synthetic referral testing.
- The project catalog includes existing production records. No test records were created or changed.
- Added a migration-governance regression test to ensure the missing historical migration is not fabricated and that the baseline reconciliation gate remains explicit.

## Environment constraint

Supabase database branching was unavailable for the connected Free-plan organisation. No branch was created. A separate development project is the alternative under consideration; it must be created only after the project owner confirms the target organisation and the project-creation process confirms its cost. Do not use the production project as a test environment.

## Security advisor observations

The latest read-only Supabase security advisor reported:

- RLS-enabled tables `referral_events` and `referral_feedback` have no policies. Do not add broad policies without defining the intended least-privilege access model.
- Five callable `SECURITY DEFINER` functions are exposed to authenticated users: `get_facility_user_count`, `get_facility_user_counts`, `is_administrator`, `log_referral_print`, and `log_referral_read`. Review each function's authorization checks, search path, grants and data returned before changing privileges.
- Leaked-password protection is disabled. Treat this as an Auth configuration remediation item; do not change production Auth settings without a separately reviewed change and acceptance test.

The advisor findings are not proof of exploitation. Remediation must preserve required referral operations and be verified with synthetic users representing each role and facility.

## Follow-on development safeguards

- Disclosure-control unit tests are implemented in `tests/rphiDisclosure.test.js` and run through `npm test` in the quality workflow.
- `docs/OFFLINE_PHI_THREAT_MODEL.md` defines the threat model and acceptance criteria for application-layer encryption, key lifecycle, endpoint controls, queue retention and server-side re-authorisation. The current branch integrates encrypted queue writes, owner-scoped reads, explicit legacy-record migration, account-scoped vault locking and sync claims; existing legacy plaintext records can remain until successfully migrated. Chromium CI covers selected persistence, migration, multi-tab and account-isolation scenarios. This is not production approval or proof against same-origin compromise, managed-device risks, storage eviction, or Firefox/WebKit incompatibility.
- `docs/NOTIFICATION_OUTBOX_DESIGN.md` defines a durable server-side notification architecture. The current browser SMS request remains best-effort; no outbox schema or worker has been deployed.
- The `is_administrator()` helper has 12 recorded policy dependency entries in the connected production catalog. Do not revoke authenticated execution until every policy and function dependency is mapped and tested.
- The proposed aggregate RPC uses `public.is_administrator()`; its own grants, SECURITY DEFINER owner, dependency and behavior must be tested in non-production before release.

## Reconciliation workstream

The detailed source migration inventory, dependency graph, read-only evidence, object-level review requirements and non-production acceptance gates are maintained in [MIGRATION_RECONCILIATION_PLAN.md](./MIGRATION_RECONCILIATION_PLAN.md). The current decision is **blocked pending baseline reconciliation and synthetic-data staging verification**. Do not apply any of the eight November 2026 source migrations to production or manually advance the remote migration ledger.

## Source-level migration contract tests

- `tests/migrationGovernance.test.js` checks migration version ordering, the acknowledgement-hook dependency, cancellation-only reminder lifecycle semantics, service-role-only outbox grants, administrator guards on reporting RPCs, and receiving-role/facility checks for counter-referral completion.
- The acknowledgement hook currently cancels stale reminder work after relevant referral lifecycle changes. It does not enqueue reminders, infer recipients, or dispatch messages.
- These are static source-contract checks. They do **not** parse or execute PostgreSQL, validate function ownership against the live database, prove RLS behavior, or replace disposable-database integration tests.
- The checks run with `npm test` in CI and are a preflight guard against accidental source regressions only.

## Index review status

A prior read-only catalog review reported 16 foreign-key columns without a supporting index. The exact table/column list and index definitions were not preserved in the source-controlled evidence available to this branch. No index migration should be generated from the count alone: first export the exact foreign-key constraints and existing index definitions, then verify column order, partial-index predicates, uniqueness, workload/query plans and write overhead. Add only indexes demonstrated to be missing and useful, and validate them in a disposable database. Do not run `CREATE INDEX` or `CREATE INDEX CONCURRENTLY` against production as part of this source-only work.


## Public-schema export review — 8 November 2026

The project owner supplied a schema-only `public` export. It contains 14 public tables, all with RLS enabled; 16 functions; 2 views; 9 triggers; 23 foreign keys; and 30 RLS policies. No table data was included.

New findings that must be included in staging remediation design:

- `authenticated` has `TRUNCATE`, `TRIGGER`, `REFERENCES`, `MAINTAIN` and `SELECT` privileges on `public.audit_log`. RLS does not protect against TRUNCATE. Reduce this ACL while preserving administrator-only SELECT via RLS and trusted audit writes.
- Default privileges for `postgres` in `public` grant ALL on future tables and sequences to `anon`, `authenticated` and `service_role`. Replace broad defaults with least-privilege defaults and explicit grants per object.
- Referral and counter-referral audit triggers write full OLD/NEW row JSON. Review audit-field minimisation, retention and access.
- `public.referral_analytics` contains referral-level and patient-identifier fields; its explicit grant is service-role-only. Do not expose it to browser roles or use it as the R-PHI aggregate source.
- `referral_events` and `referral_feedback` are RLS-enabled and service-role-only in the exported ACL/policy state. Do not add broad policies.
- A separate `public.users` table exists alongside Auth-linked `public.profiles`; clarify the authoritative identity source before using either for recipient selection or analytics.
- `log_referral_print()` uses `MAX(print_number)+1` without a uniqueness constraint on referral/print number; concurrency-safe allocation remains a staging test requirement.

The public export does not include Auth/Storage managed schemas, Auth settings, Storage bucket configuration, Realtime publication metadata or extension inventory. These remain separate metadata-only preflight requirements. Production remains read-only; no migration or ACL change has been applied.


## Additional Supabase platform metadata — 8 November 2026

A read-only catalog/API pass confirms:

- PostgreSQL 17.6.1.166.
- Installed extensions: `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`.
- No additional application-owned schema beyond `public` was found. The proposed `private` notification schema is not present.
- No custom non-internal triggers were found on `auth` tables.
- One private Storage bucket exists: `referral-investigation-results`, 10 MiB maximum, PDF/JPEG/PNG/WebP/text/plain/CSV MIME allowlist.
- Five authenticated Storage policies cover SELECT, INSERT, UPDATE and DELETE, with referral-path matching and referring-user/facility membership checks.
- Realtime publication `supabase_realtime` contains only `public.referrals`.
- Default privileges on future public objects are broad for both `postgres` and `supabase_admin`, not just `postgres`. New public tables/sequences/functions can inherit browser-role grants. This increases the priority of default-privilege remediation in staging.
- No Auth table triggers were found, but this does not establish Auth dashboard configuration.

Auth settings (including leaked-password protection, MFA, providers, redirect URLs, rate limits and SMTP) remain a Dashboard-only verification item. Do not export Auth users or secrets. Storage policies and default ACLs are documented as baseline evidence only; no production settings or privileges were changed.


## Database least-privilege hardening proposal — 8 November 2026

Added [SECURITY_HARDENING_PROPOSAL.md](./SECURITY_HARDENING_PROPOSAL.md) and a source-contract regression test. The proposal records the live `audit_log` ACL, broad public-schema defaults for both `postgres` and `supabase_admin`, and the role-membership constraint discovered during read-only catalog inspection.

Important execution constraint: the catalog shows no membership of `postgres` in `supabase_admin`. A migration executed as `postgres` must not assume it can change that creator's default privileges. Obtain an authorised owner-level path or keep new public objects created by `supabase_admin` blocked from release. Existing function grants must be reviewed individually; do not blanket-revoke authenticated EXECUTE because current workflow helpers and policy dependencies rely on selected calls.

The candidate audit-log revoke is limited to `TRUNCATE`, `REFERENCES`, `TRIGGER` and `MAINTAIN`; preserve the existing administrator-only SELECT RLS contract and prove the audit trigger writer path in synthetic staging before narrowing write privileges. This is a proposal, not a migration. No production or staging DDL was executed. The new Node source-contract test checks the proposal's safety gates; it does not execute PostgreSQL.
