# REFLINK Identity and Account-Provisioning Reconciliation

**Status:** READ-ONLY FINDINGS / DESIGN DECISIONS REQUIRED. No production or staging changes were made.
**Review date:** 8 November 2026
**Production project:** `uwwzbljufqbzkjflpnll`
**Repository branch:** `reflink/phase-1-security-remediation`

## Executive decision

The canonical application identity model is `auth.users` plus `public.profiles`. The `profiles.id` foreign key references `auth.users(id)`; active dashboard source reads and updates `profiles`, and the current administrator dashboard invokes the `create-user` Edge Function. The separate `public.users` table is a legacy/parallel directory model and is not used by the current AdminDashboard workflow.

The deployed production `create-user` Edge Function (version 2) differs materially from the hardened source currently committed in the repository. The deployed version is active and JWT verification is enabled, but its role validation, facility validation, error handling and CORS behavior do not match the current source. This drift must be resolved before production readiness.

No Auth `users` trigger was found in the production catalog query. The exported `handle_new_user()` function is therefore not evidence that an Auth signup trigger is installed. Do not create one during baseline reconstruction without an explicit signup policy and tests.

## 1. Identity schema evidence

### Canonical profile identity

The schema export defines:

- `public.profiles.id` as UUID primary key.
- `public.profiles.id` references `auth.users(id)` with `ON DELETE CASCADE`.
- Profile fields include `full_name`, `phone`, `role`, `facility_id`, timestamps and `must_change_password`.
- A CHECK constraint permits exactly `phc_staff`, `receiving_staff`, and `administrator`.
- The active AdminDashboard loads users from `profiles` and updates role/facility through `profiles`.
- Referral and counter-referral workflows use Auth/profile identities, not the standalone `public.users` table.

### Parallel legacy directory

The export also defines `public.users` with independent UUID primary key, unique email, name, phone, role, facility and active/inactive status. Its ID has no foreign key to `auth.users`. It is not a valid substitute for an authenticated REFLINK identity.

The legacy `src/UserManagement.jsx` component reads and inserts directly into `public.users`. It also offers role values such as `receiver` and `facility_manager`, which do not match the canonical profile role vocabulary. The current `src/App.jsx` does not import or route to this component. The current `src/components/dashboards/AdminDashboard.jsx` instead uses `profiles` and invokes `create-user` for account creation.

**Decision:** treat `public.profiles` as the authoritative application identity/authorization record. Treat `public.users` as legacy until a separate consumer and data-retention review proves it is still required. Do not merge, copy, or delete its records as part of baseline reconstruction.

## 2. Auth trigger verification

The supplied export includes `public.handle_new_user()`, a SECURITY DEFINER function that inserts a profile with a fixed `phc_staff` role and copies full name/phone from Auth user metadata.

A read-only production catalog query for non-internal triggers attached to `auth.users` returned no rows. Therefore:

- The function definition exists in the export, but an Auth signup trigger attachment was not found.
- The isolated staging project also has no non-internal Auth user trigger.
- Do not assume `handle_new_user()` executes during signup.
- Do not add an Auth trigger without deciding which signup methods are allowed, who may self-register, what default facility/role applies, and how duplicate profile creation is prevented.

The current Edge Function explicitly creates the Auth identity and then inserts its profile. Installing the exported Auth trigger unchanged could cause a duplicate-profile conflict for that path.

## 3. Deployed Edge Function versus repository source

Production metadata confirms:

- Function: `create-user`
- Status: ACTIVE
- Version: 2
- `verify_jwt`: true

The deployed version was retrieved read-only and compared with `supabase/functions/create-user/index.ts` on the current repository branch.

| Control | Deployed production v2 | Current repository source |
|---|---|---|
| Caller identity | Uses caller JWT via anon client `auth.getUser()` | Extracts bearer token and verifies with admin client's `auth.getUser(token)` |
| Administrator gate | Reads profile role and checks `administrator` | Same authorization outcome |
| Allowed roles | Includes `referring_staff` and `facility_admin`, which violate the exported profile role CHECK | Exactly `administrator`, `phc_staff`, `receiving_staff` |
| Facility validation | No existence/active-state check | Requires active facility for non-admin and validates selected facility is active |
| Email validation | Required only | Trimmed/lowercased, basic format and length checks |
| Full name/phone validation | Required only | Trims and enforces length limits |
| Profile failure | Attempts Auth deletion, returns database error detail | Attempts Auth deletion, returns generic error |
| Unexpected errors | Logs error object and may return exception detail | Does not log request details; returns generic error |
| CORS | Wildcard origin | Wildcard origin remains; origin allowlist is a remaining hardening decision |
| JWT gateway | Enabled | Source expects bearer verification as well; preserve enabled gateway verification |

### Findings

1. **Role/schema mismatch:** deployed function accepts two roles that the profile table CHECK constraint rejects. This produces a failed profile insert after Auth user creation, followed by a compensating Auth delete attempt.
2. **Facility validation gap:** deployed function can create profiles with missing, invalid or inactive facility assignments where the current UI supplies a facility. The repository source closes this gap.
3. **Information disclosure:** deployed function returns profile database error details and logs caught errors. These may reveal internal schema or operational details.
4. **Source/deployment drift:** the safer repository implementation is not the implementation currently running in production. A successful source build or Vercel deployment does not update a Supabase Edge Function.
5. **CORS remains broad in repository source:** wildcard CORS should be replaced with a deliberate allowed-origin policy or explicitly justified for the deployment topology. CORS is not authentication, but should not be left as an unexplained default.

**No deployment was performed.** Do not deploy a replacement until the exact current function, required environment variables, production callers, CORS origins, role model and rollback plan have been reviewed. Keep `verify_jwt=true`.

## 4. Required canonical provisioning contract

The approved future contract should be:

1. Gateway JWT verification remains enabled.
2. The function independently validates the bearer token and loads the caller's canonical `profiles` row.
3. Only an active administrator may provision accounts. If profile activation is not represented in the schema, do not invent an `is_active` field.
4. Accepted roles must exactly match the canonical role CHECK constraint unless a separately reviewed schema/product decision changes that vocabulary.
5. Non-administrator staff must be assigned to an existing active facility; administrator facility assignment follows an explicit policy.
6. User metadata is untrusted input and must never set role or facility authority.
7. Auth user creation and profile creation must have a defined idempotency/compensation strategy. A best-effort delete is not a transaction; test failure after each step and cleanup failure.
8. Responses must not disclose SQL/PostgREST internals, passwords, bearer tokens or service-role credentials.
9. Audit actor attribution and administrative account-provisioning events require an explicit event/retention design.
10. Temporary-password enforcement must be reliable. The dashboard currently sets `must_change_password` after account creation in a separate request and catches errors; this is not atomic with account creation. Treat the flag as a provisioning acceptance requirement, not an optional best-effort update.

## 5. Required decisions before baseline reconstruction

- Confirm `profiles` is the single source of truth for authorization and facility membership.
- Decide whether `public.users` is deprecated, retained for a documented external integration, or requires a controlled migration plan. Do not delete it during baseline work.
- Decide whether self-registration is supported. If not, do not attach `handle_new_user()` as a generic Auth signup trigger.
- If self-registration is required, design a separate least-privilege trigger that cannot grant privileged roles or arbitrary facilities from user metadata.
- Confirm administrator facility assignment policy and whether facilityless administrators are supported.
- Decide whether temporary-password accounts may be created if the password-change flag cannot be set.
- Define approved CORS origins and operational error telemetry.
- Review deployed-versus-source Edge Function drift and prepare a separate controlled release.

## 6. Synthetic staging acceptance matrix

After a reviewed baseline is reconstructed, test:

| Scenario | Expected result |
|---|---|
| Valid administrator creates PHC user at active facility | Auth user and one canonical profile created with `phc_staff` |
| Valid administrator creates receiving user at active facility | Profile uses `receiving_staff` |
| Non-admin caller | 403; no Auth user or profile created |
| Missing/invalid JWT | 401; no account created |
| Invalid role (including legacy role aliases) | 400; no account created |
| Missing/inactive/nonexistent facility for staff role | Rejected; no orphan Auth user |
| Duplicate email | Safe generic failure; no duplicate profile |
| Profile insert failure | Compensation verified; no orphan identity, or explicit recovery record if cleanup fails |
| Temporary-password flag failure | Account creation is rolled back or provisioning is marked incomplete and access is blocked pending repair |
| Auth signup with no trigger | Behavior matches the explicit signup policy |
| Auth signup if a trigger is later approved | Exactly one profile; role cannot be elevated through metadata |
| User metadata containing `role`, `facility_id`, or administrator claims | No authority is derived from metadata |
| Legacy `public.users` component | Not reachable in the active application; no privileged write path |
| CORS from approved and unapproved origins | Only approved browser origins receive CORS permission; JWT authorization remains independently enforced |

## 7. Environment boundary

- Production schema, Auth users, Edge Function deployment and secrets were not changed.
- The production function was inspected through metadata/source retrieval only; no endpoint invocation or account creation test was performed.
- Staging remains without application schema and without an Auth user trigger.
- This is a source/catalog reconciliation, not a live integration test.

**Decision:** identity design is partially resolved: `profiles` is the canonical active application identity model, while `public.users` is legacy/parallel. The deployed provisioning function is not source-aligned. Baseline reconstruction and production release remain NO-GO until the decisions and staging tests above are completed.


## Continuation addendum — hardened repository candidate (8 November 2026)

The remediation branch now contains additional source changes beyond the initial comparison above. This addendum supersedes the earlier statement that wildcard CORS remains in repository source and that the temporary-password flag is set in a separate dashboard request.

- The repository candidate now uses an exact-origin CORS allowlist. The canonical attached Vercel domain is `https://reflink-yobe.vercel.app`; optional additional origins are read from the comma-separated `REFLINK_ALLOWED_ORIGINS` Edge Function environment variable. Unapproved origins receive no `Access-Control-Allow-Origin` header. This is a browser-origin control only; bearer-token and administrator authorization remain mandatory.
- The Auth user and initial profile creation flow now sets `must_change_password: true` in the profile insert. The former non-atomic follow-up dashboard update was removed.
- If profile insertion fails after Auth user creation, the candidate attempts compensating Auth deletion and checks the deletion result. A failed cleanup is surfaced as requiring administrator review rather than being reported as a successful rollback.
- Regression tests cover allowed/denied CORS behavior, the atomic temporary-password profile field, cleanup success and cleanup failure.
- Exact-HEAD GitHub Actions for commit `4d8f84dd876d80a227d781bb72e23f07a97993e7` passed on both push and pull-request events. Both runs completed unit tests, lint, production build and Chromium real-browser offline queue tests.

### Remaining release gates

This is still repository source, not deployed behavior. Production `create-user` remains ACTIVE at version 2 and has not been replaced or invoked. The optional `REFLINK_ALLOWED_ORIGINS` runtime variable has not been configured in production. Before any release, confirm every legitimate browser origin, the Edge Function runtime environment, exact deployed source/version, and a rollback procedure. Do not add preview or wildcard origins merely for convenience.

The synthetic staging project still has no reconstructed application schema, so the candidate has not been exercised against a working Auth/profile schema or mocked Supabase integration. The test suite currently provides source-contract regression coverage, not a full Edge Function integration guarantee. Required staging cases remain those in Section 6, including duplicate email, role/facility authorization, profile insert failure, compensation failure, metadata trust boundaries and allowed/denied CORS origins.

**Decision:** repository-side account provisioning is materially hardened and exact-HEAD CI-verified. Production release remains NO-GO pending reviewed schema baseline, functional staging tests, origin confirmation and controlled deployment approval.
