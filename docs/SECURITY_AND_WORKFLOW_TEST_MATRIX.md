# REFLINK Phase 1 — Security and Workflow Test Matrix

Run only in a non-production Supabase project with synthetic users and synthetic referrals. Do not use patient data.

## Role and facility access

| Scenario | Expected result |
|---|---|
| PHC user reads a referral they created | Allowed |
| PHC user reads another PHC user's referral | Denied |
| PHC user updates a referral assigned to a receiving facility | Denied |
| Receiving user reads referral assigned to their facility | Allowed |
| Receiving user reads referral assigned to another facility | Denied |
| Receiving user inserts counter-referral for assigned referral with their own user ID | Allowed |
| Receiving user inserts counter-referral using another user's ID | Denied |
| Receiving user inserts counter-referral for another facility's referral | Denied |
| Administrator queries individual referrals through ordinary client SELECT | Denied unless a separately approved, audited clinical access policy is introduced |
| Non-administrator calls aggregate reporting RPC | Denied |
| Administrator calls aggregate reporting RPC | Allowed; aggregate fields only |

## Counter-referral lifecycle

1. Sign in as receiving staff for the assigned facility.
2. Open a synthetic referral in discharged status.
3. Submit required final diagnosis and outcome.
4. Verify one counter_referrals row exists and referral status becomes completed.
5. Retry after simulating a lost response; verify no duplicate counter-referral is created.
6. Attempt from PHC role; verify denial.
7. Attempt from receiving staff assigned to a different facility; verify denial.
8. Verify that a pre-existing counter-referral on a still-discharged referral is not silently treated as a successful new submission; it must be reconciled through an authorised clinical workflow.
9. Attempt completion without a counter-referral; database trigger must reject it.
10. Attempt to complete a referral from any status other than discharged; database transition trigger must reject it.

The current UI uses two requests, so steps 8 and 9 are especially important. Prefer a single transactional RPC for final production use.

## Account provisioning

- Reject roles other than administrator, phc_staff and receiving_staff.
- Require an active facility for PHC and receiving roles.
- Reject inactive or unknown facility IDs.
- Reject unauthenticated and non-administrator callers.
- Verify failed profile creation rolls back the Auth user.
- Verify passwords, tokens and request bodies are never written to logs.

## Analytics disclosure controls

- Counts 1–4 must return null with suppression=true.
- Count 0 must return zero.
- Counts >=5 may return the aggregate count.
- Test period validation, including reversed dates and periods longer than 366 days.
- Confirm the RPC returns no patient identifiers, diagnosis, phone, exact record IDs or facility-level breakdown.
- Confirm this referral volume is labelled as a service-activity count, not incidence or prevalence.

## Regression and release gates

- npm run build
- npm run lint
- Login/logout/password reset
- Role-specific dashboard navigation
- Referral creation and validation
- Acknowledgement, arrival, assessment, admission, discharge, counter-referral, completion and cancellation
- Offline queue retry after server commit/client timeout
- Attachment upload and access control
- SMS authorisation, idempotency and rate limiting
- Mobile responsive layout and keyboard navigation
- WCAG 2.2 AA contrast, labels, focus and error announcements

## Not yet verified

These are test cases, not passing test results. No production patient records should be used to perform them.

## Offline referral synchronisation regression

1. Queue a synthetic referral offline and reconnect.
2. Verify sync checks `offline_client_id` before inserting.
3. Simulate the server committing while the client loses the response; verify the next sync finds the existing row and removes the queue item without duplicating the referral.
4. Simulate two clients racing to sync the same client ID; verify the unique constraint conflict is reconciled by looking up the existing row.
5. Verify no patient payload, client ID, token or raw database error is written to the browser console.
6. Verify notification failure does not block queue reconciliation; separately record that durable notification delivery is not guaranteed by this client-only queue.
7. Test account sign-out, shared-device exposure, browser storage inspection and device loss; document residual PHI risks.

These changes improve duplicate prevention and log hygiene. They do not encrypt IndexedDB payloads or make offline PHI storage safe on shared/unmanaged devices.
