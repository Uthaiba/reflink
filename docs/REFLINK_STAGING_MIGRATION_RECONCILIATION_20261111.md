# REFLINK staging migration-history reconciliation — 11 November 2026

## Scope and release boundary
Only synthetic staging project `rcskuzmvyugbanygizri` and branch `reflink/staging-baseline-reconstruction-20261110`. Never apply this procedure to production. Preserve existing clinical data and do not merge PR #2 without release approval.

## Confirmed evidence
- Staging `supabase_migrations.schema_migrations` has 22 recorded versions, latest `20261110203341`.
- The staging `public.register_referral_investigation_files(uuid,jsonb)` function exists, is SECURITY DEFINER with a pinned empty search_path, grants authenticated EXECUTE and denies anon EXECUTE.
- Repository includes later investigation-file migrations, including `20261111200000_reject_null_investigation_registration_payload.sql` and `20261111201500_require_complete_investigation_file_descriptors.sql`. These versions are not in the 22-entry ledger.
- Previous direct SQL changes to staging may have installed the function without recording the source migration version. A deployed function is not evidence that every migration side effect is installed.

## Reconciliation procedure (no blind writes)
1. Enumerate **all** migration files on the staging branch, including those added after `20261110203341`. Compare by exact version and filename with the 22 database rows. Do not assume only two migrations are missing.
2. For every missing version, inspect the complete SQL, including DDL, grants, storage policies, triggers, and any data changes. Inventory current staging catalog objects, definitions, ownership, privileges, RLS and dependencies. Compare normalized `pg_get_functiondef` where relevant.
3. Categorize each migration as (A) absent and safe to apply, (B) already applied with *all* intended effects proven, or (C) partially applied / ambiguous. Record evidence for each.
4. For (A), apply through the normal migration mechanism in order, using the staging project only. For (B), consider marking the version applied **only after** independent equivalence review and a rollback plan. For (C), author a narrowly scoped, idempotent repair migration and verify before recording history.
5. Do not replay a CREATE OR REPLACE FUNCTION merely to silence drift if it could downgrade a newer implementation. Do not directly INSERT into `supabase_migrations.schema_migrations` as a shortcut. Never mark an unverified migration applied.
6. Re-run migration integrity CI and compare ledger to repository again. Verify anonymous denial, PHC ownership/facility checks, immutable registered-file metadata, file descriptor validation, referral-scoped Storage and no unexpected grants.
7. Run Auth-issued synthetic end-to-end clinical tests before any release: PHC A, receiving hospital B, unrelated PHC C, administrator; attachments, notifications, counter-referral, cross-facility denial and offline retry. Browser testing is a separate gate from SQL assertions.

## Status
Reconciliation **not yet executed**. This is a documented staging-only procedure, not an assertion that migration history has been repaired. No production writes authorized.
