# REFLINK staging reconstruction — 10 November 2026

## Scope
This branch advances the existing REFLINK product in an isolated synthetic staging project. It does not copy production rows or apply migrations to production.

## Applied staging migrations
All fifteen repository migration filenames match the exact versions recorded in the staging migration history:
1. `20261110063521_reconstruct_production_schema_in_staging`
2. `20261110063620_configure_private_referral_storage_and_realtime`
3. `20261110063704_add_staging_foreign_key_indexes_and_secure_views`
4. `20261110063756_optimize_rls_auth_context_evaluation`
5. `20261110063844_merge_equivalent_permissive_rls_policies`
6. `20261110063912_pin_security_definer_search_paths`
7. `20261110063935_explicitly_deny_client_access_to_internal_ledgers`
8. `20261110065403_harden_concurrent_referral_print_auditing`
9. `20261110065634_guard_forced_password_change_flag`
10. `20261110134607_minimize_phi_in_audit_ledger`
11. `20261110134826_add_idempotent_referral_notification_queue`
12. `20261110135058_restrict_notification_trigger_function`
13. `20261110135145_add_privacy_preserving_public_health_aggregate`
14. `20261110135512_exclude_referral_identifiers_from_audit`
15. `20261110142053_publish_referral_notifications_to_realtime`

## Verified staging state
- 14 public tables, 17 functions, 3 views, 10 application triggers and 28 public RLS policies.
- 16 indexes added for previously uncovered foreign keys.
- Private `referral-investigation-results` bucket with a 10 MB limit, PDF/JPEG/PNG/WebP/TXT/CSV MIME allowlist and five referral-scoped Storage policies.
- `public.referrals` and `public.referral_notifications` are included in `supabase_realtime`.
- All three analytics views use `security_invoker=true`. The detailed operational `referral_analytics` view contains patient-linked operational fields and remains subject to referral RLS; it is not the policy-export view.
- The service-role-only monthly public-health aggregate groups by month, state, LGA, facility type, urgency and status. It excludes direct identifiers and free-text clinical content and suppresses groups smaller than five. External publication requires governance approval.
- All 11 SECURITY DEFINER functions pin `search_path` to empty.
- Referral print numbering is serialized per referral using a transaction-scoped advisory lock, with a unique `(referral_id, print_number)` index.
- The profile security trigger prevents authenticated users from clearing `must_change_password` directly. Password changes use the staging-only authenticated `change-password` Edge Function.
- Authenticated users cannot TRUNCATE `audit_log` or read internal referral event/feedback ledgers; anon cannot read referrals.
- Equivalent permissive policy and auth.uid() initialization-plan warnings were eliminated in staging.
- Rollback-only SQL assertions passed for schema counts, least-privilege grants, private storage, Realtime publication, view security, non-admin RPC denial, referral print uniqueness, forced-password-change protection, audit minimization, notification idempotency and aggregate-view access.
- The audit mutation trigger excludes patient identifiers, referral numbers, offline client IDs, contact details and clinical narrative fields from OLD/NEW audit snapshots. Actor, action, record reference and non-clinical workflow metadata remain.
- The idempotent dashboard notification queue creates events for referral-sent and referral-acknowledged transitions. The trigger-only function is not directly executable by PUBLIC, anon or authenticated clients. SMS delivery is not configured.
- The notification centre is integrated into PHC, receiving-facility and administrator dashboards. It selects only non-clinical dashboard notification fields, relies on the existing referral-participant SELECT policy, and refreshes on Realtime INSERT events. It does not expose patient identifiers, referral numbers, phone numbers or clinical details. It is an event feed, not a delivered/read receipt system.
- Both staging Edge Functions are ACTIVE with JWT verification enabled.
- Latest Supabase health advisor returned no findings. Five authenticated-callable SECURITY DEFINER warnings remain for least-privilege review.

## Staging Edge Functions

### `create-user`
- Verifies caller JWT and administrator profile.
- Restricts roles to the database's permitted profile roles.
- Validates email, required fields and optional facility UUID.
- Deletes the newly created Auth user if profile insertion fails.
- Avoids returning internal database error details.
- Uses a restricted CORS allowlist.

### `change-password`
- Validates the signed-in session and existing REFLINK profile.
- Validates password policy server-side.
- Changes the authenticated user's Auth password.
- Clears `must_change_password` using service-role privileges after the password update.
- Direct client updates to the protected flag remain blocked.

Neither production Edge Function was modified. The staging functions have not yet been exercised end-to-end with synthetic authenticated sessions.

## CI and deployment
- GitHub Actions run #131 passed all three jobs on commit `929af92ae05bd0af1333db1edd7840d9201ebf79`: npm ci, Oxlint, Vite production build, Deno type-checks for both Edge Functions, migration integrity, and static notification-centre integration checks.
- Vercel has reached its free deployment-rate limit for some recent commits. The previously verified READY Preview is at `https://reflink-git-reflink-staging-baseline-r-7d07c2-uthaibas-projects.vercel.app`; it may not contain the latest notification-centre changes.
- A successful build or deployment does not replace authenticated browser/API acceptance.

## Remaining validation gates
- Provision disposable synthetic administrator, PHC, receiving-staff and unrelated-facility accounts, then run authenticated integration tests.
- Test role/facility isolation, notification visibility, Realtime delivery, full referral lifecycle, counter-referral, attachments and account-provisioning rollback.
- Verify the Preview points to staging and test browser CORS/JWT behaviour.
- Enable leaked-password protection through Supabase Auth configuration.
- Review the five authenticated-callable SECURITY DEFINER RPCs. Existing grants were retained pending dependency tests; do not revoke them blindly.
- SMS provider, recipient consent, retry worker and delivery monitoring remain unconfigured.
- Implement an encrypted offline browser queue, key management and synchronization conflict resolution. The current frontend does not yet have an offline queue.
- Validate clinical/public-health indicators, complete privacy impact assessment, accessibility testing and operational acceptance.
- Approve audit retention, access monitoring, backup/restore and breach-response procedures.
- Validate unused indexes after representative synthetic workload; do not drop them solely because empty staging reports no usage.

## Safety
All fifteen migrations and both Edge Functions target staging only. Production database migrations, policies, Auth settings, secrets, Edge Functions, patient records and production deployment were not modified. Keep PR #2 in draft until all release gates have evidence and explicit production approval is recorded.
