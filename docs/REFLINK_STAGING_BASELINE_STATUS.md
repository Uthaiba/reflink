# REFLINK staging reconstruction — 10 November 2026

## Scope
This branch reconstructs the existing production schema into the isolated synthetic staging project. It does not copy production rows and does not apply migrations to production.

## Applied staging migrations
1. `20261110063521 reconstruct_production_schema_in_staging`
2. `20261110063620 configure_private_referral_storage_and_realtime`
3. `20261110063704 add_staging_foreign_key_indexes_and_secure_views`
4. `20261110063756 optimize_rls_auth_context_evaluation`
5. `20261110063844 merge_equivalent_permissive_rls_policies`
6. `20261110063912 pin_security_definer_search_paths`
7. `20261110063935 explicitly_deny_client_access_to_internal_ledgers`

## Verified state
- 14 public tables, 16 functions, 2 views, 9 application triggers.
- 28 public RLS policies after equivalent permissive policies were merged and explicit deny policies added to internal ledgers.
- 16 indexes added for uncovered foreign keys.
- Private `referral-investigation-results` bucket configured with 10 MB limit and PDF/JPEG/PNG/WebP/TXT/CSV MIME allowlist.
- Five referral-scoped storage policies present.
- `public.referrals` included in `supabase_realtime`.
- Both analytics views use `security_invoker=true`.
- All 10 SECURITY DEFINER functions pin `search_path` to empty.
- Authenticated users cannot TRUNCATE audit_log or read internal referral event/feedback ledgers; anon cannot read referrals.
- Non-admin synthetic JWT assertions for administrator-only facility count RPCs passed inside a rollback-only SQL test.

## Staging Edge Function
A hardened `create-user` Edge Function is deployed to staging (JWT verification enabled). It:
- rejects unknown browser origins and avoids wildcard CORS;
- verifies the caller JWT and administrator profile;
- restricts roles to the database's three permitted profile roles;
- validates email, required fields and optional facility UUID;
- compensates by deleting the Auth user if profile insertion fails;
- avoids returning internal database error details.

The production Edge Function was not modified.

## Remaining validation gates
- Complete authenticated integration tests with synthetic PHC, receiving-staff and administrator accounts; no staging test accounts were provisioned in this run.
- Exercise full referral lifecycle, counter-referral, offline duplicate prevention, attachment upload/download and account-provisioning rollback through the application/API.
- Verify the Vercel preview points to staging and test the full browser CORS/JWT flow.
- Review the five intentionally exposed SECURITY DEFINER RPCs individually; each has authorization logic and an empty search_path, but the Supabase advisor still flags them because authenticated execution is intentionally granted.
- Enable leaked-password protection through the Supabase Auth dashboard once configuration access is available.
- Do not promote staging migrations to production until all integration gates pass and the production change window is approved.

## Safety
Production database migrations and production Edge Functions were left unchanged. All database changes in this branch target synthetic staging only.
