# REFLINK public schema export manifest and restore-readiness review

**Artifact:** owner-supplied `reflink-production-schema.sql`  
**Scope:** schema-only `public` export; no application table rows were exported.  
**Review date:** 8 November 2026  
**SHA-256:** `72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3`  
**Size:** 64,434 bytes; 1,612 lines.

## 1. Static inventory

The artifact contains:

| Object / statement | Count |
|---|---:|
| Public tables | 14 |
| Public functions | 16 |
| Public views | 2 |
| RLS policies | 30 |
| Triggers | 9 |
| Explicit indexes | 10 |
| Foreign keys | 23 |
| Tables with RLS enabled | 14 |
| Grant/revoke statements | 73 |
| Default-privilege statements | 9 |

The 14 tables are: `audit_log`, `counter_referrals`, `diagnosis_categories`, `facilities`, `feedback`, `profiles`, `referrals`, `referral_drafts`, `referral_events`, `referral_feedback`, `referral_notifications`, `referral_print_events`, `referral_updates`, and `users`.

The two views are `referral_analytics` and `referral_analytics_summary`.

The index count is **10**, correcting the earlier inventory's count of 9. The complete index names are present in the SQL artifact and must be compared against the live catalog before restore.

## 2. Data and managed-object scan

- No standalone top-level `INSERT INTO` or `COPY` data-loading statements were found. INSERT statements do appear inside stored function bodies; these are executable workflow logic, not exported table rows.
- No `CREATE EXTENSION` statement is present.
- The export creates only the `public` schema.
- Foreign keys reference Supabase-managed `auth.users`; staging must supply the expected managed Auth schema and compatible objects.
- Extension versions, Auth configuration, Storage bucket metadata/policies, Realtime publication membership and non-public schemas are not fully represented by this SQL file.

This is a static text inspection, not a PostgreSQL parser/restore test. The SQL file must be reviewed and executed only in isolated staging after the restore plan is approved.

## 3. Critical reconciliation discrepancy: default privileges

The dump contains nine default-privilege statements for creator `postgres`; it does **not** contain statements for creator `supabase_admin`.

A separate live read-only catalog pass confirmed broad public-schema default ACLs for both `postgres` and `supabase_admin`. Therefore the dump is not a complete representation of live default-ACL state. Do not assume restoring the dump alone reproduces the live effective privilege posture. Reconcile creator-specific ACLs from the separately captured catalog evidence and apply an explicitly reviewed target policy in staging.

The dump's default grants to `anon` and `authenticated` are not endorsed as a desired baseline. They are preserved here as source evidence so the staging reconstruction can identify and remediate them deliberately.

## 4. Restore-readiness decision

**Suitable as an input to a reviewed staging baseline, not yet approved as a restore script.**

Before restore:
1. Verify the SHA-256 against the supplied original artifact.
2. Compare all 14 tables, 16 functions, 2 views, 30 policies, 9 triggers, 23 FKs and 10 indexes with current read-only catalog snapshots.
3. Resolve Auth and extension dependencies and confirm Supabase-managed roles/schemas exist in the staging project.
4. Reconcile ownership and ACLs, including the missing `supabase_admin` default-privilege state.
5. Inspect all SECURITY DEFINER functions, view security semantics, function search paths and RLS policies.
6. Determine whether the schema dump's DDL is idempotent and whether any object already exists in staging. Staging currently has no public application tables and no migration entries.
7. Use a disposable/recreatable staging target and record pre/post catalog manifests. Do not use production for restore tests.

The historical migration source `20260928203447_reflink_v2_rural_first` remains absent from accessible Git history. A reviewed squash/baseline strategy may replace replay of unavailable historical SQL, but it must be documented as a new baseline derived from the reviewed current schema, not falsely represented as the historical migration.

## 5. Environment snapshot at review

- Production migration ledger: exactly `20260928203447_reflink_v2_rural_first`.
- Isolated staging project `rcskuzmvyugbanygizri`: no public application tables; migration ledger empty.
- No schema or migration was applied to either project during this review.
- Production remains read-only.
