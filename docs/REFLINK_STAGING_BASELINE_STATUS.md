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
- Reviewed both deployed staging Edge Function sources. Their default CORS allowlists include `https://reflink-ten.vercel.app` and localhost, but omit the current staging Preview origin. Both support a `REFLINK_ALLOWED_ORIGINS` environment override; the effective secret value is not exposed by the connected project tools, so current Preview preflight success is unverified. The acceptance plan now treats exact-origin OPTIONS checks for both functions as a blocker. Do not use wildcard origins or modify production functions.

## Latest Supabase advisor review — 10 November 2026
- Security advisor review at 2026-11-10 19:53:35Z reports twelve WARN findings for authenticated-callable SECURITY DEFINER functions: the original five (`get_facility_user_count(uuid)`, `get_facility_user_counts()`, `is_administrator()`, `log_referral_print(uuid,text)` and `log_referral_read(uuid)`) plus six administrator aggregate reporting RPCs and `submit_counter_referral(...)`.
- Catalog review confirms all twelve functions pin an empty `search_path`; EXECUTE is granted to `authenticated` (and owner/service_role where applicable), not PUBLIC or `anon`. The facility-count functions enforce caller role/facility scope; print/read audit functions verify referral participation; the six reporting functions require administrator authorization; and counter-referral completion requires authenticated receiving staff assigned to the referral's receiving facility.
- These advisor warnings are expected for the current callable SECURITY DEFINER design, but they are not a clean security-advisor result or a formal security sign-off. Retain the application-required grants pending least-privilege/security-owner review; do not revoke them blindly.
- Performance advisor reports 10 indexes as unused in the current low-volume staging workload. This is not evidence that they are unnecessary. No indexes were removed; representative workload/query-plan analysis and dependency review are required first.
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
- GitHub Actions quality-gate run #261 completed successfully on application-code commit `80728d0f8c2d6553b31c6378fa5eb7d037675af6`; all three jobs passed: frontend lint/production build, Supabase Edge Function type check and migration integrity. The Preview deployment below contains application code commit `ef44cae23b6704957d850f402a72d405a6e67dec`; run #261 is not represented as testing that later commit.
- Branch-specific Vercel Preview environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are scoped only to `reflink/staging-baseline-reconstruction-20261110` and point to the staging Supabase project. No production-target environment variables were changed.
- A fresh Vercel Preview deployment `dpl_2MG8JADu7xvoUqRHVjpKGfXqPVSo` is READY at [https://reflink-lk45n99t6-uthaibas-projects.vercel.app/](https://reflink-lk45n99t6-uthaibas-projects.vercel.app/) for the exact current branch head `ef44cae23b6704957d850f402a72d405a6e67dec`. Its root returned HTTP 200. This is the first verified READY Preview after branch-scoped staging environment variables were configured. HTTP 200 verifies the application shell only, not authenticated browser acceptance or clinical workflow behaviour.
- Documentation-only updates after the deployed application code include acceptance-plan corrections, the CORS gate and branch-reconciliation review. The latest documentation commits have no associated workflow runs in the available PR-triggered workflow query; they do not change application code or migrations.
- PR #2 is open, draft and unmerged. GitHub currently reports it mergeable; that is not equivalent to release approval.

## Remaining validation gates
- Provision disposable synthetic administrator, PHC, receiving-staff and unrelated-facility accounts, then run authenticated integration tests.
- Test role/facility isolation, notification visibility, Realtime delivery, full referral lifecycle, counter-referral, attachments and account-provisioning rollback.
- Verify exact-origin CORS preflight for both staging Edge Functions from the current Preview; source defaults omit the Preview hostname and the effective `REFLINK_ALLOWED_ORIGINS` override is not currently verifiable through connected tools.
- Verify a current Preview points to staging and test browser CORS/JWT behaviour.
- Enable leaked-password protection through Supabase Auth configuration.
- Obtain least-privilege/security-owner sign-off for the twelve authenticated-callable SECURITY DEFINER functions flagged by the advisor; do not revoke application-required grants blindly.
- SMS provider, recipient consent, retry worker and delivery monitoring remain unconfigured.
- Complete authenticated browser/API acceptance for the stable-ID manual retry flow, including lost-response and unique-index race tests. Background synchronization, clinical conflict resolution and attachment synchronization remain future work; the current workflow deliberately requires the user to restore, review and explicitly submit online.
- Validate clinical/public-health indicators, complete privacy impact assessment, accessibility testing and operational acceptance.
- Approve audit retention, access monitoring, backup/restore and breach-response procedures.
- Validate unused indexes after representative synthetic workload; do not drop them solely because empty staging reports no usage.

## Safety
All twenty migrations and both Edge Functions target staging only. Production database migrations, policies, Auth settings, secrets, Edge Functions, patient records and production deployment were not modified. Production migration history remains at the original single baseline migration, and its existing `create-user` Edge Function remains active with JWT verification. Keep PR #2 in draft until all release gates have evidence and explicit production approval is recorded.


## Branch reconciliation review — 10 November 2026

- Compared `reflink/phase-1-security-remediation` against this staging branch using Git's compare endpoint.
- The branches are materially diverged from common ancestor `26eed63d006e16d744c923fa9f5fabc7a0fe9a8e`: Phase 1 is 634 commits ahead of the common ancestor and staging is 184 commits ahead.
- Both branches modify core application entry points, dashboards, offline, notification, migration and test areas. A wholesale merge or file replacement is unsafe.
- Added `docs/REFLINK_BRANCH_RECONCILIATION_REVIEW_20261110.md` with the bounded integration sequence, domain-contract risks and recommended feature order.
- Next integration target: review Phase 1 receiving lifecycle compare-and-set protections against current staging handlers and database transition enforcement. No branch merge or production change is authorised.


## Referral column-level UPDATE boundary — 10 November 2026

A live staging catalog review found that `authenticated` had table-level UPDATE on `public.referrals`. The receiving-facility UPDATE RLS policy correctly constrained rows to the user's assigned receiving facility and role, but RLS alone did not limit which columns the user could modify.

### Applied to synthetic staging

Migration: `20261110202141_restrict_referral_update_columns`

- Revoked table-level UPDATE on `public.referrals` from `authenticated`.
- Granted column-level UPDATE only for fields used by the current receiving-facility workflow:
  `status`, `acknowledged_at`, `patient_arrived_at`, assessment fields, diagnosis/treatment feedback, disposition and assessment timestamp, admission/discharge fields, follow-up plan, and `investigation_records` (used for investigation-result metadata).
- Preserved authenticated SELECT.
- Preserved `service_role` UPDATE and did not modify production.
- Added `supabase/tests/referral_update_column_privileges.sql` with read-only privilege assertions.

### Verification evidence

The SQL privilege assertions executed successfully in staging (DO block returned no exception). Direct privilege checks confirmed:
- `authenticated` table-level UPDATE: false.
- Allowed: status and investigation_records column UPDATE.
- Denied: referring_facility_id, receiving_facility_id, referring_user_id, patient_identifier and offline_client_id column UPDATE.
- Authenticated SELECT remains true.
- Service-role UPDATE remains true.

Security advisor re-run still reports 12 authenticated-callable SECURITY DEFINER warnings; the column-grant migration did not add to or resolve those existing findings. Review each function individually before changing grants.

GitHub Actions quality-gate run #280 passed all three jobs on commit `c4e4d36a2403f1f0c5e9afc885dabea9cfa48f91`: frontend lint/build, Edge Function type check and migration integrity.

### Remaining acceptance boundary

The grant test verifies PostgreSQL privileges, not the complete PostgREST request path. Auth-issued receiving-staff browser/API acceptance must still prove all legitimate referral update operations succeed and protected-column attempts fail. In particular, validate investigation upload/result metadata updates, assessment, admission, discharge and the transactional counter-referral RPC.


## SECURITY DEFINER endpoint review — 10 November 2026

A fresh staging catalog and function-definition review was completed after the column-level referral UPDATE boundary was applied.

- All 12 advisor-flagged, authenticated-callable SECURITY DEFINER endpoints were inspected individually: six administrator aggregate reporting RPCs, two facility user-count RPCs, is_administrator(), referral print/read audit RPCs and submit_counter_referral(...).
- Every reviewed function pins search_path to the empty string and uses schema-qualified application objects or pg_catalog references.
- Catalog privilege checks confirm none of the 12 endpoints is executable by anon; the intended authenticated EXECUTE grants remain. No grant changes were made.
- Authorization checks were confirmed in the function bodies: administrator reporting requires a signed-in administrator; facility user counts enforce administrator or same-facility scope; print/read auditing checks referral participation; counter-referral completion requires a signed-in receiving-staff profile assigned to the referral's receiving facility and validates the discharged lifecycle state.
- is_administrator() is a narrowly scoped profile-role predicate used by authorization logic. It returns a boolean and does not expose profile data.
- log_referral_read() has no standalone early auth.uid() IS NULL branch, but its referral-participant predicate cannot match a null user identity; it raises an authorization exception before inserting an audit event when no matching referral is found. Add an explicit null-identity guard in a future bounded hardening migration for clarity and defense in depth; do not treat this as a demonstrated anonymous-access bypass.
- The security advisor continues to report 12 WARN findings because its rule flags any authenticated-callable SECURITY DEFINER endpoint, including intentionally privileged RPCs with internal authorization. This review reduces uncertainty but does not replace independent security-owner review or real Auth-issued API acceptance.
- Performance advisor continues to report 10 unused-index INFO findings in low-volume staging. No indexes were dropped because usage statistics from this environment are not representative.
- No production resources were modified.


## Explicit authentication guard for referral-read audit — 10 November 2026

- Applied staging migration `20261110203341_require_authenticated_referral_read_audit` to add an explicit `auth.uid() IS NULL` rejection at the start of `public.log_referral_read(uuid)`.
- The function also rejects a null referral ID, preserves the existing referral-participant authorization predicate, raises SQLSTATE `42501` for missing identity or unauthorized access, and inserts the same minimized READ audit event only after authorization succeeds.
- Post-migration catalog verification confirms `SECURITY DEFINER` remains enabled, `search_path` remains pinned to empty, `anon` EXECUTE is false and `authenticated` EXECUTE remains true.
- Migration history records version `20261110203341`; the matching SQL migration is committed in this branch.
- This verifies deployed function definition and grants, not an Auth-issued API/browser call. The broader authenticated acceptance gate remains open. No production resources were modified.


## Receiving-workflow column grant coverage review — 10 November 2026

A source-to-grant static review was performed against the current staging-branch `src/App.jsx` and migration `20261110202141_restrict_referral_update_columns.sql`.

- Enumerated the direct `public.referrals.update({...})` payloads in the application, including investigation metadata, admission, discharge, acknowledgement and patient-arrival writes.
- Inspected the dynamically constructed clinical assessment `updateData` payload, including assessment findings, diagnosis fields, treatment/procedure fields, clinical feedback, disposition, assessment timestamp and status.
- Confirmed every statically identified application update field is present in the migration's authenticated column-level UPDATE allowlist; no missing field was found.
- Confirmed the conditional admission/discharge timestamp fields in the assessment payload are also in the allowlist.
- This is a source-level coverage check only. It does not prove every runtime code path, PostgREST behavior, or that each role's actual workflow succeeds. The Auth-issued acceptance gate remains open, especially for receiving-facility RLS, investigation file metadata, and concurrent status changes.
- No database or production resources were changed during this review.

## Edge Function CORS and staging authentication evidence review — 10 November 2026

The two deployed staging Edge Functions were fetched and inspected directly from the synthetic staging project.

- `create-user` and `change-password` are both ACTIVE, version 1, with `verify_jwt=true`.
- Both functions implement an explicit origin allowlist. If `REFLINK_ALLOWED_ORIGINS` is set, its comma-separated value replaces the source-code defaults; otherwise the defaults are `https://reflink-ten.vercel.app` and `http://localhost:5173`.
- The current staging Preview origin `https://reflink-lk45n99t6-uthaibas-projects.vercel.app` is not in those source defaults. The environment override is not readable through the available project tools, so its effective value cannot be confirmed from source inspection.
- Log review for 10 November 2026 found password-grant requests from the Preview origin returning HTTP 400 `invalid_credentials`. This confirms the Auth endpoint was reached, but it does not establish successful authentication, user provisioning, or Edge Function CORS.
- The same log window contained no requests to the `create-user` or `change-password` function paths. Therefore no Edge Function preflight or authenticated invocation has been evidenced.
- The project log query tool exposes request metadata but not the secret environment value or a supported direct Edge Function invocation interface. No secret was changed and no test account was created.
- The source code returns HTTP 204 for allowed-origin OPTIONS preflight, echoes the exact allowed origin, allows POST/OPTIONS and the authorization, x-client-info, apikey and content-type headers. A disallowed origin is rejected with HTTP 403 before preflight handling.
- Required next acceptance: from the actual staging Preview origin, verify OPTIONS on both function URLs returns 204 and exact `Access-Control-Allow-Origin`; verify an unapproved test origin returns 403; then use a disposable Auth-issued administrator session to exercise `create-user` and a synthetic user's session to exercise `change-password`. Never use production credentials or patient data.
- Authentication log entries with `invalid_credentials` are not evidence of a CORS failure. They indicate the submitted login credentials were rejected by Auth. Use a known synthetic staging account and do not repeatedly guess passwords.
- No database schema, Edge Function code, secret, or production resource was changed during this review.

## Synthetic Auth acceptance readiness check — 10 November 2026

A read-only count against the synthetic staging database returned:

- `public.profiles`: 0 rows
- `auth.users`: 0 rows
- `public.facilities`: 0 rows

This is a clean/empty staging identity and facility baseline, not evidence of a failed production dataset. It explains why real Auth-issued role acceptance could not proceed: there is no administrator identity to authenticate, no facility records to assign, and the deployed `create-user` function requires an already authenticated administrator profile. The function cannot bootstrap its own first administrator.

Do not work around this by inserting rows directly into `auth.users`, fabricating JWTs, disabling `verify_jwt`, or using a service-role credential in the browser. Those would bypass the exact Auth/RLS path that acceptance must validate.

The application referral update field review found that all explicit fields used by the nine referral update call sites in `src/App.jsx` are represented in the restricted column allowlist, including investigation metadata, assessment fields, lifecycle timestamps/status, admission and discharge fields. The assessment handler also uses a status predicate (`under_assessment`) and `.maybeSingle()`. The dynamic update object contains only the reviewed receiving-workflow fields.

### Controlled bootstrap requirement

Before real API acceptance, establish a first administrator through a controlled, out-of-band Supabase Auth Admin operation available only to the project owner, then create its matching `public.profiles` row and seed synthetic facilities. Keep this operation outside the public application and never expose the service-role key. Record the administrator bootstrap as a separately reviewed staging-only operation. Once the first administrator exists, use the protected `create-user` function to provision the remaining disposable role accounts, then perform real-session acceptance tests.

No rows were inserted or modified during this readiness check. No production resources were accessed or changed.
