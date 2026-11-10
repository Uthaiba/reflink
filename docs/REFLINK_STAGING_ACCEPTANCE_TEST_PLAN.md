# REFLINK staging acceptance test plan

## Purpose
Validate the existing REFLINK referral workflow against isolated synthetic staging before production release. No real patient records or production identities may be used.

## Test identities
Create disposable synthetic identities through administrator-controlled Auth workflow:
- Platform administrator — administrator role.
- Referring PHC staff — Facility A.
- Receiving staff — Facility B.
- Unrelated PHC staff — Facility C.
- Disabled/unassigned staff — if supported by the current account lifecycle.
Use synthetic names and test-only patient identifiers. Never use real phone numbers, real clinical records or production accounts.

## Access-control tests
1. PHC A can create and view referrals it is authorized to manage.
2. PHC A cannot read or mutate Facility C referrals by changing UUIDs or API filters.
3. Receiving staff B can access referrals addressed to Facility B, not Facility C.
4. Unrelated staff cannot retrieve attachments by guessing object paths.
5. Anonymous requests cannot read referral records or private investigation files.
6. Authenticated clients cannot read internal referral event/feedback ledgers or mutate profile role, facility or forced-password-change fields.
7. Only administrators can provision accounts and change protected profile assignments.
8. Facility user-count RPC returns only the caller's own facility count to non-admin staff and denies attempts to enumerate other facilities.

## Referral lifecycle tests
- Draft creation and editing.
- Submit to sent; receiving facility acknowledgement.
- Patient arrival and assessment.
- Admission/discharge and structured counter-referral requirement before completion.
- Invalid status transitions rejected by the database.
- Emergency referrals rejected when clinical findings are missing.
- Offline duplicate retry uses a stable client-generated identifier and does not create duplicate referrals.
- Concurrent print requests produce unique print numbers.
- Referral status and audit records remain consistent after rollback/failure.

## Attachment tests
- Upload PDF/JPEG/PNG/WebP/TXT/CSV within the 10 MB limit.
- Reject unsupported MIME types and oversized files.
- Confirm referral participant access and wrong-facility denial.
- Verify private object access uses authenticated requests or short-lived signed URLs.
- Confirm replace/delete policies cannot move an object to another referral path.

## Account security tests
- Expired/missing/invalid JWT rejected by both Edge Functions.
- Non-administrator denied by create-user.
- Invalid role, malformed email, weak password and invalid facility UUID rejected.
- If profile creation fails after Auth user creation, compensating deletion occurs.
- Password change updates Auth password, clears the forced-change flag and does not expose service-role credentials.
- Direct client attempts to clear the forced-change flag fail.
- Verify session revocation and token refresh behaviour after password change.

## Notification tests
- A referral entering sent queues one dashboard notification.
- A referral entering acknowledged queues one dashboard notification.
- Repeated event delivery does not create duplicates (idempotency key).
- Only referral participants can view the notification log.
- SMS remains disabled until recipient consent, provider configuration, retry policy, rate limiting and delivery monitoring are approved.

## Analytics and public-health tests
- Validate indicator definitions with clinical/public-health reviewers.
- Use minimum-necessary, aggregated data for reporting.
- Apply small-cell suppression and facility/LGA access scopes before exports.
- Exclude direct identifiers and free-text clinical narratives from policy dashboards.
- Reconcile aggregate counts against authorized source records using synthetic datasets.
- Record data dictionary, refresh cadence, limitations and responsible data steward for each indicator.

## Clinical, privacy and accessibility acceptance
- Clinical governance review of referral fields, urgency definitions, escalation intervals and counter-referral workflow.
- Privacy impact assessment and Nigeria Data Protection Act 2023 compliance review by qualified personnel.
- Audit retention schedule, access monitoring, breach response and backup/restore exercise.
- Keyboard navigation, screen-reader labels, contrast, mobile layout and low-bandwidth usability.
- User acceptance with PHC and receiving-facility staff under supervised, non-production conditions.

## Release blockers
- No authenticated browser/API run is claimed until disposable synthetic Auth identities exist.
- Vercel preview deployment is blocked by the current build-rate limit.
- Supabase leaked-password protection still needs Auth configuration access.
- No SMS provider or consent workflow is configured.
- No offline browser queue exists in the current frontend; offline draft schema and referral deduplication fields exist, but encryption/key management and sync conflict handling must be implemented and tested before claiming offline readiness.
- No clinical or privacy sign-off is implied by technical tests.

## Release rule
Keep the PR draft and production unchanged until every applicable test has evidence, findings are resolved or accepted by accountable owners, backups/rollback are prepared, and explicit production change approval is recorded.