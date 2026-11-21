# Requested release work — current evidence

Updated 21 November 2026. Production release is pending.

| Requested area | Actual status | Remaining requirement |
| --- | --- | --- |
| Hosted migration reconciliation | Two atomic migrations installed in synthetic staging; repository names match actual ledger; prior history retained; six structural checks pass | Full grant/index/default-privilege and managed-service reconciliation; production baseline remains separate |
| Authenticated clinical testing | Signed-in synthetic receiving and PHC handoff verified. Database role checks covered an unrelated facility, a banned account and a removed session. | Complete the remaining role matrix across protected operations, including attachments and privileged actions |
| Controlled corrections | Completed referrals support facility-authored addenda with the reason, proposed text, requester, independent reviewer and decision recorded separately from the original. Staging database checks passed for duplicate requests, self-review denial, unrelated facility denial, independent approval, decision replay and conflicting decisions. | Designate authorized reviewers, verify the signed-in review screens and approve the facility policy. Structured amendments to specific fields and downstream reporting require separate review. |
| Attachment reconciliation | Uncertain documents preserved; new atomic descriptors and legacy writer retirement installed in staging | Server-owned upload intents, authorized case-management/reconciliation UI and controlled resolution remain unimplemented |
| Workflow/design | Existing role screens, safer clinical saves, aggregate charts, connection notices, code splitting and limited Chromium/mobile checks | Explicit acceptance/rejection/escalation contracts, design-system consolidation, full accessibility and clinical workflow review |
| AI/interoperability | Traceable deterministic aggregate report drafts exist | They are not AI. Approved provider/configuration, institutional destinations, data contracts and validated FHIR/DHIS2 integration remain missing |
| Restore verification | Disposable pg_dump/pg_restore rehearsal passed with synthetic clinical row, audit, ledgers, selected grants and stub bucket metadata | Actual production backup, real Auth/files/encryption-key recovery, RPO/RTO and authorized operational restore rehearsal remain unverified |

The discharge-month report counts hospital feedback and PHC encounters independently. Synthetic PostgreSQL tests cover repeat contacts, month boundaries and disclosure thresholds. Chromium covers export suppression, interrupted report refresh, keyboard entry and sign-out navigation. Spoken screen-reader confirmation remains pending. See [clinical acceptance evidence](CLINICAL_PRODUCTION_ACCEPTANCE_GATE.md).

Production release requires the outstanding clinical and operational approvals, verified recovery and an authorized rollout.
