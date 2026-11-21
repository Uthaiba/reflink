# Synthetic staging clinical preflight — 17 November 2026

Source inspected: `7918f29cfa09feba0177f7d1934b961c54476f36`.
Project: existing synthetic staging `rcskuzmvyugbanygizri`.
Method: hosted database-owner catalog queries inside explicit READ ONLY transactions.
Outcome: **BLOCKED — five structural checks failed.**

No migrations, grants, triggers, Auth settings, environment variables, files, clinical records or deployments were changed. Production was not queried in this inspection. No patient or account rows, secrets or file contents were read.

## Observed checks

| Check | Result | Evidence |
| --- | --- | --- |
| Clinical column contract | Pass | All required column types present |
| Clinical RPC security | Blocked | Expected clinical RPC absent |
| Clinical RPC grants | Blocked | Expected clinical RPC absent |
| Clinical direct-write guard | Blocked | Candidate trigger absent |
| Closed-record guard | Blocked | Candidate investigation guard absent |
| Private clinical ledger | Blocked | Candidate ledger absent |

A second catalog query confirmed that both `save_referral_clinical(uuid,text,jsonb,jsonb,uuid)` and `save_referral_investigation(uuid,jsonb,integer,jsonb,uuid)` are absent, as are `private.clinical_operations` and `private.investigation_operations`. These are expected undeployed-candidate findings, not evidence of a failed migration.

Existing referrals RLS is enabled. Authenticated UPDATE column privileges remain present for status, assessment findings, final diagnosis, admission time and discharge time. These grants alone neither establish an unauthorized exploit nor supply candidate transactional protection; effective RLS, triggers and authenticated calls still need review.

## Existing enabled referral triggers

All seven reported normal enablement (`O`).

| Trigger | Function | Security definer |
| --- | --- | --- |
| enqueue_referral_dashboard_notification | enqueue_referral_dashboard_notification | Yes |
| referral_ack_due_at_trigger | set_referral_ack_due_at | No |
| referral_counter_referral_guard | require_counter_referral_before_completion | No |
| referral_entry_validation_trigger | validate_referral_entry | No |
| referral_status_audit_trigger | log_referral_status_change | Yes |
| referral_status_transition_validation | validate_referral_status_transition | No |
| referrals_audit_mutation | audit_referral_mutation | Yes |

This inventory does not verify trigger bodies or runtime compatibility. Reconcile their definitions and side effects before migration rehearsal; synthetic fixture audit success is insufficient.

Catalog checks also confirmed diagnosis certainty values suspected/provisional/confirmed, dispositions admitted/discharged/referred_again/observation, and the documented legacy referral lifecycle statuses. No new acceptance/rejection state contract was observed or introduced.

## Next executable gate

1. Reconcile candidate source with current trigger definitions, RLS policies, function owners, storage policies and migration history. Preserve existing clinical data, facilities and accounts.
2. Generate and review versioned additive migrations in the established migration workflow. Do not apply the review-only SQL files blindly.
3. Rehearse those migrations only in the approved synthetic environment, with the flag-enabled frontend coordinated with the direct-write guards.
4. Re-run the read-only preflight, then execute the authenticated matrix in CLINICAL_STAGING_CHECKPOINT.md. Record real outcomes; a zero structural blocker count does not certify authorization or clinical safety.
5. Keep `VITE_ATOMIC_CLINICAL_SAVES_ENABLED` and `VITE_ATOMIC_INVESTIGATIONS_ENABLED` disabled until the relevant backend and authenticated rehearsal are verified.

Authenticated browser, RLS/Auth/Storage, concurrency-through-API, restoration and clinical approval gates remain pending. This report is evidence of staging inspection, not release approval.
