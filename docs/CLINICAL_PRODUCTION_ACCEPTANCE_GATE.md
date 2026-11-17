# REFLINK v2.0 — clinical release acceptance gate

**Status: NO-GO for production.** This checklist is an acceptance specification, not evidence that any item has passed. A successful frontend CI run is necessary but insufficient.

## 1. Referral creation and receiving-facility lifecycle

- [ ] PHC user creates a synthetic referral with validated patient age, urgency, destination and clinical reason.
- [ ] Receiving-facility user sees only referrals permitted by their facility and database RLS.
- [ ] Acknowledge `sent → acknowledged`; arrival `acknowledged → patient_arrived`; assessment `patient_arrived → under_assessment`.
- [ ] Repeating an action from two browser sessions cannot roll the referral backward or duplicate a clinical event.
- [ ] Attempted unauthorized updates are rejected by the **database**, including direct REST requests.
- [ ] Referral ID remains visible when an attachment fails after the referral has already been created.

## 2. Clinical documentation and counter-referral

- [ ] Receiving clinician records examination, final diagnosis, investigations, treatment, disposition and time stamps.
- [ ] Admitted patients have admission and discharge documentation, including follow-up plan.
- [ ] Originating PHC can retrieve authorized receiving-facility feedback and discharge summary.
- [ ] Counter-referral acknowledgement and follow-up responsibilities are explicit and auditable.
- [ ] Simultaneous edits, stale tabs and interrupted saves do not silently discard clinical notes.
- [ ] Clinical lead approves the final forms and terminology using **synthetic** cases.

## 3. Mobile and low connectivity

- [ ] Test on 320px and 375px screens, keyboard-only, and screen readers.
- [ ] Offline warning is visible and no unsent referral is shown as successfully submitted.
- [ ] Any future offline patient-data storage is encrypted, access-controlled, time-limited, and reviewed for Nigerian data-protection compliance.
- [ ] Retry logic uses idempotency keys and explicit confirmation; no blind resubmission of uncertain writes.
- [ ] Printing and QR verification work in supported browsers without exposing patient details to unauthorized users.

## 4. Public-health intelligence

- [ ] Aggregates exclude `is_test=true` rows, do not disclose direct identifiers and report the authorization scope.
- [ ] Pagination is complete or an approved server-side aggregation endpoint is used.
- [ ] Suppress small cells in externally shared reports under an approved disclosure-control policy.
- [ ] Validate denominators, reporting periods, categories and duplicate-referral handling.
- [ ] District/state dashboards use an explicitly authorized reporting role, not a facility user's partial dataset.

## 5. Security, testing and release

- [ ] Frontend lint, build and unit tests pass on the final reviewed commit.
- [ ] Authenticated Supabase RLS tests cover PHC, receiving, admin, wrong-facility and revoked users.
- [ ] Verify private investigation attachment bucket, signed URLs, object access, retention and audit logs.
- [ ] Verify notification delivery, duplicate prevention, authorization and non-disclosure of clinical content.
- [ ] Back up production and verify a restore; reconcile the migration ledger.
- [ ] Run a synthetic staging end-to-end rehearsal with documented results.
- [ ] Clinical owner and authorized production operator explicitly approve the release.
- [ ] Only then merge/deploy using a rollback plan and monitor errors.

## Deployment protection

Keep PR #3 in draft and use its Vercel preview only for visual and synthetic-data checks. Confirm that preview environment variables do **not** expose or write to production clinical data. Do not create billable infrastructure, merge to `main`, or deploy production without explicit authorization.
