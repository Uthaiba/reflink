# REFLINK Clinical Governance Decision: Referral Decline / Redirection

## Status
Design specification only. Do not add a `rejected` status or enable a decline button until the clinical owner approves the definitions, permissions, escalation rules and audit requirements.

## Why this needs clinical approval
A receiving facility may lack a service, bed, staff member, equipment, blood supply or safe capacity. A generic "reject" action can falsely imply that the patient is no longer the responsibility of the referring facility, delay emergency care, or leave the patient without a receiving destination.

## Proposed terminology
Use **Declined by receiving facility** rather than "Rejected" if the receiving facility cannot accept the referral. Keep **Redirected** distinct where the receiving facility actively helps identify another suitable destination.

## Minimum clinical and operational requirements
1. Only an authenticated receiving-facility user assigned to the referral's receiving facility may record a decline.
2. Require a structured reason, with a controlled list approved by clinical governance and a short explanatory note.
3. Record actor, facility, server timestamp, previous status, new status and reason in an append-only audit event.
4. Preserve the original referral and its clinical information; never delete or overwrite the referral to hide the decision.
5. Require a documented safe disposition: referring facility informed, alternative receiving facility identified where possible, and transport/clinical escalation plan recorded.
6. Emergency referrals must not be silently closed or returned to a generic queue. Require an explicit escalation path and confirmation that the referring team has received the response.
7. The referring facility must acknowledge receipt of the decline/redirection message. Until then, display a high-priority unresolved state.
8. Define who can reverse an erroneous decline and how the reversal is audited.
9. Report decline reasons only as de-identified aggregates with small-cell suppression.
10. Establish downtime procedures for failed connectivity and SMS delivery.

## Proposed state model for review
- `sent` -> `declined` only when a receiving facility makes a decision before acceptance.
- `acknowledged` -> `declined` only if clinical governance approves post-acknowledgement decline and a mandatory handover/escalation workflow exists.
- `declined` -> `redirected` only after a new destination and responsible handover are documented.
- `declined` -> `sent` only through an audited resubmission/reassignment action, not a silent status edit.
- No decline action is permitted after patient arrival or while under assessment/admitted without a separate transfer-of-care process.

This is a proposal for clinical review, not an implemented or approved workflow.

## Required sign-off
- Clinical lead / receiving-facility representative
- PHC/referring-facility representative
- Patient safety / quality officer
- REFLINK product owner
- Data protection / information governance lead
