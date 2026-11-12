# REFLINK staging verification evidence — 2026-11-12

Scope: Supabase staging project `rcskuzmvyugbanygizri` only. Production project `uwwzbljufqbzkjflpnll` was not accessed or modified.

## Read-only live staging inventory
- 14 public base tables
- 25 public functions
- 10 non-internal public triggers
- 23 public foreign-key constraints
- 3 facilities
- 1 Auth user
- 1 profile
- 0 referrals
- 22 migration-ledger entries

## Executed staging gate
Source: `supabase/tests/staging_migration_equivalence_readonly.sql` on branch `reflink/staging-baseline-reconstruction-20261110`.

**Result: 16 PASS, 1 FAIL.** The sole failing control is `migration_ledger_current`, which checks for version `20261111201500`. All other gate controls passed, including RLS, investigation storage policy, anonymous access denial, administrator analytics guard, offline idempotency and role escalation guard.

This is evidence of the tested controls only, not a complete proof of schema equivalence or a substitute for authenticated end-to-end testing.

## Operator-local backup rehearsal (user-provided results)
- Custom-format staging archive `reflink-staging.dump` was created locally and `pg_restore --list` succeeded.
- Full restore into local PostgreSQL 18.6 stopped on unavailable `supabase_vault` extension.
- Public-schema-only restore stopped when a foreign key referenced absent `auth.users`.
- The partial local restore contained 14 public tables, 25 functions, 10 triggers, **0 foreign keys**. Estimated rows: 3 facilities, 1 profile, 0 referrals.
- **Recovery status: partial rehearsal only; full restorable Supabase backup not verified.** The archive is on the user's local machine, not in the repository.

## Release blockers / next actions
1. Obtain Supabase-compatible full restore verification, or formally record the unresolved recovery risk.
2. Independently review final effects of all 13 unrecorded source migrations; do not replay historical migrations or repair the ledger until equivalence and recovery gates are approved.
3. Provision synthetic-only staging facilities and Auth users using controlled procedures; no real patient records.
4. Run authenticated PHC, receiving staff, outsider, and administrator positive/negative referral lifecycle tests.
5. Re-run CI and the read-only staging gate after approved changes; no production merge/deployment without explicit release authorization.

**No staging SQL writes or production changes were made during this verification.**

## Controlled synthetic fixture change — 2026-11-12
- Added one synthetic staging-only general hospital: `REFLINK TEST RECEIVING D` (UUID `c3480dd1-06e9-4c41-971b-197b0a4f048e`), active, state Yobe, fictional Test LGA D.
- Insert was guarded against duplicate facility names. Verified **4 facilities total: 2 PHCs and 2 general hospitals**.
- Referral count remained **0**. No Auth users, profiles, referrals, migrations or production data were changed in this step.
- This controlled fixture change is later than the read-only baseline above. The initial statement that no staging writes were made applies only to the earlier verification phase.
- Remaining: approved synthetic Auth account provisioning and referral fixture creation, authenticated access suite, migration ledger reconciliation and full recovery verification.

## Staging Edge Function deployment — 2026-11-12
- Repository commit `4da9e369d97f9c6c060e571395c46add7244b6fc` passed GitHub Actions quality gate run **#450**.
- Deployed `supabase/functions/create-user/index.ts` to **staging only**, Supabase Edge Function `create-user` **version 5**, status **ACTIVE**, JWT verification **enabled**.
- Fetched deployed function and confirmed the new role/facility validation messages exist in its source.
- Post-deployment database counts: **4 facilities, 1 profile, 1 Auth user, 0 referrals**.
- The deployment is confirmed, but **authenticated positive/negative behavior tests have not run**. No synthetic Auth users were provisioned.
- Production function and production database were not modified.

## Clinical fixture readiness gate — 2026-11-12
Executed existing repository test `supabase/tests/staging_clinical_fixture_readiness_readonly.sql` against staging, without changing records. Result: `NOT_READY`.
- Active PHCs: **2**; active hospitals: **2**; administrator profiles: **1**.
- PHC staff profiles: **0**; receiving staff profiles: **0**; distinct receiving staff facilities: **0**.
- Synthetic referrals: **0**; non-test referrals: **0**.
- No additional fixture SQL file was created: the existing readiness test was reused.
- To complete acceptance, use authenticated administrator provisioning through the deployed staging `create-user` v5 function with privately held synthetic credentials. Never commit credentials, bypass Auth, or claim runtime success without test results.

## CI recovery and migration ledger recheck — 2026-11-12
- GitHub Actions PR quality gate **#456** failed due to a literal escaped newline in the staging Auth acceptance runner. Corrected in commit `329dda83695e6a9661a88ecee8a4f056fc0db02c`.
- GitHub Actions PR quality gate **#458** completed **SUCCESS**; independently checked all three jobs: frontend lint/production build, Supabase Edge Function type check, and migration integrity.
- Queried the staging migration ledger for the 13 unrecorded source versions. **None** of those 13 versions are recorded. This is a history mismatch, **not proof** that their effects are absent.
- Ledger repair and historical migration replay remain **blocked** pending independent final-effect equivalence review and full recovery readiness. No migration ledger writes performed.

## Post-baseline migration effect matrix — 2026-11-12
Executed the existing read-only `supabase/tests/staging_post_baseline_migration_effect_matrix_readonly.sql` on staging.
- **13/13 final-effect checks PASS**.
- **0/13 migration versions recorded** in `supabase_migrations.schema_migrations`.
- The 13 checks cover investigation Storage policy removal and participant access, offline idempotency and validated constraint, notification participant access, investigation registration guards, and analytics execution privileges.
- This is cumulative final-state evidence only, not proof that intermediate migrations ran or exact source-to-catalog equivalence. **No migration repair or historical SQL replay performed.**
- Full backup recovery validation and independent source-to-catalog review remain release gates.

## Consolidated staging verification batch — 2026-11-12
- CI #464 completed **SUCCESS** for `7248f0115c32ab228a4f79dfc57676377a7e51ae`.
- Executed `staging_post_baseline_migration_ledger_readonly.sql`: **13/13 missing** migration versions; no ledger writes.
- Executed `staging_migration_repair_data_preflight_readonly.sql`: **PASS** data-integrity preflight; 0 referrals, 1 profile, 4 facilities, 0 duplicate/invalid offline keys.
- Corrected invalid PostgreSQL regular-expression syntax in `staging_exposed_security_definer_inventory_readonly.sql` (commit `00b603a39b3f0531f2cd2db5532a4d411c144887`); executed corrected query successfully. It enumerates **14** authenticated-callable public SECURITY DEFINER functions for manual privilege/authorization review. Heuristic guard-reference flags are **not** proof of secure function behavior.
- Executed four existing rollback-protected SQL negative tests without SQL errors: `staging_authenticated_role_missing_identity_negative.sql`, `staging_unassigned_authenticated_identity_negative.sql`, `staging_unassigned_profile_confidentiality_rls.sql`, `staging_privileged_rpc_unassigned_identity_negative.sql`. Tool returned no NOTICE output; execution success is not equivalent to real Auth end-to-end acceptance.
- **Remaining release blockers:** approved synthetic clinical Auth accounts and referral fixture; actual authenticated E2E acceptance; independent exact migration equivalence; full restorable backup rehearsal; release approval. No production changes or migration repair.

## Additional staging SQL authorization tests — 2026-11-12
- Latest previous evidence commit `f31b5d9cbf967055f0ee311a20bf42ccb70eb3c8` passed GitHub CI #470.
- Executed four further existing staging SQL tests successfully (no SQL exception):
  1. `staging_investigation_registration_unauthenticated_negative.sql`
  2. `staging_administrator_analytics_positive.sql`
  3. `staging_admin_reporting_rpc_role_matrix.sql` (six administrator reporting RPCs, negative and positive simulated identities)
  4. `staging_admin_predicate_and_print_audit_role_matrix.sql`
- Total in these two consecutive batches: **8 SQL authorization test scripts executed successfully**. Four scripts use simulated database JWT claims and do not demonstrate real Auth sign-in behavior.
- Existing migration final-effect matrix remains 13/13 PASS, but all 13 versions remain unrecorded. No migration ledger modifications.
- No production writes, clinical data changes, or Auth provisioning.

## Real Auth acceptance and exact migration-catalog investigation — 2026-11-12
- Operator executed the staging-only provisioner successfully: synthetic PHC, receiving-hospital and outsider accounts were created using private credentials. No credentials were transmitted in chat.
- Operator ran the synthetic referral creator. It detected existing test referral `b7e4d67f-fd6e-4dc5-a82f-a53b98a3013b` and inserted no duplicate. Direct staging SQL confirmed `is_test=true`, `status=sent`, a PHC-staff author at REFLINK TEST PHC A and destination REFLINK TEST RECEIVING B, with matching author facility.
- Operator executed `scripts/staging-authenticated-referral-access.mjs` and reported `PASS: real Auth sign-in, profile roles, referral visibility, facility isolation, profile privacy, notification isolation and analytics authorization`. This is operator-reported runtime evidence, not an independently executed connector-side test.
- Supabase CLI `migration list --linked` (operator output) showed 21 matching local/remote versions, 14 local-only versions, and one remote-only version `20261110194223`.
- Independently retrieved the remote-only ledger row's `statements`: its SQL matches local `20261110184000_restrict_counter_referral_clinical_read_to_participants.sql`; only the version differs. This establishes text equivalence for that pair, not authorization to change migration history.
- Independently compared source migration SQL with live staging catalog: counter-referral participant SELECT policy; investigation Storage SELECT/INSERT policies; absence of DELETE/UPDATE/REPLACE policies; offline idempotency partial unique index; notification participant SELECT policy; validated offline retry-key CHECK constraint; latest `register_referral_investigation_files(uuid,jsonb)` SECURITY DEFINER function definition (including zero-length, null, immutable metadata and descriptor validation); guarded analytics RPC EXECUTE privileges. All examined final-state definitions matched their intended migration effects.
- The 13 November 11 migration versions remain absent from the ledger. Final-state equivalence does not prove intermediate migration execution, absence of historical drift, or full database equivalence. No ledger repair, SQL migration replay, production changes, or recovery claims were made.
- **Recovery remains BLOCKED:** local archive listing succeeded but prior full restore attempts failed on Supabase Vault/Auth dependencies; no successful full restorable Supabase-compatible backup has been demonstrated. A dedicated disposable restore environment and documented recovery test are prerequisites to release or ledger modification. Avoid creating billable Supabase branches without explicit approval.
- **Further clinical acceptance remains BLOCKED:** real Auth access test passed, but complete referral lifecycle transitions, investigation file upload/registration, offline retry/idempotency and rollback/recovery tests still require synthetic-only staging evidence.
