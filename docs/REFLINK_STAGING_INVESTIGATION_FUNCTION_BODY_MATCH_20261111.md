# REFLINK staging — attachment registration body equivalence

Date: 2026-11-11. Target: synthetic staging Supabase project `rcskuzmvyugbanygizri`, NOT production.

Compared live `pg_get_functiondef('public.register_referral_investigation_files(uuid,jsonb)'::regprocedure)` with the latest staging-branch migration `supabase/migrations/20261111201500_require_complete_investigation_file_descriptors.sql`.

Method: isolate the PL/pgSQL body beginning with `DECLARE\n` and ending with the final `END;`, excluding PostgreSQL-normalized function header, delimiter and migration GRANT/REVOKE statements; compare characters exactly.

Result: **MATCH**. Live body length 3,637 characters; source body length 3,637 characters; first differing position -1 (none). Earlier independent catalog checks established SECURITY DEFINER, empty pinned search_path, authenticated EXECUTE allowed, anonymous EXECUTE denied.

This verifies latest function-body equivalence, **not** authenticated end-to-end behavior. It also does not prove each historical migration was applied in order: the ledger still has only 22 versions and lacks the 13 post-baseline versions. Do not replay older function definitions over this current one. No production changes.

Remaining gates: reconcile ledger through controlled staging-only migration repair after catalog review, verify clinical participant isolation using synthetic authenticated sessions, run CI, obtain explicit production promotion approval.
