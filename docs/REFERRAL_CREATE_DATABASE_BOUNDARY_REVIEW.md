# Referral Creation — Database Boundary Review

**Review date:** 9 November 2026  
**Scope:** supplied schema export, current application branch, online PHC submission, offline replay, and the proposed database creation guard.  
**Environment:** source and schema review only. No SQL was executed against production or staging.

## 1. Current database contract

The supplied `reflink-production-schema.sql` defines the INSERT policy `PHC staff can create referrals`. Its predicate requires:

- `referring_user_id = auth.uid()`; and
- a `profiles` row for the authenticated user with role `phc_staff` and `facility_id = referrals.referring_facility_id`.

This is a useful row-level identity and sender-facility check. It does **not** verify that `receiving_facility_id` references an active facility, and it does not constrain the initial `status`, `is_test`, `created_at`, or other lifecycle columns. The authenticated role also has broad table DML grants in the supplied export. RLS therefore remains necessary, but the existing INSERT policy is not the complete create contract.

## 2. Application integration verified on the branch

Both creation paths now call `buildReferralCreatePayload()`:

- Online PHC submission obtains `auth.getUser()`, reloads the current profile, checks the selected facility against a live `facilities` row with `is_active = true`, and then inserts the allowlisted payload.
- Offline replay verifies the current authenticated user, reloads the canonical profile, rechecks the destination's active state, applies the same builder, and retains the unique-conflict reconciliation and IndexedDB claim fencing.

The browser helper is defence in depth. A caller can bypass it and issue a direct PostgREST request, so the database must independently enforce the security-sensitive values.

## 3. Schema compatibility defect found and corrected in source

The supplied schema constrains `referrals.diagnosis_status` to exactly one of `suspected`, `provisional`, or `confirmed` (or NULL). The online/offline form previously constructed a comma-separated summary when multiple diagnoses had different statuses. That value would violate the database CHECK constraint even though the detailed `diagnosis_records` JSONB array was valid.

The shared builder now derives the legacy scalar from the canonical records:

- one distinct valid status: persist that status;
- multiple distinct valid statuses: persist NULL and retain all statuses in `diagnosis_records`;
- blank status: persist NULL;
- unknown status: reject the payload.

Regression tests cover the single, mixed, blank and invalid cases.

The supplied schema also defines a **global** partial unique index on `offline_client_id`, not a composite per-user index. The current client generates a unique client ID and reconciles conflicts using both the ID and authenticated user. A collision belonging to another user therefore fails closed rather than revealing the other user's referral. Treat this key as globally unique; do not describe the database index as user-scoped.

## 4. Database guard proposal

Added proposal migration:

`supabase/migrations/20261109000100_enforce_referral_create_context.sql`

The proposed BEFORE INSERT trigger:

- runs as SECURITY INVOKER with an empty search path;
- requires a non-null authenticated identity;
- reloads the caller's canonical profile and requires `phc_staff` plus a non-null facility;
- verifies the receiving facility exists and `is_active = true`;
- derives `referring_user_id` and `referring_facility_id` from the authenticated identity/profile;
- forces `status = 'sent'`, `is_test = false`, and `created_at = now()`;
- requires a globally unique offline idempotency key and an explicit `online` or `offline` sync source;
- clears lifecycle/receiving-side fields that must only be populated by subsequent workflow operations.

The trigger name begins with `a_` so PostgreSQL's alphabetical ordering for same-kind triggers makes the trusted creation context run before the existing acknowledgement-due trigger and referral-entry validation trigger. This ordering must be confirmed against the actual target catalog before execution.

The proposal deliberately does **not** revoke table INSERT/UPDATE privileges or replace the existing RLS policy. It is an incremental database guard, not the final least-privilege design. It also deliberately preserves the privileged database/service-role path; that bypass must remain limited to trusted backend credentials.

Added `tests/referralCreateDatabaseBoundary.test.js` to protect the SQL proposal's invoker mode, empty search path, identity/facility derivation, active-destination check, lifecycle defaults, idempotency requirements and no-grant-change scope. These are static source-contract tests, not PostgreSQL integration tests.

## 5. Remaining verification gates

Before this candidate can be considered deployable:

1. Reconstruct the supplied schema in an isolated synthetic staging database and reconcile it against the live catalog and migration history.
2. Confirm the trigger order and exact table/function ACLs in that environment.
3. Execute positive and negative tests under synthetic JWTs: PHC active destination, inactive destination, nonexistent destination, missing profile, wrong role, wrong sender facility, spoofed identity, status override, test-flag override, and privileged service-role behavior.
4. Verify the existing acknowledgement-due and referral-entry triggers still behave correctly after the new trigger.
5. Verify the global `offline_client_id` unique index and concurrent replay behavior.
6. Test online and offline UI submission against the RPC/trigger contract, including a destination deactivated between form load and submission.
7. Obtain clinical and product approval for the persisted representation of multiple diagnosis statuses.

**No-go:** do not apply this migration to production or staging until the schema baseline is reconstructed and the above synthetic database tests pass. No production/staging schema, RLS policy, grant, patient row, Storage object, secret, Edge Function or deployment was changed in this review.
