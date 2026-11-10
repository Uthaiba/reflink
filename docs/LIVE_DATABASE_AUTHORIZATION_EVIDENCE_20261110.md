# REFLINK — Live Database Authorization Evidence, 10 November 2026

## Scope and safety

Read-only catalog inspection of the connected production project Reflink (project ref uwwzbljufqbzkjflpnll). No patient/referral row contents were queried or changed. Table row counts were returned as metadata by the schema-inspection API. The separate reflink-synthetic-staging project (ref rcskuzmvyugbanygizri) is active but currently has no public application tables and no migration history.

## 1. Referral policies verified from pg_policies

| Policy | Operation | Actual predicate | Finding |
|---|---|---|---|
| PHC staff can create referrals | INSERT | referring_user_id = auth.uid(); matching profile must be phc_staff at referring_facility_id | Does not itself verify receiving facility active or force system-controlled initial fields |
| PHC staff can view their referrals | SELECT | referring_user_id = auth.uid() | Originator-scoped |
| Receiving facilities can view assigned referrals | SELECT | receiving_facility_id equals current profile facility_id | Missing explicit receiving_staff role check |
| Receiving staff can update assigned referrals | UPDATE | receiving_facility_id equals current profile facility_id for a profile whose role is receiving_staff, in USING and WITH CHECK | Row scope exists, but it does not constrain changed columns |

These are the exact policy predicates observed in the live catalog. This is not a proposed policy migration.

## 2. Table-level privileges verified

The effective privilege check using has_table_privilege() confirms that 12 of the 14 public tables have at least one of the listed privileges, but the privilege set differs by table:

- Eleven tables — counter_referrals, diagnosis_categories, facilities, feedback, profiles, referral_drafts, referral_notifications, referral_print_events, referral_updates, referrals and users — grant authenticated all seven privileges: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE and UPDATE.
- audit_log grants authenticated SELECT, REFERENCES, TRIGGER and TRUNCATE, but not DELETE, INSERT or UPDATE.
- referral_events and referral_feedback grant authenticated none of those seven privileges.

This effective check resolves the earlier aggregate-grant query ambiguity. It is based on has_table_privilege() and includes effective/inherited privileges.

Critical interpretation: RLS does not protect against TRUNCATE. Broad table-level DELETE and UPDATE grants also materially expand the impact of a policy mistake. Do not revoke privileges until all application paths, function ownership, service-role usage and migration dependencies are mapped.

## 3. Referral trigger state verified

Six enabled, non-internal triggers are attached directly to public.referrals:

1. referral_ack_due_at_trigger — BEFORE INSERT OR UPDATE OF urgency, created_at; set_referral_ack_due_at().
2. referral_counter_referral_guard — BEFORE UPDATE OF status; require_counter_referral_before_completion().
3. referral_entry_validation_trigger — BEFORE INSERT OR UPDATE; validate_referral_entry().
4. referral_status_audit_trigger — AFTER UPDATE OF status; log_referral_status_change().
5. referral_status_transition_validation — BEFORE UPDATE OF status; validate_referral_status_transition().
6. referrals_audit_mutation — AFTER INSERT OR DELETE OR UPDATE; audit_referral_mutation().

The complete public catalog contains nine enabled triggers across four tables: the six above plus counter_referrals_audit_mutation on counter_referrals, guard_profile_security_fields on profiles, and referral_draft_updated_at on referral_drafts. The supplied schema export contained no CREATE TRIGGER statements; the separately captured trigger snapshot is therefore essential to a faithful reconstruction.

## 4. Additional policy observations

- counter_referrals SELECT permits is_administrator() OR referral participation based on referrer identity or matching receiving facility; the facility branch does not explicitly test receiving_staff.
- counter_referrals INSERT checks receiving_user_id = auth.uid(), role = receiving_staff and that the user's facility matches the referral destination.
- referral_notifications SELECT includes administrator access via is_administrator() and a participant rule based on referrer identity or receiving-facility match; the latter does not explicitly test receiving_staff.
- referral_updates SELECT uses referrer identity or receiving-facility match without an explicit receiving_staff role check.
- referral_print_events SELECT permits is_administrator() or referral participant visibility; administrator visibility here is to print-history metadata, not direct referrals-table SELECT.
- audit_log SELECT is protected by is_administrator(). The administrator helper dependency must be preserved until all dependent policies and functions are migrated and tested.

These indirect related-table policies mean that 'administrators have no patient-level referral access' must not be overgeneralised. The direct referrals SELECT policy does not include administrator access, but related tables have separate administrator and facility-participant policies that need their own field-by-field review.

## 5. Referral schema and clinical field groups

The live referrals table includes identity and provenance fields (id, referral_number, referring_user_id, referring_facility_id, receiving_facility_id, created_at, offline_client_id, sync_source), patient identifiers and demographics, PHC clinical information, receiving-facility assessment and treatment fields, admission/discharge/follow-up fields, workflow status and timestamps, diagnosis/investigation JSON fields, urgency, and is_test.

The actual column list includes patient_identifier, patient_phone, patient_address, relative_name, relative_relationship and relative_phone. These are sensitive personal data and should not be exposed through aggregate analytics or broad operational projections.

Do not issue column-level grants until frontend insert/update payloads and RPC call sites are inspected. The role_table_grants query confirms table-level UPDATE for authenticated; the column_privileges query alone cannot be treated as proof that those broad table privileges are absent.

## 6. Staging baseline state

Production has one recorded migration: 20260928203447_reflink_v2_rural_first. The isolated staging project is active and has no public tables and no migrations. It is not yet a reconstructed test environment. Do not apply the supplied schema export alone: it omits trigger attachments and does not fully represent production default ACLs or managed services.

## 7. Required next actions, in order

1. Obtain the exact current source branch tree and inspect App.jsx, role workspaces, referral forms, offline queue, referral data-access helpers, counter-referral submission, notification adapters and tests. Map every insert/update/delete call to its payload and actor.
2. Reconcile the complete table ACLs using pg_class.relacl/aclexplode, including inherited grants and default ACLs, for all public tables. The first aggregate grant query did not return all 14 table names, so do not assume coverage.
3. Inspect every policy on referrals, counter_referrals, referral_notifications, referral_updates, referral_print_events, profiles and audit_log, including all policy combinations and helper-function dependencies.
4. Review the nine trigger function definitions, owners, search_path, execution grants and dependencies. Confirm the six referral triggers' ordering and behavior.
5. Produce a clinical/product-approved field-level permission matrix for PHC and receiving staff. Distinguish PHC-originated clinical data from receiving-facility response and immutable provenance.
6. Reconstruct a complete least-privilege synthetic staging baseline with all 14 tables, functions, policies, indexes, constraints, nine trigger attachments and an explicitly selected ACL target. Never copy production patient/auth rows.
7. Run PostgreSQL integration tests using synthetic PHC, receiving, wrong-facility and administrator identities. Include attempts to update protected columns, delete/truncate, exploit related-table policies, and invoke privileged functions.
8. Only after passing tests, prepare a reversible migration and matching application changes on the remediation branch. Keep production unchanged until approval and release gates are satisfied.

## Release status

Authorization hardening remains blocked pending source-call-site reconciliation and synthetic staging reconstruction. This report records evidence only. No production or staging schema, policies, grants, triggers, Auth settings, patient records or deployments were changed.