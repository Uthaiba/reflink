# REFLINK Notification Recipient and Delivery Contract

**Status:** Source-only proposal for review. No schema, application, provider or production configuration is changed by this document.

## 1. Why this contract is needed

The existing notification workflow and proposed outbox have different recipient models:

- `api/referral-sms.js` authorizes a user by role and facility, then sends SMS to a facility's `referral_notification_phone`.
- For `referral_sent`, the destination is the receiving facility.
- For `referral_acknowledged`, the destination is the referring facility.
- Routine referral-sent SMS is skipped by the current endpoint.
- The current outbox requires `recipient_user_id` for every channel.
- The inspected React source has no confirmed in-app inbox, read-state workflow or persistence contract.
- The repository has no confirmed notification worker or scheduled dispatcher.

A facility phone must never be represented by an arbitrary staff user's `recipient_user_id`. The current endpoint remains unchanged until a reviewed replacement is ready.

## 2. Proposed recipient identity

The future outbox should distinguish recipient kind explicitly:

| Field | Purpose | Constraint |
|---|---|---|
| `recipient_kind` | `user` or `facility` | Required, allowlisted |
| `recipient_user_id` | User recipient | Set only for `user` |
| `recipient_facility_id` | Facility recipient | Set only for `facility` |
| `channel` | `in_app` or `sms` | Required, allowlisted |
| `event_key` | Stable idempotency identity | Unique |
| `event_type` | Business event | Allowlisted |
| `referral_id` | Related referral | Internal reference |
| `template_key` | Versioned template | Allowlisted |

A database constraint must enforce exactly one recipient reference. Proposed channel rules:
- In-app notifications are user-addressed.
- SMS may be facility-addressed only where a designated facility contact, eligibility and consent basis are approved.
- User-addressed SMS is out of scope until phone verification, consent and user preference rules are separately defined.

Facility SMS idempotency should identify the business event, referral and destination facility. Resolve the currently approved facility contact at dispatch time; do not store phone numbers in the outbox.

## 3. In-app inbox contract

Do not use the outbox as the user-facing inbox. A separate user-visible notification record is required, conceptually containing:
- opaque notification ID;
- recipient user ID;
- event type and approved template key;
- referral reference;
- created, read and optional expiry timestamps;
- minimal delivery state.

It must not duplicate patient names, identifiers, diagnoses, clinical narratives, phone numbers or message bodies. RLS must restrict list/read/update operations to the notification owner. A notification must not bypass the existing role/facility authorization used to retrieve referral details. The read-state update must be recipient-scoped and idempotent.

No existing inbox table or read-state model was confirmed in the inspected application source. Retention/deletion rules require privacy and clinical governance approval.

## 4. Event routing proposal

| Event | In-app recipient | SMS recipient | Decision |
|---|---|---|---|
| Emergency/urgent referral sent | Eligible receiving-facility users | Receiving facility contact | Existing direct SMS; not outbox-backed |
| Routine referral sent | Eligible receiving-facility users | None under current policy | Current endpoint skips SMS |
| Referral acknowledged | Eligible referring-facility users | Referring facility contact | Existing direct SMS; not outbox-backed |
| Acknowledgement deadline due | Receiving staff assigned to destination | None unless approved | Source-only outbox hook |
| Arrival, assessment, counter-referral | Not yet defined | Not yet defined | Do not enqueue |

Do not broadcast to every profile at a facility by default. Define eligible roles, active membership, on-call responsibility, and reassignment/removal behavior. Current schema evidence does not establish a `profiles.is_active` field; do not assume it exists.

## 5. Dispatch authorization

Immediately before dispatch, the worker must re-check:
1. Referral exists and event remains relevant to its current status.
2. User recipient still has the required role/facility assignment, or facility recipient remains eligible.
3. Facility contact endpoint is valid and the consent/opt-in basis is satisfied.
4. Event is not expired, cancelled or already completed.
5. Channel and template are approved for the event and urgency.

Resolve facility contact details from the authoritative facility record at dispatch time. Never log phone numbers, access tokens, patient identifiers, clinical details, message bodies or raw provider payloads. SMS content should be generic, with no patient identifier or clinical detail, and direct authorized staff to sign in to REFLINK.

## 6. Delivery guarantees

The outbox provides durable claiming and stale-claim fencing; it does not guarantee exactly-once provider delivery.

- Treat delivery as at-least-once unless a documented provider idempotency mechanism is supported and tested for the exact API operation.
- A timeout after provider acceptance but before recording success can still produce a duplicate on retry.
- Provider calls occur outside database transactions.
- Settlement requires the exact outbox ID and claim token.
- Use bounded retries, classified error codes and dead-letter handling.
- Provider acceptance is not proof of handset delivery, reading or clinical action.

## 7. Worker requirements

The worker must run in a trusted server environment with server-only Supabase and provider credentials. It must authenticate scheduled invocations, reject browser callers, cap batch size/runtime, use token-fenced leases, avoid PHI in logs, and expose queue-age/retry/dead-letter metrics without patient data.

No worker or schedule is currently confirmed in the repository. Do not add production scheduling or credentials during this source-only design phase.

## 8. Acceptance tests

### Recipient integrity
- User recipient has exactly one user ID; facility recipient has exactly one facility ID.
- Invalid recipient combinations and channel mismatches are rejected.
- Facility SMS is never routed through an arbitrary staff profile.
- Staff reassignment/removal invalidates pending user-targeted notifications.

### In-app ownership
- User A cannot list, read, mark-read or infer User B's notification.
- Notifications do not bypass referral authorization.
- Read-state updates are recipient-scoped and idempotent.
- Retention and expiry are tested with synthetic records.

### Dispatch resilience
- Stale, cancelled, expired or ineligible events are not sent.
- Duplicate event creation resolves to one logical notification.
- Concurrent workers cannot hold the same live claim.
- Stale tokens cannot settle newer attempts.
- Timeout-after-provider-acceptance is simulated and duplicate risk documented.
- No PHI, phone number, message body, credential or raw provider response appears in outbox or logs.

### Governance
- Migration baseline reconciled; separate synthetic-data staging environment available.
- Roles, grants, RLS and triggers tested in staging.
- Facility contact consent and templates approved.
- Clinical, privacy and security owners approve routing and escalation boundaries.
- Referral workflows remain functional if notification delivery is unavailable.

## 9. Current decision

**Design proposal only; implementation remains blocked.** The current SMS endpoint remains unchanged. Do not alter the outbox schema, add event triggers, implement a worker, send provider messages, apply migrations or modify production settings until recipient policy, inbox ownership, migration baseline and staging validation are approved.

This notification system is workflow communication, not a clinical decision engine. It must not automatically decline, redirect or close referrals, and it cannot replace direct clinician-to-clinician escalation for emergencies.

## Inbox schema and access detail

The separate inbox relation, owner-only RLS, restricted read-state operation and recipient-eligibility audit are specified in [NOTIFICATION_INBOX_SCHEMA_AND_ACCESS_DESIGN.md](./NOTIFICATION_INBOX_SCHEMA_AND_ACCESS_DESIGN.md).


## Recipient eligibility decision — 6 November 2026

The current profile fields do not establish active/on-call or notification-duty eligibility. **Do not infer a recipient from role plus facility, and do not broadcast to every receiving-staff profile.** The default is no automatic user recipient until an authoritative approved roster/notification-duty assignment source and lifecycle rule are identified. Referral create/acknowledge operations must continue when no recipient is eligible. This decision supersedes the generic “eligible receiving-facility users” wording above until the resolver is approved.

See [NOTIFICATION_RECIPIENT_ELIGIBILITY.md](./NOTIFICATION_RECIPIENT_ELIGIBILITY.md) for the explicit assignment contract, rejected shortcuts, reassignment and dispatch rules, and synthetic-data acceptance tests.
