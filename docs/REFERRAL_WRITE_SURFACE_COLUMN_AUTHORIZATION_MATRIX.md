# REFLINK Referral Write-Surface and Column Authorization Matrix

**Review date:** 8 November 2026  
**Source reviewed:** `src/App.jsx`, `src/lib/offlineReferralQueue.js`, `api/referral-sms.js`, `supabase/migrations/20261105000100_admin_aggregate_referral_volume.sql`, current remediation branch  
**Purpose:** map existing browser and server write operations before narrowing authenticated grants or replacing direct PostgREST writes with transactional RPCs.

## 1. Current write surface

| Workflow | Current write | Columns / operation | Existing concurrency guard | Authorization boundary to preserve |
|---|---|---|---|---|
| PHC referral creation | INSERT `referrals` via `buildReferralCreatePayload()` | Explicit clinical intake allowlist; current user/profile and active destination supplied as trusted context | Required input validation; live destination lookup; fixed initial status | PHC staff role, current authenticated user and current profile facility; database must independently enforce the same predicates |
| Offline referral replay | INSERT `referrals` from `syncOwnedQueue()` via `buildReferralCreatePayload()` | Explicit allowlist; current Auth user, freshly read profile facility, live active destination, queue-record idempotency key | Owner-scoped IndexedDB claim; pre-write identity check; unique-conflict reconciliation by client ID and referring user | Queued facility/status/test fields are ignored; RLS/RPC must still independently derive/verify sender and enforce destination and role |
| Initial investigation file metadata | UPDATE `referrals` | `investigation_records` after upload | Referral ID only in reviewed update | Must prove caller is sender or assigned receiver; prevent cross-facility metadata injection |
| Investigation document upload | Storage upload | `referral-investigation-results` object path includes referral ID | `upsert:false` | Storage policy must bind object to authorized referral and correct participant role |
| Investigation result edit | UPDATE `referrals` | Entire `investigation_records` JSONB array | Client-side serialized queue; referral ID only | Receiving facility ownership and column-level scope; validate schema and prevent overwrite races |
| Acknowledge | UPDATE `referrals` | `status`, `acknowledged_at` | `status='sent'` compare-and-set | Receiving staff assigned to destination facility |
| Patient arrival | UPDATE `referrals` | `status`, `patient_arrived_at` | `status='acknowledged'` compare-and-set | Receiving staff assigned to destination facility |
| Start assessment | UPDATE `referrals` | `status` | `status='patient_arrived'` compare-and-set | Receiving staff assigned to destination facility |
| Save assessment | UPDATE `referrals` | `assessment_findings`, `final_diagnosis`, `treatment_provided`, `procedures_performed`, `clinical_feedback`, `disposition`, `assessment_completed_at`, and status-dependent fields (see source `updateData`) | `status='under_assessment'` compare-and-set | Receiving staff assigned to destination facility; enforce permitted transition and column set |
| Admission record | UPDATE `referrals` | `admission_at`, `ward_unit`, `admission_diagnosis`, `clinical_progress`, `inpatient_treatment`, `status='admitted'` | Current code filters `status='admitted'`; this edits an already admitted episode | Receiving staff assigned to destination facility |
| Discharge record | UPDATE `referrals` | `discharge_diagnosis`, `condition_at_discharge`, `discharge_medications`, `follow_up_plan`, `discharged_at`, `status='discharged'` | `status='admitted'` compare-and-set | Receiving staff assigned to destination facility |
| Counter-referral | RPC `submit_counter_referral` | Fixed arguments: diagnosis, treatment, outcome, follow-up, further referral destination, notes | Locks referral row `FOR UPDATE`; discharged-only; retry handling | Explicit receiving_staff role, non-null profile facility matching referral receiving facility; only completes discharged episode |
| SMS notification | Vercel API `POST /api/referral-sms` | INSERT `referral_notifications` delivery/skipped/failed records; sends Twilio SMS | JWT validated with Auth; no idempotency key or per-referral delivery claim observed | Role/facility/status checks differ by notification type; service-role reads/writes must remain server-side |

## 2. Important source-level observations

1. Several referral updates use only `id` as the row predicate for investigation metadata. They rely on RLS to authorize the row, but RLS does not constrain the set of columns a caller may update.
2. Status transitions use expected prior-status filters and handle a no-row result as a stale update. Keep this compare-and-set behavior in any replacement RPC.
3. Investigation results are stored as a complete JSONB array. A one-tab serialized write queue does not prevent concurrent writes from another browser/device. Consider optimistic versioning or row locking in a server-side transaction.
4. File upload occurs before referral JSONB metadata update. If metadata persistence fails, an orphaned Storage object may remain. Cleanup must not delete an object referenced by another committed update.
5. The direct update paths should not be replaced by a broad generic RPC accepting arbitrary JSONB patches. Each operation needs a fixed, validated argument schema and a role/facility/status guard.
6. **Offline replay payload hardening.** The earlier implementation spread decrypted `item.payload` into the INSERT. The current branch replaces that spread with a shared explicit allowlist, rechecks the authenticated user before the lookup/write path, reloads the current PHC profile facility, and requires a live destination row with `is_active = true`. The same builder is used by online submission. This closes the local payload-spread defect, but is not a server-side authorization boundary: a caller can bypass browser code and send PostgREST requests directly. RLS or a fixed-argument `create_referral` RPC must independently bind `auth.uid()`, current profile role/facility, active destination, fixed `sent` status and `is_test = false` before INSERT grants can be narrowed. The database unique key and existing conflict reconciliation remain the idempotency controls.
7. **Counter-referral RPC is the strongest reviewed write boundary.** It derives actor identity from `auth.uid()`, checks `receiving_staff`, matches the profile facility to `receiving_facility_id`, locks the referral, accepts only a discharged episode, validates fixed fields/outcome, and performs insert plus completion in one transaction. Its retry path returns the existing completion only when the same receiving user owns the existing counter-referral. Retain these properties and add DB integration tests for wrong role, wrong facility, concurrent calls, existing counter-referral and stale status.
8. **SMS API uses a service-role client only after validating the bearer token and loading the caller profile.** It checks PHC owner/role/facility/status for `referral_sent` and receiving role/facility/acknowledgement for `referral_acknowledged`. It does not expose patient details in the SMS body. However, repeated authorized requests can trigger repeated provider sends and notification rows; there is no idempotency key, atomic send claim, or rate-limit mechanism visible in this route. Move delivery coordination onto the notification outbox/idempotency design before treating this endpoint as reliable at scale.
9. The production project currently exposes only one active Edge Function, `create-user`; no referral-mutating Edge Function was listed. The repository's root `supabase/functions/index.ts` is historical commentary, not another deployable function.

## 3. Proposed authorization design

### Phase A — preserve existing workflow while reducing privilege

- Keep current SELECT/INSERT/UPDATE grants until exact column grants and every dependent code path are verified.
- Do not revoke table-level INSERT while offline replay still uses direct PostgREST INSERT.
- Do not revoke table-level UPDATE before equivalent column-level grants or RPC operations are available.
- Remove structural grants (`TRUNCATE`, `TRIGGER`, `REFERENCES`) only after the candidate migration is validated in schema-correct staging.
- Review DELETE separately; do not infer that no external consumer exists from the browser UI.
- Before changing INSERT authorization, replace the offline payload spread with a strict allowlist and verify facility attribution at the database boundary.

### Phase B — operation-specific transactional endpoints

Prefer narrow operations such as:

- `create_referral(...explicit intake fields...)` (shared by online and offline paths, with an idempotency key)
- `acknowledge_referral(referral_id)`
- `record_patient_arrival(referral_id)`
- `start_referral_assessment(referral_id)`
- `save_referral_assessment(referral_id, validated clinical fields...)`
- `record_referral_admission(referral_id, validated admission fields...)`
- `discharge_referral(referral_id, validated discharge fields...)`
- `save_investigation_result(referral_id, validated result patch...)`

Each function must derive identity from `auth.uid()`, verify the canonical profile role/facility, lock the target row where lifecycle concurrency matters, enforce exact expected status, validate fixed fields and reject unknown input, update only operation-owned columns, write required audit/history/outbox events transactionally, return minimal data, use a fixed safe `search_path`, and have negative/concurrency integration tests.

## 4. Unresolved product/clinical decisions

1. **PHC continuity:** should all PHC staff at the referring facility see facility referrals, or only the original referring user?
2. **Investigation authorship:** may any receiving staff enter results, or only designated clinical roles?
3. **Admin visibility:** define aggregate intelligence access without routine patient-level browsing.
4. **Attachment lifecycle:** specify retention, authorized download, orphan cleanup and audit requirements.
5. **SMS operational policy:** define retry limits, escalation, delivery receipts, duplicate suppression and who may initiate manual resend.

## 5. Verification required before any privilege change

- Complete source inventory including online UI, offline replay, API routes, Edge Functions and scheduled jobs.
- Inspect column-level ACLs/default privileges and all Storage object policies.
- Build schema-correct synthetic staging; current staging project has no reconstructed application schema.
- Test synthetic PHC Facility A/C, Receiving Facility B/D and administrator identities.
- Test offline replay with tampered payloads and concurrent duplicate replay.
- Test SMS API authorization and duplicate/replay behavior without contacting real recipients.
- Verify workflows after each permission change. Do not apply this matrix or proposals directly to production.

## 6. Current release status

This is a source-level authorization review, not a live authorization test. No patient rows or Storage objects were accessed; no production or staging schema, policy, data or configuration was changed. The structural ACL candidate remains proposal-only. The offline replay payload spread is now a priority INSERT-hardening dependency. The next safe step is to define the canonical referral-create allowlist and database-side facility derivation, then add synthetic tests before any INSERT grant reduction.


## 7. Canonical referral-create payload contract — application remediation

The online PHC form and offline replay use `buildReferralCreatePayload()` from `src/lib/referralCreation.js`. The helper constructs a new payload from an explicit allowlist; it never spreads the online form or decrypted queue object into the INSERT.

**Permitted clinical intake fields**

- Patient/referral details: `referral_number`, `patient_identifier`, age in months, sex, patient and caregiver contact fields.
- Clinical intake: chief complaint and category, clinical summary, physical findings, diagnosis records and legacy diagnosis fields, investigation categories/records and legacy investigation text, structured treatment and referral reason.
- Priority: `urgency`.

**Sanitized nested JSON**

- Diagnosis entries are limited to `status`, `category` and `diagnosis`.
- Investigation entries are limited to the reviewed result and attachment-metadata fields. Binary `File` objects and unknown nested properties are discarded.
- Structured finding, investigation-category and treatment arrays accept strings only.

**Context/system-controlled fields**

| Column | Source used by the application | Rule |
|---|---|---|
| `referring_user_id` | Current `auth.getUser()` result | Never copied from the queue or form |
| `referring_facility_id` | Fresh `profiles.facility_id` read for the authenticated user | Cached queue facility is ignored |
| `receiving_facility_id` | Fresh `facilities` row read at submit/sync time | The selected ID must match a row with `is_active = true` |
| `status` | Fixed application value | Always `sent`; queued status overrides are ignored |
| `offline_client_id` | Stable online client ID or IndexedDB queue record ID | Must match the queue payload when one is present; retained for idempotency reconciliation |
| `sync_source` | Fixed call-path value | `online` or `offline`; not copied from intake |
| `is_test` | Fixed application value | Always `false`; synthetic test fixtures belong in controlled staging tooling |
| `created_at` | PostgreSQL default | Omitted from the client payload so the database supplies the timestamp |

Offline replay now revalidates the authenticated account before its referral lookup/write path, reloads the canonical PHC profile, rechecks that the requested destination is explicitly active, and builds the same allowlisted payload used by online submission. Existing unique-conflict reconciliation and per-account queue claim/fencing behavior are preserved.

**Security boundary warning:** this JavaScript contract reduces accidental and locally tampered payload fields, but it is not database authorization. A caller can bypass browser code and send PostgREST requests directly. Before reducing INSERT grants or approving multi-facility production, RLS or a narrow transactional `create_referral` RPC must independently enforce `auth.uid()`, the profile's current facility and PHC role, an active destination, initial `sent` status, `is_test = false`, and uniqueness/idempotency. The new tests are source/unit tests; they do not prove live Supabase authorization.

