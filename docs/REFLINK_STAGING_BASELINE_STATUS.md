# REFLINK staging reconstruction — 10 November 2026

## Scope
This branch reconstructs the existing production schema into the isolated synthetic staging project. It does not copy production rows and does not apply migrations to production.

## Applied staging migrations
The nine repository migration filenames now match the exact versions recorded in the staging migration history:
1. `20261110063521_reconstruct_production_schema_in_staging`
2. `20261110063620_configure_private_referral_storage_and_realtime`
3. `20261110063704_add_staging_foreign_key_indexes_and_secure_views`
4. `20261110063756_optimize_rls_auth_context_evaluation`
5. `20261110063844_merge_equivalent_permissive_rls_policies`
6. `20261110063912_pin_security_definer_search_paths`
7. `20261110063935_explicitly_deny_client_access_to_internal_ledgers`
8. `20261110065403_harden_concurrent_referral_print_auditing`
9. `20261110065634_guard_forced_password_change_flag`

## Verified state
- 14 public tables, 16 functions, 2 views and 9 application triggers.
- 28 public RLS policies after merging equivalent permissive policies and adding explicit deny-all authenticated policies to internal ledgers.
- 16 indexes added for previously uncovered foreign keys.
- Private `referral-investigation-results` bucket configured with a 10 MB limit and PDF/JPEG/PNG/WebP/TXT/CSV MIME allowlist.
- Five referral-scoped Storage policies present.
- `public.referrals` included in `supabase_realtime`.
- Both analytics views use `security_invoker=true`.
- All 10 SECURITY DEFINER functions pin `search_path` to empty.
- Referral print numbering is serialized per referral using a transaction-scoped advisory lock, with a unique `(referral_id, print_number)` index as the integrity backstop. The staging catalog confirms the index and hardened function are present.
- The profile security trigger now prevents authenticated users from clearing `must_change_password` directly. Password changes use the staging-only authenticated `change-password` Edge Function, which validates the session, changes the Auth password and clears the profile flag using the service role.
- Authenticated users cannot TRUNCATE `audit_log` or read internal referral event/feedback ledgers; anon cannot read referrals.
- Equivalent permissive policy warnings and auth.uid() initialization-plan warnings were eliminated in the staging advisor scan.
- Rollback-only SQL assertions passed for schema counts, least-privilege grants, private storage, Realtime, view security, non-admin RPC denial, referral print uniqueness and protection of the forced-password-change flag.
- Privacy review finding: the existing audit mutation trigger serializes full OLD/NEW row values into audit_log. For referrals and other clinical records this can duplicate patient identifiers and clinical details into the audit ledger. Retention, access monitoring and field-level minimization must be approved before production release; this was documented, not changed.

## Staging Edge Functions

Two staging-only Edge Functions are deployed with JWT verification enabled.

### `create-user`
- rejects unknown browser origins and avoids wildcard CORS;
- verifies the caller JWT and administrator profile;
- restricts roles to the database's three permitted profile roles;
- validates email, required fields and optional facility UUID;
- compensates by deleting the Auth user if profile insertion fails;
- avoids returning internal database error details.

### `change-password`
- validates the caller's signed-in session and an existing REFLINK profile;
- validates the password policy server-side;
- changes the authenticated user's password through the Supabase Auth Admin API;
- clears `must_change_password` using the service role after the password update;
- keeps direct client updates to that protected flag blocked by the profile trigger.

Neither production Edge Function was modified. The staging functions have not yet been exercised end-to-end with real synthetic authenticated sessions.

## Remaining validation gates
- Provision synthetic PHC, receiving-staff and administrator accounts, then run full authenticated integration tests.
- Exercise the full referral lifecycle, counter-referral, offline duplicate prevention, attachment upload/download and account-provisioning rollback through the application/API.
- Verify the Vercel preview points to staging and test the full browser CORS/JWT flow.
- Review the five intentionally exposed SECURITY DEFINER RPCs individually; each has authorization logic and an empty `search_path`, but the Supabase advisor still flags them because authenticated execution is intentionally granted.
- Enable leaked-password protection through the Supabase Auth dashboard once configuration access is available.
- The advisor reports unused indexes because the staging database has no workload data; validate their usage after synthetic workflow load. Do not drop these indexes solely from an empty-staging advisor scan.
- The referral print concurrency migration was applied successfully to staging and its index/function definition were verified from PostgreSQL catalogs.
- GitHub Actions run #17 passed both frontend-quality and migration-integrity jobs after the migration-check false positive and non-admin assertion were corrected. That run predates the latest password-change integration and final migration filename alignment. The workflow now also includes Deno type-checking for both Edge Functions and static checks for password-endpoint wiring; exact-HEAD execution of these newest additions is not yet confirmed.
- Do not promote staging migrations to production until all integration gates pass and a production change window is approved.

## Safety
Production database migrations and production Edge Functions were left unchanged. All database changes in this branch target synthetic staging only.
