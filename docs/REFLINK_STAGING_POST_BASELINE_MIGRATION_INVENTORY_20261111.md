# REFLINK — post-baseline staging migration inventory (2026-11-11)

## Verified comparison
GitHub compare: `8de4e3839db7db3a9b527be2d4f58d3722e260bb...reflink/staging-baseline-reconstruction-20261110` returned 27 commits ahead and 13 migration files added. Staging Supabase `rcskuzmvyugbanygizri` ledger was separately verified to have 22 recorded migrations, latest `20261110203341`.

## Migration files requiring per-file reconciliation
1. `20261111160000_prevent_client_deletion_of_investigation_files.sql`
2. `20261111163000_prevent_client_replacement_of_investigation_files.sql`
3. `20261111170000_align_investigation_file_access_with_referral_participants.sql`
4. `20261111173000_offline_referral_idempotency_unique_index.sql`
5. `20261111180000_restrict_referral_notification_log_to_participants.sql`
6. `20261111183000_require_offline_referral_retry_key.sql`
7. `20261111184500_validate_offline_referral_retry_key.sql`
8. `20261111190000_register_referral_investigation_files.sql`
9. `20261111191500_handle_empty_investigation_arrays.sql`
10. `20261111193000_allow_guarded_admin_analytics_rpc.sql`
11. `20261111194500_lock_registered_investigation_file_metadata.sql`
12. `20261111200000_reject_null_investigation_registration_payload.sql`
13. `20261111201500_require_complete_investigation_file_descriptors.sql`

## Evidence and limitations
- Comparison confirms files on the branch; it does **not** prove each migration was applied to staging.
- The 22-entry ledger does not record any of the thirteen listed versions.
- Previous live checks confirm `public.register_referral_investigation_files(uuid,jsonb)` exists, uses SECURITY DEFINER with pinned empty search_path, and denies anonymous execution. That alone does not establish equivalence of all thirteen migrations or their side effects.
- Before repairing ledger or replaying migrations, inspect all thirteen full SQL files and staging catalog state (policies, indexes, triggers, functions, grants). Classify each as fully installed, absent or partially installed.
- Never blindly run all thirteen or mark them all applied. Protect current function revisions against downgrade. Use approved staging-only migration workflow and independent verification.

## Release gates
No production changes, no release merge. Complete reconciliation and Auth-issued role/facility isolation tests before release.
