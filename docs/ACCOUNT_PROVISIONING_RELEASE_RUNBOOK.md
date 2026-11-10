# REFLINK Account-Provisioning Release Runbook

**Status:** PRE-RELEASE ONLY — no deployment authorized or performed by this runbook  
**Candidate branch:** `reflink/phase-1-security-remediation`  
**Candidate commit:** `4d8f84dd876d80a227d781bb72e23f07a97993e7`  
**Production function:** `create-user`, currently ACTIVE version 2, `verify_jwt=true`  
**Canonical browser origin:** `https://reflink-yobe.vercel.app`

## 1. Purpose and scope

This runbook defines the controlled path for reconciling the deployed account-provisioning Edge Function with the hardened repository candidate. It is not a deployment instruction and does not authorize changes to production. Keep gateway JWT verification enabled.

The canonical application identity is `auth.users` plus `public.profiles`. The profile role vocabulary is exactly `administrator`, `phc_staff`, and `receiving_staff`. Staff accounts require an existing active facility. The separate `public.users` table remains legacy/parallel and is not part of this release.

## 2. Candidate source controls

The current repository candidate is expected to:

1. Validate the caller bearer token and require a canonical administrator profile.
2. Accept only the three canonical profile roles.
3. Require an active facility for non-administrator staff.
4. Treat Auth user metadata as untrusted; role and facility authority come from validated administrator input and database checks.
5. Create the Auth identity and initial profile with `must_change_password: true` in the profile insert.
6. Avoid returning SQL/PostgREST details or logging credentials/request secrets.
7. Use exact-origin CORS allowlisting. The canonical Vercel origin is built in; optional extra origins come from comma-separated `REFLINK_ALLOWED_ORIGINS`.
8. Check the result of compensating Auth deletion if profile creation fails and explicitly surface manual-review status if cleanup also fails.

CORS is not authentication. Every request must still pass JWT and administrator authorization checks.

## 3. Pre-deployment evidence checklist

Do not schedule deployment until all items are evidenced:

- [ ] Review the exact candidate commit and full diff against the currently deployed function.
- [ ] Confirm production function slug, active version, JWT gateway setting and runtime compatibility.
- [ ] Confirm the authoritative production schema has `profiles.must_change_password` as boolean NOT NULL with default false, and verify the candidate explicitly sets it true on creation.
- [ ] Confirm all legitimate production frontend origins from actual deployment configuration and browser entry points. Do not assume preview URLs are valid or add wildcard origins.
- [ ] Decide whether `REFLINK_ALLOWED_ORIGINS` is required. If so, define exact comma-separated origins and have the authorized project owner configure the value through the approved secret/environment management process. Never place credentials or secret values in source control.
- [ ] Confirm the frontend's production domain and CORS behavior in a controlled browser test.
- [ ] Complete the synthetic acceptance matrix in Section 4 using an isolated, schema-correct environment.
- [ ] Define who receives cleanup-failure alerts and how orphan Auth identities are reconciled without exposing credentials.
- [ ] Capture current deployed function source/version and a rollback artifact through approved secure change management.
- [ ] Obtain product owner, security, clinical operations and deployment-owner approval.

## 4. Required synthetic acceptance matrix

Use only synthetic email addresses, facilities and users. No production account creation and no patient data.

| Test | Expected result |
|---|---|
| Missing or invalid JWT | 401; no identity/profile created |
| Authenticated non-administrator | 403; no identity/profile created |
| Administrator with canonical PHC role and active facility | One Auth identity and one profile; `must_change_password=true` |
| Administrator with canonical receiving role and active facility | One Auth identity and one profile; `must_change_password=true` |
| Invalid or legacy role alias | 400; no identity/profile created |
| Missing, nonexistent or inactive staff facility | Rejected; no orphan identity |
| Duplicate email | Safe generic failure; no duplicate profile |
| Profile insert failure; Auth deletion succeeds | Creation fails and compensating cleanup is verified |
| Profile insert failure; Auth deletion fails | Explicit manual-review state; no false rollback-success message |
| Metadata contains role/facility/admin claims | Metadata does not grant authority |
| Approved CORS origin preflight | Exact approved origin returned |
| Unapproved CORS origin preflight | No ACAO permission returned |
| Request from approved origin with non-admin JWT | Still rejected; CORS does not bypass authorization |
| Administrator facility policy | Behavior matches documented facilityless-admin policy |
| Retry after ambiguous client/network result | No duplicate identity; behavior and operator recovery are documented |

A source-contract test passing is not a substitute for this matrix. Record actual request/response, database state, and cleanup outcome for each synthetic case.

## 5. Deployment sequence — only after separate approval

1. Freeze the candidate commit and record its SHA.
2. Confirm the staging acceptance matrix is green and the staging schema matches the approved production baseline.
3. Verify exact CORS origins and approved runtime environment variables.
4. Arrange a low-risk deployment window with an identified operator and rollback owner.
5. Deploy only the reviewed `create-user` function version, preserving `verify_jwt=true`.
6. Verify deployed function metadata/version and source fingerprint.
7. Run a controlled smoke test using a dedicated synthetic administrator and synthetic facility in the approved environment. Do not create a real user in production as a smoke test.
8. Monitor function errors, authorization denials, profile insert failures and cleanup-failure events.
9. Confirm frontend account-provisioning workflow and forced password-change behavior using the approved test account.
10. If any acceptance criterion fails, stop provisioning and execute the approved rollback procedure.

## 6. Rollback and incident handling

- Restore the previously captured known-good function version only through the authorized deployment owner and approved rollback mechanism.
- Keep JWT gateway verification enabled throughout rollback.
- Do not roll back database schema or migration ledger as part of this function-only change.
- If an Auth identity exists without a profile, stop automated retries for that identity, preserve the minimum required operational evidence, and route reconciliation to an authorized administrator. Do not delete identities blindly.
- If a profile exists with an incorrect role or facility, disable further provisioning and use the approved identity correction process; do not silently rewrite production records.
- Never put passwords, access tokens, service-role keys, or patient data in logs or incident tickets.

## 7. Explicit no-go conditions

No deployment if any of the following applies:

- The schema baseline is not reviewed and reproducible.
- No isolated schema-correct synthetic test environment is available.
- The actual browser origin inventory is incomplete.
- Required environment variables are undefined or not approved.
- Cleanup failure cannot be detected and handled.
- The function candidate does not match the reviewed commit.
- JWT verification is disabled.
- Any test relies on production users, patient records or live account creation.
- Required security, product and operational approvals are absent.

## 8. Current state

At the time of writing, exact-HEAD GitHub Actions for candidate commit `4d8f84dd876d80a227d781bb72e23f07a97993e7` passed on both push and pull-request events, including unit tests, lint, production build and Chromium offline-queue browser tests. These runs do not constitute a live Edge Function integration test.

Production `create-user` remains ACTIVE version 2. No Edge Function deployment, production secret change, Auth user creation, schema change or production data mutation has been performed. The staging project still lacks the reconstructed application schema. Therefore this runbook remains a gated release plan, not evidence of production readiness.


### Administrator delegation safeguard — 9 November 2026

The repository candidate now blocks routine administrator-role assignment in the shared provisioning workflow and dashboard. New accounts can only be created as `phc_staff` or `receiving_staff`. Existing administrator profiles remain visible/editable for non-role fields, but their role selector is disabled. This does not yet prevent direct authenticated API updates to `profiles.role`; a database-side authorization boundary must be designed and verified against the reconstructed staging schema before release. Do not treat the UI guard as a security boundary. A separate administrator-delegation workflow requires an explicit governance decision and independent approval.


### Database enforcement gate for administrator delegation — 9 November 2026

A production read-only catalog check found that authenticated administrators can still update `profiles.role` directly: the `Administrators can update profiles` policy permits administrator updates, authenticated has UPDATE privilege on the role column, and `guard_profile_security_fields` only blocks protected-field changes for non-administrators. Therefore the new dashboard guard is an interim usability restriction, not a security boundary. Before release, enforce the approved delegation policy in Postgres and remove or constrain direct browser role-update authority. Verify INSERT, UPDATE, RLS, grants, service-role behavior and self-service password-change behavior in synthetic staging. Read-only verifier: `supabase/verification/profile_role_delegation_review.sql`. No production changes were made.


### Database role-escalation trigger design — staging test required

A non-executable design artifact is now available at `supabase/verification/profile_role_delegation_trigger_design.sql`. It proposes a narrow `BEFORE INSERT OR UPDATE` trigger to block browser-authenticated creation or promotion into `administrator`, while preserving trusted service/database operations and the existing profile security trigger. This is not a migration and has not been run. The synthetic staging project's public schema currently has no application tables, so integration validation is blocked until baseline reconstruction. The release gate requires Postgres-level tests for administrator promotion/insert rejection, ordinary profile edits, self-service password-change flag updates, service-role provisioning and maintenance/rollback.
