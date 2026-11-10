# REFLINK — Referral Application Write-Path Inventory

**Review date:** 10 November 2026  
**Source branch:** reflink/phase-1-security-remediation  
**Inspected file:** src/App.jsx  
**Source blob:** 0aaa4aeb9252007592b0abd260b4a90123bb66ce  
**Scope:** Static source inspection only; no application or database writes performed.

## Why this inventory exists

The live production catalog confirms that authenticated has table-level UPDATE on referrals. Before restricting that privilege or replacing direct updates with RPCs, every existing application write path must be mapped so the clinical workflow is preserved.

## Observed direct referrals writes in src/App.jsx

| Write path | Fields written | Existing client-side concurrency guard | Security/design implication |
|---|---|---|---|
| New referral insert | buildReferralCreatePayload output; destination, urgency and other intake fields | Uses authenticated user, profile role/facility, verified active destination, offline client ID and sync source as builder inputs | Inspect builder and DB trigger together; do not assume client-provided fields are authoritative |
| Post-insert investigation metadata | investigation_records with uploaded file metadata | Runs after insert, scoped by inserted referral ID | Separate follow-up update currently required after insert; a single transaction or dedicated safe operation may be needed |
| Investigation file upload | investigation_records JSON array with result file path/name/type/size | Updates by referral ID; serial queue used for result-change writes | Current direct JSONB writes must be mapped to intended actor and lifecycle before any column grant is removed |
| Investigation result change | investigation_records JSON array | Serialises full-array writes to avoid rapid edits completing out of order | Full-array replacement has lost-update risk across separate tabs/devices unless server-side concurrency/versioning is added |
| Inpatient admission | admission_at, ward_unit, admission_diagnosis, clinical_progress, inpatient_treatment, status=admitted | Filters by referral ID and current status=admitted; expects one returned row | Current filter appears inconsistent with an admission transition from an earlier state; inspect UI flow before changing or correcting |
| Discharge | discharge_diagnosis, condition_at_discharge, discharge_medications, follow_up_plan, discharged_at, status=discharged | Filters by referral ID and status=admitted; expects one returned row | Receiving-facility clinical response fields and status change must be handled atomically |
| Acknowledge | status=acknowledged, acknowledged_at | Filters by ID and status=sent; expects one returned row | Can be moved to a narrow transition operation after exact role and trigger validation |
| Patient arrival | status=patient_arrived, patient_arrived_at | Filters by ID and status=acknowledged; expects one returned row | Can be moved to a narrow transition operation after exact role and trigger validation |
| Start assessment | status=under_assessment | Filters by ID and status=patient_arrived; expects one returned row | Can be moved to a narrow transition operation after exact role and trigger validation |
| Complete clinical assessment | assessment_findings, final_diagnosis, diagnosis_category, diagnosis_status, treatment_provided, procedures_performed, clinical_feedback, disposition, assessment_completed_at, status; conditionally discharge or admission fields | Filters by ID and status=under_assessment; expects one returned row | Must preserve the existing clinical assessment form and branch-specific fields in the new permission boundary |

## Other inspected operations

- Referral print logging uses the log_referral_print RPC.
- Referral read logging uses the log_referral_read RPC.
- Facility/profile reads are performed from the existing Supabase client.
- AdminDashboard.jsx writes facility and profile changes directly; it also calls aggregate reporting RPCs including get_admin_referral_volume, get_admin_facility_referral_summary, get_admin_lga_referral_summary, get_admin_facility_reporting_coverage, get_admin_referral_pathway_summary and get_admin_acknowledgement_delay_alerts.
- Offline queue integration in App.jsx uses encrypted queue APIs and the account-scoped vault flow; offline queue storage and sync must be tested alongside any change to referral insert privileges.

## Important unresolved observations

1. The App.jsx source contains direct updates to referrals for investigation JSON, receiving-facility assessment, admission, discharge, acknowledgement, patient arrival and assessment transitions. A blanket revocation of authenticated UPDATE would break these paths unless each is migrated or granted a narrowly justified field set.
2. Investigation records are stored as JSONB in referrals. They mix investigation metadata and result-document references. Their intended editor role and post-submission edit window must be approved before assigning column privileges.
3. The admission handler filters for status=admitted while writing status=admitted. This may be intended for updating an already admitted inpatient record, but the handler name and validation context should be checked against the actual UI before changing it.
4. The current code uses direct status updates for acknowledgement, arrival and assessment start. Those operations should be assessed for narrow transactional RPC migration, but no RPC should be created until function ACLs, ownership, SECURITY INVOKER/DEFINER behavior, and lifecycle trigger interactions are reviewed.
5. The source excerpt around referral insertion includes an error console call. The exact payload and error contents must be assessed to ensure no patient-identifying or clinical data is logged. Do not log referral payloads or raw patient data.
6. The App.jsx file is large (9,021 lines). This inventory is not a complete repository audit. Other components, helpers, Edge Functions, Storage policies, API routes and test fixtures still need inspection.

## Next inspection targets

1. src/lib/referralCreation.js — exact allowlisted insert payload, normalization and server/client trust boundary.
2. All components and helpers that read/write referrals, counter_referrals, referral_feedback, referral_updates, referral_events, referral_notifications, referral_print_events and audit_log.
3. Storage bucket policies and upload/download call sites for referral-investigation-results.
4. All SQL migration proposals and current trigger function definitions.
5. All SECURITY DEFINER function definitions, ownership, search_path and EXECUTE grants, preserving dependencies such as is_administrator().
6. Role-specific component mounting and authorization checks; client-side visibility is not a substitute for database enforcement.
7. Tests that assert existing referral state transitions, offline retries, idempotency and investigation result persistence.

## Decision

Do not apply a blanket UPDATE revocation or a broad replacement RPC. First complete the write-path and clinical field matrix, then stage a narrowly scoped permission change with tests for every existing workflow. Production remains unchanged.