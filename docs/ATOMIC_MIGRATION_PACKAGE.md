# Atomic migration package — pending hosted rehearsal

Generated with Supabase CLI 2.122.1 after inspecting `migration new --help`:
- 20261117135653_atomic_investigation_updates.sql
- 20261117135703_atomic_clinical_updates.sql

These ordered, additive migrations package the reviewed candidates. They have NOT been applied to a hosted database. The investigation migration also denies first saves and replay when the current profile requires a password change, matching the clinical RPC gate.

## Exact execution and drift protection

CI compares each migration byte-for-byte with its database/changes candidate, then applies the actual migration files in disposable PostgreSQL. The database workflow triggers on supabase/migrations changes. The trigger-compatibility fixture runs after the baseline transaction tests.

The repository migration directory is an incremental package, NOT a complete reconstructed hosted history or fresh-install schema. Synthetic staging has 22 pre-existing migrations ending 20261110203341; production has a different baseline. Do not run an unattended db push/reset, copy staging into production, or repair hosted migration ledgers simply to silence a mismatch.

## Promotion prerequisites

1. Reconstruct and verify the existing migration baseline separately, checking schema/function/trigger/RLS/storage definitions against catalog evidence.
2. Verify candidate hashes and ordered migration identities, ownership and grants; ensure all required tables/columns and existing triggers match the reviewed baseline.
3. Confirm backup AND recovery, including clinical documents and operation history. Rehearse the coordinated client flag and backend guard in the existing synthetic environment.
4. Apply through the reviewed migration workflow only after baseline reconciliation; rerun catalog preflight and the authenticated browser/API matrix.
5. Keep production unchanged until clinical, privacy, security, accessibility, operational and explicit production release gates pass.

Both migrations wrap their DDL in a transaction and preserve existing referral JSON/documents. Their new guards reject legacy writers; coordinate old tabs and flag-enabled clients during a maintenance window. Existing audit-trigger failures roll back the operation and clinical save together.

## Recovery

Do not delete private operation tables, uploaded objects, audit history or clinical rows to roll back. Freeze affected saves, preserve drafts and reconcile uncertain operations. A prior frontend relying on direct clinical/investigation writes is incompatible with the new guards. Any compatibility migration or restore must be rehearsed and preserve these records.

See STAGING_PREFLIGHT_2026-11-17.md, STAGING_TRIGGER_COMPATIBILITY_2026-11-17.md and CLINICAL_STAGING_CHECKPOINT.md. Passing isolated tests does not certify hosted authorization, RLS or full master-plan completion.
