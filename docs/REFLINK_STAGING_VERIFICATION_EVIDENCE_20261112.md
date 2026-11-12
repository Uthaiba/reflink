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
