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
- Restore an encrypted draft while online and manually submit it; verify its original `offline_client_id` is reused and `sync_source` is `offline`.
- Verify the server-side authenticated profile is re-read at submission time and only `phc_staff` can create referrals; receiving staff, administrators and unrelated roles fail closed.
- Verify the currently assigned facility is re-read at submission time and is the value used for `referring_facility_id`, even if the draft was created before the user's facility assignment changed.
- Simulate a lost client response after a successful insert, retry with the same client ID, and verify the UI identifies the existing referral and refuses to report a second successful submission.
- Verify a concurrent unique-index collision re-reads only the matching referral owned by the signed-in user, reports that referral as already submitted and fails closed; an inaccessible or mismatched collision fails closed.
- Verify ordinary online submissions use `sync_source=online` and receive a fresh client ID after success.
- Verify a retry with selected investigation attachments is blocked when an earlier referral with that client ID exists, rather than duplicating uploads.
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

## Encrypted offline draft tests
- Create a local vault with a 16-character passphrase and reject shorter passphrases.
- Verify PBKDF2/AES-GCM encryption and that plaintext patient/clinical fields do not appear in IndexedDB records.
- Verify an incorrect passphrase cannot unlock or alter existing drafts.
- Verify drafts are scoped to the authenticated REFLINK user after decryption.
- Verify restore repopulates the form and requires a fresh review before submission.
- Verify the vault locks after five minutes of inactivity, when the tab is hidden and when the referral form unmounts.
- Verify investigation attachments prevent offline saving.
- Verify offline submission is blocked with a clear message; saving locally must never be represented as a sent referral.
- Verify local drafts are never automatically synchronized or silently submitted. The restored form requires an explicit online submit action.
- Verify manual retry idempotency with the stable `offline_client_id` and database unique index. This does not provide background sync, automatic retries, conflict resolution for changed clinical data or attachment synchronization.

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
- A Vercel Preview deployment for commit `628bd89a333e82d56095650b3e9bbf68620826fb` reached READY. The latest documentation-only commit still needs deployment confirmation, and authenticated browser acceptance remains outstanding.
- Supabase leaked-password protection still needs Auth configuration access.
- No SMS provider or consent workflow is configured.
- Encrypted local draft save/restore and stable-ID idempotency for manually resubmitting a restored draft are implemented. They have not yet passed authenticated browser/API acceptance. Background synchronization, clinical conflict resolution and attachment synchronization remain unimplemented. Do not claim full offline referral submission.
- No clinical or privacy sign-off is implied by technical tests.

## Release rule
Keep the PR draft and production unchanged until every applicable test has evidence, findings are resolved or accepted by accountable owners, backups/rollback are prepared, and explicit production change approval is recorded.