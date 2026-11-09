# REFLINK audit-log PHI minimization design

**Status:** Design proposal only — NOT an executable migration and NOT applied.  
**Scope:** `public.audit_log` and `public.audit_referral_mutation()` during isolated synthetic-staging baseline reconstruction.  
**Production boundary:** Production remains read-only. No trigger, function, ACL, schema, or patient data was changed.

## 1. Finding and risk

The supplied schema export defines `public.audit_referral_mutation()` as a `SECURITY DEFINER` trigger function. On INSERT, UPDATE, and DELETE it writes `to_jsonb(NEW)` and/or `to_jsonb(OLD)` into `public.audit_log.new_data` and `old_data`.

The trigger is attached to both `public.referrals` and `public.counter_referrals`. The referrals relation contains direct identifiers and sensitive clinical content, including patient identifier, phone/address, relative contact details, chief complaint, clinical summary, findings, diagnoses, investigations, treatment, and follow-up information. A full-row audit snapshot therefore creates a second PHI repository with a separate access, retention, export, and breach surface.

The current function also sets `search_path = public`; its references to application objects are qualified, but the path should be hardened as part of a separately tested function reconstruction. The function is owned by `postgres` and runs with definer privileges.

## 2. Design objective

Preserve accountability and operational traceability while avoiding duplicate patient/clinical content in the audit store.

The audit event should answer:
- Which application record was affected?
- What operation occurred and when?
- Which authenticated actor initiated it, where an authenticated actor exists?
- Which non-sensitive workflow fields changed?
- What were the prior and resulting values of explicitly approved operational fields?

It should not become a copy of the referral record or a clinical documentation system.

## 3. Proposed event payload

Keep the existing relational event envelope where compatibility requires it:
- `actor_user_id`
- `action` (`CREATE`, `UPDATE`, `DELETE`)
- `table_name`
- `record_id`
- `created_at`

For `old_data` and `new_data`, replace full-row serialization with a deliberately small, table-specific allowlist. For updates, record only allowlisted values that actually changed. Do not serialize the complete row and then attempt to redact selected keys.

### Candidate allowlist

| Source relation | Candidate captured fields | Explicit exclusions |
|---|---|---|
| `referrals` | `status`, `urgency`, `referring_facility_id`, `receiving_facility_id`, `acknowledged_at`, `patient_arrived_at`, `assessment_completed_at`, `admission_at`, `discharged_at`, `completed_at` | patient identifier, age, sex, phone, address, relative contacts, complaints, narrative, findings, diagnosis, investigations, treatment, medication, clinical progress, follow-up notes, offline payloads |
| `counter_referrals` | Record/referral identifiers in the event envelope; optionally a changed-field-name list after review | final diagnosis, treatment, outcome, follow-up instructions, further-referral destination, additional notes |
| Other attached relations | Event envelope and changed field names only until a table-specific allowlist is approved | All unreviewed values and all free-text/clinical fields |

Facility IDs are operational routing metadata, not patient clinical content; nevertheless, their use should be confirmed against the minimum-necessary policy. If a deployment's threat model treats facility IDs as sensitive, capture only the changed field names.

For INSERT and DELETE, capture only the allowlisted operational fields; do not store a full row image. For UPDATE, include only changed allowlisted fields. Do not store free-text values, raw JSON payloads, or hashes of excluded clinical values as a substitute: hashes can still create linkability and are not anonymization.

## 4. Actor and system-event semantics

The current function uses `auth.uid()`, which can be NULL for trusted background or system-originated operations. Do not invent a user identity or accept an actor ID supplied by an untrusted browser payload.

Before implementation, define a trusted event-source contract:
- authenticated user action: actor identity is derived from the verified request context;
- trusted system action: actor remains NULL unless an approved, separately validated system-principal model exists; record a controlled source/type only when it is set by a trusted server-side path;
- missing actor context must not cause an audit write to fail if the workflow is intentionally system-originated, but it must be distinguishable from an authenticated human action.

Do not use mutable user metadata as an authorization or actor source. Confirm how service-role and scheduled operations are represented before selecting the final schema.

## 5. Compatibility and migration requirements

This is not a drop-in code replacement. Before changing the function:
1. Inventory every consumer of `audit_log.old_data` and `audit_log.new_data` in the frontend, admin dashboard, exports, reports, and support workflows.
2. Confirm whether consumers expect complete row snapshots or only event metadata.
3. Agree a versioned event contract and a safe generic fallback for historical rows.
4. Preserve the current trigger coverage for referral and counter-referral INSERT/UPDATE/DELETE unless a separately approved event design replaces it.
5. Preserve the required audit INSERT privilege path and verify the actual trigger execution identity.
6. Keep audit reads restricted; PHI minimization does not justify broadening audit-log SELECT.
7. Define retention, access logging, export controls, and incident-response handling for historical full-row audit records already stored in production.

Historical audit rows are not made safe by changing future trigger writes. Any historical-data remediation requires a separate retention/legal/clinical governance decision and must not silently delete records.

## 6. Required synthetic-staging acceptance tests

- INSERT, UPDATE, and DELETE on `referrals` create exactly one corresponding audit event.
- INSERT, UPDATE, and DELETE on `counter_referrals` retain the required audit trail.
- Audit payloads contain only approved allowlisted keys.
- Patient identifiers, phone/address, relative contacts, free text, diagnoses, investigations, treatment, medication, and clinical notes never appear in new audit payloads.
- UPDATE records only changed allowlisted values; unchanged values are omitted.
- NULL actor/system-originated events follow the approved actor-source contract.
- A failed audit write does not silently produce an unaudited clinical mutation; transaction behavior is explicit and tested.
- Browser roles cannot forge, update, delete, truncate, or directly insert audit records.
- Approved audit readers continue to work under the existing RLS model.
- No frontend/admin/export consumer breaks when the new minimized event contract is returned.
- Existing audit history remains readable under its existing permissions and retention policy.

Use synthetic records only. Test both positive and negative role/facility contexts. Run Supabase advisors and compare before/after function owner, SECURITY DEFINER flag, search path, trigger attachments, and ACLs.

## 7. Release decision

**NO-GO for changing the production function or applying an audit-log migration now.** The source-level PHI duplication risk is clear, but the consumer contract, historical-data policy, actor semantics, and actual trigger writer privilege path require evidence and approval.

The next implementation stage is a synthetic-staging prototype after the complete schema baseline is reconstructed and explicitly authorized. Production remains read-only.
