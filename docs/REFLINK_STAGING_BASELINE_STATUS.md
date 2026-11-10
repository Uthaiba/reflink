# REFLINK staging reconstruction — 10 November 2026

## Scope
This branch advances the existing REFLINK product in an isolated synthetic staging project. It does not copy production rows or apply migrations to production.

## Applied staging migrations
All twenty repository migration filenames match the exact versions recorded in the staging migration history:
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
16. `20261110181053_restore_admin_reporting_and_counter_referral_workflows`
17. `20261110181810_fix_admin_facility_reporting_output_qualification`
18. `20261110182140_allow_referring_facility_to_read_counter_referral`
19. `20261110182502_fix_counter_referral_completed_at_ambiguity`
20. `20261110184000_restrict_counter_referral_clinical_read_to_participants`

## Verified staging state
- 14 public tables, 24 functions, 3 views, 10 application triggers and 28 public RLS policies.
- 16 indexes added for previously uncovered foreign keys.
- Private `referral-investigation-results` bucket with a 10 MB limit, PDF/JPEG/PNG/WebP/TXT/CSV MIME allowlist and five referral-scoped Storage policies.
- `public.referrals` and `public.referral_notifications` are included in `supabase_realtime`.
- All three analytics views use `security_invoker=true`. The detailed operational `referral_analytics` view contains patient-linked operational fields and remains subject to referral RLS; it is not the policy-export view.
- The service-role-only monthly public-health aggregate groups by month, state, LGA, facility type, urgency and status. It excludes direct identifiers and free-text clinical content and suppresses groups smaller than five. External publication requires governance approval.
- All 18 SECURITY DEFINER functions pin `search_path` to empty.
- Referral print numbering is serialized per referral using a transaction-scoped advisory lock, with a unique `(referral_id, print_number)` index.
- The profile security trigger prevents authenticated users from clearing `must_change_password` directly. Password changes use the staging-only authenticated `change-password` Edge Function.
- Authenticated users cannot TRUNCATE `audit_log` or read internal referral event/feedback ledgers; anon cannot read referrals.
- Equivalent permissive policy and auth.uid() initialization-plan warnings were eliminated in staging.
- Rollback-only SQL assertions passed for schema counts, least-privilege grants, private storage, Realtime publication, view security, non-admin RPC denial, referral print uniqueness, forced-password-change protection, audit minimization, notification idempotency and aggregate-view access.
- Additional isolated staging RLS smoke tests used temporary synthetic PHC, receiving-staff and unrelated-facility identities with simulated JWT subject claims under the `authenticated` role. PHC A successfully inserted a synthetic referral; receiving staff INSERT was denied; PHC C could not insert while claiming Facility A; PHC C saw zero rows for PHC A's synthetic referral. Referral writes were rolled back, and cleanup verification confirmed zero remaining synthetic Auth users, profiles or facilities. These SQL-context tests do not replace Auth-issued browser/API acceptance.
- The audit mutation trigger excludes patient identifiers, referral numbers, offline client IDs, contact details and clinical narrative fields from OLD/NEW audit snapshots. Actor, action, record reference and non-clinical workflow metadata remain.
- The idempotent dashboard notification queue creates events for referral-sent and referral-acknowledged transitions. The trigger-only function is not directly executable by PUBLIC, anon or authenticated clients. SMS delivery is not configured.
- Restored the closed-loop counter-referral workflow in the current frontend: receiving staff can submit final diagnosis, outcome and follow-up through the transactional RPC after discharge; PHC referral details load and display the returned feedback. The database remains authoritative for role/facility validation and completion.
- Updated counter-referral SELECT RLS so PHC staff at the referring facility and receiving staff at the receiving facility can read the associated feedback, while unrelated facilities remain excluded. This replaces the narrower policy that only allowed the original referring user or receiving facility.
- Added an administrator-only Public Health Reports workspace to the current staging frontend. It calls the six restored aggregate RPCs, supports complete-month selection, displays suppression explicitly, and keeps patient-level records out of the reporting interface.
- The notification centre is integrated into PHC, receiving-facility and administrator dashboards. It selects only non-clinical dashboard notification fields, relies on the existing referral-participant SELECT policy, and refreshes on Realtime INSERT events. It does not expose patient identifiers, referral numbers, phone numbers or clinical details. It is an event feed, not a delivered/read receipt system.
- Added a device-only, per-account encrypted referral draft vault using IndexedDB, PBKDF2-derived AES-256-GCM encryption, a 16-character local passphrase, per-record random IVs and authenticated additional data. The derived key is non-extractable and held only in memory; it locks after five minutes of inactivity or when the tab is hidden, and its in-memory reference is released when the referral form unmounts. Draft content and owner ID are encrypted; only a one-way account fingerprint, random vault/record IDs and timestamps remain as metadata. Attachments are deliberately excluded. Offline submission remains blocked. A stable client-generated `offline_client_id` is encrypted with the draft and reused when the user restores and manually submits it online; submission checks for the user's existing referral and fails closed if it was already submitted. A unique-index race also fails closed after re-reading only the matching referral owned by the signed-in user. Ordinary online submissions are marked `sync_source=online`; restored drafts are marked `offline`. Retries with selected investigation attachments are blocked to avoid duplicate uploads. This is manual retry idempotency, not background sync or clinical conflict resolution.
- Removed patient-bearing debug console output from referral creation, PHC referral loading and Realtime event handling. The unnecessary pre-authentication facilities debug query was also removed.
- Referral submission re-reads the authenticated user and current profile on every attempt, rejects non-`phc_staff` roles in the client flow (matching the staging INSERT RLS policy), and uses the current assigned facility rather than trusting the restored draft's original facility context. This is defence-in-depth; the database RLS policy remains authoritative.
- Both staging Edge Functions are ACTIVE with JWT verification enabled.

## Latest Supabase advisor review — 10 November 2026
- Security advisor reports twelve WARN findings for authenticated-callable SECURITY DEFINER functions: the original five (`get_facility_user_count(uuid)`, `get_facility_user_counts()`, `is_administrator()`, `log_referral_print(uuid,text)` and `log_referral_read(uuid)`) plus six administrator aggregate reporting RPCs and `submit_counter_referral(...)`.
- Catalog review confirms all twelve functions pin an empty `search_path`; EXECUTE is granted to `authenticated` (and owner/service_role where applicable), not PUBLIC or `anon`. The facility-count functions enforce caller role/facility scope; print/read audit functions verify referral participation; the six reporting functions require administrator authorization; and counter-referral completion requires authenticated receiving staff assigned to the referral's receiving facility.
- These advisor warnings are expected for the current callable SECURITY DEFINER design, but they are not a clean security-advisor result or a formal security sign-off. Retain the application-required grants pending least-privilege/security-owner review; do not revoke them blindly.
- Performance advisor reports 11 indexes as unused in the current low-volume staging workload. This is not evidence that they are unnecessary. No indexes were removed; representative workload/query-plan analysis and dependency review are required first.
- Health advisor returned no findings.

## Reconciled Phase 1 reporting and counter-referral capabilities — 10 November 2026
- Reviewed the deployed Phase 1 administrator dashboard and identified six missing RPC dependencies in the reconstructed staging database: `get_admin_referral_volume`, `get_admin_facility_referral_summary`, `get_admin_lga_referral_summary`, `get_admin_facility_reporting_coverage`, `get_admin_referral_pathway_summary` and `get_admin_acknowledgement_delay_alerts` (six reporting RPCs, including the aggregate volume RPC).
- Confirmed the staging schema contains the required referral lifecycle timestamps, `ack_due_at`, facility geography/type fields and `counter_referrals` table before applying the reconciliation.
- Added staging migration `20261110181053_restore_admin_reporting_and_counter_referral_workflows`, porting the reviewed Phase 1 SQL for six administrator aggregate reporting RPCs and the transactional `submit_counter_referral` RPC. It enforces administrator checks, complete Africa/Lagos calendar-month windows where applicable, primary and complementary small-cell suppression, no patient-level administrator SELECT grant, authenticated-only execution and pinned empty search paths.
- Applied the migration to staging only. Migration history now records version `20261110181053`; repository migration filename was aligned to that exact version after the migration runner assigned its timestamp.
- Post-apply catalog verification found all seven RPCs, SECURITY DEFINER enabled, `search_path=""`, EXECUTE granted to `authenticated`, and no EXECUTE grant to `anon` or PUBLIC.
- A synthetic administrator SQL-context smoke test invoked all six reporting RPCs for October 2026 with no referral fixtures; all calls completed and returned empty/zero aggregates as expected. The synthetic Auth user/profile were created and rolled back in one transaction; a separate cleanup query confirmed zero residual fixtures. This is not a substitute for Auth-issued API/browser acceptance.
- Tightened the counter-referral SELECT policy after review found that administrators could read individual clinical feedback. Administrator access to individual counter-referral records is now denied; PHC staff at the referring facility and receiving staff at the receiving facility retain access. Administrator public-health reporting remains aggregate-only through the dedicated reporting RPCs.
- A rollback-only synthetic RLS test verified administrator denial, referring-PHC access, receiving-facility access and unrelated-facility denial. All synthetic facilities, Auth users, profiles, referral and counter-referral were rolled back; cleanup confirmed zero residual fixtures.
- A rollback-only synthetic aggregate test seeded eight non-production referrals split into groups of three and five, then verified referral-volume counts, primary and complementary suppression for facility/LGA/pathway summaries, suppression of a four-facility coverage cell, and the overdue acknowledgement aggregate. All temporary facilities, Auth users, profiles and referrals were rolled back; cleanup confirmed zero residual fixtures.
- A rollback-only non-administrator authorization test confirmed PHC staff cannot execute administrator reporting RPCs or the receiving-staff counter-referral completion RPC.
- A rollback-only synthetic counter-referral lifecycle test created a discharged test referral and receiving-staff identity, submitted the counter-referral through the RPC, verified transition to `completed`, then repeated the same request and verified the same counter-referral ID was returned with `already_recorded=true`. All fixtures were rolled back and a cleanup query confirmed zero residual records.
- A rollback-only RLS test verified PHC staff at the referring facility and receiving staff at the receiving facility can read the counter-referral, while an unrelated PHC facility sees zero rows. Synthetic facilities, users, profiles, referral and counter-referral were rolled back; cleanup confirmed zero residual records.
- The first reporting smoke test exposed an ambiguous `facility_type` output reference in `get_admin_facility_referral_summary`; migration `20261110181810_fix_admin_facility_reporting_output_qualification` qualified the output expressions. The counter-referral lifecycle test then exposed an ambiguous `completed_at` output reference in `submit_counter_referral`; migration `20261110182502_fix_counter_referral_completed_at_ambiguity` qualified the updated referral row. Both test transactions then completed successfully.
- This restores the missing database-side dependencies and the current staging branch now includes a dedicated Public Health Reports workspace plus the receiving-side counter-referral form and referring-facility feedback display. Auth-issued administrator/PHC/receiving-staff browser/API acceptance remains outstanding; the older Phase 1 deployment and current staging branch still have different frontend commits and must be reconciled without discarding either branch's valid work.

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
- GitHub Actions run #247 completed successfully on current branch head `b508196f0cdd909438d4f21a8f6cbacb223ba02d`. All three jobs passed: frontend dependency installation/Oxlint/Vite production build, Deno type checks for both Edge Functions, and migration-integrity assertions. This validates the administrator reporting workspace, counter-referral form integration, 20 migration filenames and both Edge Functions.
- Added branch-specific Vercel Preview environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` scoped only to `reflink/staging-baseline-reconstruction-20261110`, pointing at the staging Supabase project. No production-target environment variables were changed. A rebuild/redeployment to consume these new Preview settings was attempted but Vercel returned `api-deployments-free-per-day` (100 deployments/day; retry after 24 hours). The last READY Preview therefore predates these new branch-scoped settings; rebuild before browser acceptance.
- Latest Vercel Preview deployment `dpl_FKbRioiNNqdsPUdK6rfWhmaB9U9P` is READY for commit `7cb55f04cb0bcea23ec694c048cae58fe004db2a` on the staging branch: [https://reflink-ghreitnqc-uthaibas-projects.vercel.app/](https://reflink-ghreitnqc-uthaibas-projects.vercel.app/). Its root returned HTTP 200 and serves the build containing the Public Health Reports workspace and counter-referral UI. The current branch head `ded6d3e...` is a documentation-only commit after that code build. HTTP 200 verifies the app shell only, not authenticated browser acceptance or clinical workflow behaviour.
- PR #2 is open, draft and unmerged. GitHub currently reports it mergeable; that is not equivalent to release approval.

## Remaining validation gates
- Provision disposable synthetic administrator, PHC, receiving-staff and unrelated-facility accounts, then run authenticated integration tests.
- Test role/facility isolation, notification visibility, Realtime delivery, full referral lifecycle, counter-referral, attachments and account-provisioning rollback.
- Verify a current Preview points to staging and test browser CORS/JWT behaviour.
- Enable leaked-password protection through Supabase Auth configuration.
- Obtain least-privilege/security-owner sign-off for the five authenticated-callable SECURITY DEFINER RPCs; do not revoke their existing grants blindly.
- SMS provider, recipient consent, retry worker and delivery monitoring remain unconfigured.
- Complete authenticated browser/API acceptance for the stable-ID manual retry flow, including lost-response and unique-index race tests. Background synchronization, clinical conflict resolution and attachment synchronization remain future work; the current workflow deliberately requires the user to restore, review and explicitly submit online.
- Validate clinical/public-health indicators, complete privacy impact assessment, accessibility testing and operational acceptance.
- Approve audit retention, access monitoring, backup/restore and breach-response procedures.
- Validate unused indexes after representative synthetic workload; do not drop them solely because empty staging reports no usage.

## Safety
All twenty migrations and both Edge Functions target staging only. Production database migrations, policies, Auth settings, secrets, Edge Functions, patient records and production deployment were not modified. Production migration history remains at the original single baseline migration, and its existing `create-user` Edge Function remains active with JWT verification. Keep PR #2 in draft until all release gates have evidence and explicit production approval is recorded.
