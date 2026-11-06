# REFLINK Notification Recipient Eligibility Decision

**Status:** Fail-closed decision for source development. Facility-wide recipient fan-out is not approved. No recipient roster, inbox table, database policy or production configuration is created by this document.

## 1. Decision

REFLINK must not infer notification eligibility solely from a profile having `role = 'receiving_staff'` and `facility_id = <destination facility>`.

The verified profile contract currently establishes `profiles.id`, `profiles.role` and `profiles.facility_id`. It does not establish active membership, shift/on-call status, notification duty, user preference, or a verified notification contact. A profile's existence is therefore insufficient evidence that the person is currently responsible for acknowledging referrals.

**Default behavior: no automatic user recipient is selected until an approved assignment/roster source and eligibility rule are available.** Do not broadcast to all receiving-staff profiles, select the first profile, or fall back to an arbitrary facility user. Referral creation and acknowledgement must continue normally when no notification recipient can be resolved.

This is a safe implementation boundary, not a claim that no current staff member is responsible for a referral.

## 2. Target recipient model

The preferred target is an authoritative facility-level notification-duty assignment or existing on-call/receiving roster approved by the facility and clinical governance owners. It must identify an individual user and the facility for which that person is currently eligible to receive the specific workflow notice.

The source must be authoritative and server-side. A future resolver should verify, at enqueue time:

1. The referral's destination facility is present and matches the assignment's facility.
2. The assigned account maps to a valid REFLINK user identity.
3. The assignment is active for the event time (`starts_at <= event_time` and `ends_at` is null or later than the event time).
4. The assignment explicitly includes responsibility for referral acknowledgement notifications.
5. The assigned account retains the approved receiving-staff role and facility relationship.
6. Duplicate user IDs are collapsed before creating one notification per `(recipient_user_id, event_key)`.

A dedicated assignment/roster table is only a candidate design if no approved roster already exists. Its schema, ownership, write authority, audit trail and lifecycle must be reviewed before a migration is proposed. Do not add assumed fields such as `profiles.is_active`, `profiles.is_on_call` or notification preferences to application queries.

## 3. Event and assignment lifecycle

- **No eligible assignment:** do not create a user-addressed inbox or outbox item. Do not guess a recipient. Do not block or roll back the referral workflow.
- **One or more eligible assignments:** notify only the explicitly assigned users, subject to the final approved fan-out limit and event policy.
- **Assignment revoked or moved:** cancel pending work for the removed assignment. A worker must revalidate the assignment immediately before dispatch.
- **New assignment:** do not automatically backfill every historically overdue referral to the new user. Backfill rules require a separate clinical/operational decision to avoid duplicate or misleading alerts.
- **Referral acknowledged, closed, redirected or destination changed:** invalidate outstanding reminder work for the prior workflow state and destination.
- **No eligible user at dispatch:** cancel or dead-letter the item with a metadata-only reason; do not route to a different staff member or facility phone by inference.

A notification is a workflow prompt, not proof that a clinician has accepted responsibility or that an emergency escalation has occurred.

## 4. Explicitly rejected shortcuts

- Broadcasting to every `receiving_staff` profile at a facility without approval.
- Picking the first row returned by a profile query.
- Treating account existence or a facility assignment as proof of active shift/on-call responsibility.
- Sending an individual user's notification to a facility phone number, or representing a facility SMS destination using an arbitrary user's ID.
- Backfilling old due referrals to every newly created or reassigned staff profile.
- Allowing browser-supplied recipient IDs to determine notification ownership.

If facility-wide broadcasting is ever proposed, it requires explicit written approval from the product owner, receiving-facility leadership and clinical governance, including a documented purpose, fan-out cap, duplicate policy and reassignment behavior. It is not the default.

## 5. Required acceptance tests

Once the authoritative assignment source is identified, synthetic-data PostgreSQL/Supabase tests must cover:

- unassigned, revoked, future-dated and expired assignments;
- wrong facility, wrong role and missing user identity;
- one eligible user and multiple explicitly eligible users;
- duplicate assignment rows and event retries;
- assignment removal or facility transfer while a notification is pending or leased;
- recipient reassignment without unintended historical backfill;
- no eligible recipient, with the referral workflow remaining successful;
- dispatch-time revalidation and stale-claim fencing;
- no PHI, phone numbers or provider payloads in recipient/outbox records or logs.

Static tests can protect source contracts but cannot establish database trigger behavior, assignment correctness, RLS or transactional guarantees.

## 6. Approval required before enabling recipients

The following are unresolved and must be recorded before implementation:

- Which existing roster/assignment source is authoritative, or whether a new facility notification-duty assignment is required.
- Who may create, change, suspend and audit assignments.
- Whether one designated user, an on-call roster, or a bounded group is eligible for each event.
- How shift boundaries, leave, reassignment and facility closure are represented.
- Whether due reminders are created only for assignments active at the event time or also for later assignments.
- Notification retention, preferences and escalation ownership.

Required reviewers: product owner, receiving-facility operational leadership, clinical governance, privacy/security and database owner.

## 7. Current source status

The proposed acknowledgement trigger in `20261106000100_referral_acknowledgement_notification_hooks.sql` still contains broad `receiving_staff` fan-out and must remain unapplied. It is not approved for staging or production execution. The migration baseline and synthetic-data staging environment are separate mandatory release gates; this policy decision does not waive them.
