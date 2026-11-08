# REFLINK Referral Write-Surface and Column Authorization Matrix

**Review date:** 8 November 2026  
**Source reviewed:** `src/App.jsx`, current remediation branch  
**Purpose:** map existing browser write operations before narrowing authenticated grants or replacing direct PostgREST writes with transactional RPCs.

## 1. Current write surface

| Workflow | Current write | Columns / operation | Existing concurrency guard | Authorization boundary to preserve |
|---|---|---|---|---|
| PHC referral creation | INSERT `referrals` | Full referral intake payload; server identity/facility attribution expected | Database entry validation; RLS insert policy | PHC role, authenticated user, own facility as sender; active destination |
| Initial investigation file metadata | UPDATE `referrals` | `investigation_records` after upload | Referral ID only in reviewed update | Must prove caller is sender or assigned receiver; prevent cross-facility metadata injection |
| Investigation document upload | Storage upload | `referral-investigation-results` object path includes referral ID | `upsert:false` | Storage policy must bind object to authorized referral and correct participant role |
| Investigation result edit | UPDATE `referrals` | Entire `investigation_records` JSONB array | Client-side serialized queue; referral ID only | Receiving facility ownership and column-level scope; validate schema and prevent overwrite races |
| Acknowledge | UPDATE `referrals` | `status`, `acknowledged_at` | `status='sent'` compare-and-set | Receiving staff assigned to destination facility |
| Patient arrival | UPDATE `referrals` | `status`, `patient_arrived_at` | `status='acknowledged'` compare-and-set | Receiving staff assigned to destination facility |
| Start assessment | UPDATE `referrals` | `status` | `status='patient_arrived'` compare-and-set | Receiving staff assigned to destination facility |
| Save assessment | UPDATE `referrals` | `assessment_findings`, `final_diagnosis`, `treatment_provided`, `procedures_performed`, `clinical_feedback`, `disposition`, `assessment_completed_at`, and status-dependent fields (see source `updateData`) | `status='under_assessment'` compare-and-set | Receiving staff assigned to destination facility; enforce permitted transition and column set |
| Admission record | UPDATE `referrals` | `admission_at`, `ward_unit`, `admission_diagnosis`, `clinical_progress`, `inpatient_treatment`, `status='admitted'` | Current code filters `status='admitted'`; verify this is intentional because it is not an entry transition guard | Receiving staff assigned to destination facility; clarify whether this action edits an existing admitted episode or performs admission |
| Discharge record | UPDATE `referrals` | `discharge_diagnosis`, `condition_at_discharge`, `discharge_medications`, `follow_up_plan`, `discharged_at`, `status='discharged'` | `status='admitted'` compare-and-set | Receiving staff assigned to destination facility |
| Counter-referral | RPC | `submit_counter_referral` contract is separately tested; not a direct table insert in reviewed UI flow | Database transaction / retry contract | Receiving staff must own receiving facility; discharge and completion invariants |

## 2. Important source-level observations

1. Several referral updates use only `id` as the row predicate for investigation metadata. They rely on RLS to authorize the row, which is correct in principle, but the RLS policy does not constrain the set of columns the caller can update.
2. Status transitions use expected prior-status filters and handle a no-row result as a stale update. Keep this compare-and-set behavior in any replacement RPC.
3. The admission handler currently writes `status='admitted'` while also filtering for `status='admitted'`. This appears to be an edit of an already admitted record, not the transition from `under_assessment` to `admitted`. The actual admission transition may occur in the assessment save handler; verify the full `updateData` builder before changing the state machine.
4. Investigation results are stored as a complete JSONB array. Serializing writes in one browser tab avoids some local reordering but does not prevent concurrent writes from another browser/device. Consider optimistic versioning or row locking in a server-side transaction.
5. File upload occurs before the referral JSONB metadata update. If metadata persistence fails, an orphaned Storage object may remain. A cleanup/reconciliation strategy is required; deleting an uploaded object automatically must not remove a file referenced by another committed update.
6. The direct update paths should not be replaced by a broad generic RPC accepting arbitrary JSONB patches. Each operation should have a fixed, validated argument schema and a role/facility/status guard.

## 3. Proposed authorization design

### Phase A — preserve existing workflow while reducing privilege

- Keep the current SELECT/INSERT/UPDATE grants until the exact column grant design and all dependent code are verified.
- Do not revoke table-level UPDATE before equivalent column-level grants or RPC operations are available.
- Remove structural grants (`TRUNCATE`, `TRIGGER`, `REFERENCES`) only after the proposal migration has been validated in a schema-correct staging database.
- Review DELETE separately. No ordinary user deletion workflow was found in the referral UI paths reviewed; do not assume no external consumer exists.

### Phase B — operation-specific transactional endpoints

Prefer narrow operations such as:

- `acknowledge_referral(referral_id)`
- `record_patient_arrival(referral_id)`
- `start_referral_assessment(referral_id)`
- `save_referral_assessment(referral_id, validated clinical fields...)`
- `record_referral_admission(referral_id, validated admission fields...)`
- `discharge_referral(referral_id, validated discharge fields...)`
- `save_investigation_result(referral_id, validated result patch...)`

Each function must:
- derive actor identity from `auth.uid()`, never trust a client-supplied user ID;
- load the caller's canonical `profiles` row and verify role and active facility;
- lock the target referral row (`SELECT ... FOR UPDATE`) to serialize concurrent lifecycle writes;
- verify `receiving_facility_id` matches the caller facility for receiving operations;
- verify the exact expected prior status;
- validate each accepted field and reject unknown fields;
- update only the columns for that operation;
- write the existing referral history/audit events in the same transaction where applicable;
- return a minimal result, not unnecessary patient data;
- use a fixed safe `search_path` and explicit EXECUTE grants;
- have synthetic tests for cross-facility denial, wrong role, stale status, duplicate/concurrent calls and invalid payloads.

The final function names and schemas are candidates, not implementation commitments. Existing event triggers and notification hooks must be checked before replacing direct writes.

## 4. Unresolved product/clinical decisions

1. **PHC continuity:** should all PHC staff at the referring facility see the facility's referrals, or only the original referring user? This changes patient-data access and must be approved by the product owner and clinical governance.
2. **Admission semantics:** confirm whether admission is entered through assessment disposition and the separate inpatient handler only edits an admitted episode.
3. **Investigation authorship:** decide whether investigation results may be entered by any receiving staff member or only assigned clinical roles.
4. **Admin visibility:** define a least-privilege reporting model that provides aggregate intelligence without routine patient-level browsing.
5. **Attachment lifecycle:** specify retention, authorized download, orphan cleanup and audit requirements.

## 5. Verification required before any privilege change

- Inventory every `referrals` write in the repository, including API routes, Edge Functions, tests and scheduled jobs.
- Inventory all Storage upload/download/delete paths and bucket policies.
- Inspect column-level ACLs and default privileges, not only table-level grants.
- Build a schema-correct synthetic staging database; current staging project has no reconstructed application schema.
- Test every row and column permission using synthetic identities for PHC Facility A, PHC Facility C, Receiving Facility B, Receiving Facility D and administrator.
- Verify all old workflows still work after each permission change.
- Do not apply this matrix or any proposed change directly to production.

## 6. Current release status

This is a source-level authorization inventory, not a live authorization test. No patient data was queried, no code workflow was changed, and no production or staging database was modified. The structural ACL candidate remains proposal-only. The next safe implementation step is to verify the complete assessment update payload and storage object policies, then design fixed-schema RPCs and integration tests.
