# REFLINK Durable Notification Outbox Design

**Status:** Architecture specification; no outbox table, worker, provider integration or production configuration has been deployed.

## Problem

The current referral submission and offline sync flows can commit a referral while an SMS request fails or its response is lost. A browser-side fetch is not a durable delivery mechanism and must not be treated as part of the referral transaction.

## Design goals

- Referral creation remains successful even when an SMS provider is unavailable.
- Each logical notification is enqueued once within the same database transaction as the referral event.
- Workers retry transient failures without duplicating provider messages where provider idempotency is supported.
- Clinical details and patient identifiers are not included in SMS content.
- Delivery state is auditable without exposing message content to broad roles.

## Proposed lifecycle

`pending -> processing -> sent`

Recoverable failure path:

`processing -> retry_wait -> processing`

Terminal path:

`retry_wait -> dead_letter`

A worker claims a bounded batch using row-level locking with `FOR UPDATE SKIP LOCKED`, assigns a lease/claim expiry, increments attempts and commits the claim before making the network request. Provider calls occur outside the database transaction. The worker records the provider message reference and outcome in a second short transaction.

## Proposed data model (not a migration)

- `id`: UUID primary key.
- `event_key`: unique idempotency key for the originating event and notification type.
- `event_type`: allowlisted event code, not free text.
- `recipient_ref`: reference to a protected recipient/contact record; do not duplicate phone numbers in broad reporting tables.
- `channel`: allowlisted channel such as SMS.
- `template_key`: versioned approved template identifier.
- `payload_minimal`: strictly validated non-clinical template variables only; encrypt or avoid where possible.
- `status`: constrained lifecycle value.
- `attempt_count`, `next_attempt_at`, `claimed_at`, `claim_token`.
- `provider_message_id`, `last_error_code`: provider reference and normalised error code only.
- `created_at`, `sent_at`, `expires_at`.

Restrict table access to a private schema or service-only role. Do not grant browser clients direct access to the outbox. If an RPC is required, it should enqueue a notification from a verified business event and must not accept arbitrary recipient or message body from the client.

## Retry and idempotency

- Unique `event_key` prevents duplicate enqueueing.
- Use bounded exponential backoff with jitter for transient network/provider errors.
- Do not retry permanent invalid-recipient or policy errors indefinitely.
- Respect provider rate limits and circuit-breaker state.
- Use provider idempotency keys when supported; otherwise document the residual duplicate-send window between provider acceptance and local acknowledgement.
- Expire stale notifications and dead-letter them for authorised operational review.
- Do not automatically retry sensitive notifications after the underlying referral has been cancelled or recipient eligibility changes; re-evaluate eligibility at dispatch.

## SMS content policy

SMS must not contain patient name, diagnosis, clinical narrative, phone number, referral number or other unnecessary identifiers. Use a neutral message directing the recipient to the authenticated REFLINK workflow. Confirm recipient consent/contact policy and local telecom requirements before sending.

## Security and operations

- Service credentials live only in server-side secret storage.
- Worker validates event state and recipient eligibility immediately before dispatch.
- No raw payload, phone number, access token or provider credential in logs.
- Operational metrics are aggregate counts: pending, sent, retrying, dead-lettered and delivery latency.
- Alert on queue age, dead-letter growth and provider outage.
- Define retention and deletion for notification metadata with the data protection officer.
- Protect against replay, forged events, tenant crossover and unauthorised manual resend.

## Acceptance tests

1. Referral and outbox event commit atomically or neither commits.
2. Duplicate event enqueue returns the existing event.
3. Two workers cannot claim the same live lease.
4. Expired worker lease can be reclaimed safely.
5. Provider timeout after acceptance is handled with idempotency or documented duplicate risk.
6. Permanent failures dead-letter; transient failures back off.
7. Cancelled referral or invalidated recipient is not dispatched.
8. Logs and SMS templates contain no clinical content or unnecessary identifiers.
9. Browser roles cannot read or mutate the outbox.
10. Provider outage does not block referral workflow.

## Rollout order

1. Approve event catalogue, recipient rules and SMS wording with clinical and privacy owners.
2. Design private-schema table, service role and enqueue transaction.
3. Implement worker with bounded claims, leases, retries and metrics.
4. Test using a sandbox SMS provider and synthetic recipients.
5. Run security review and failure-injection tests.
6. Pilot with opt-in facilities before wider rollout.

No outbox is currently implemented. The existing client-side SMS attempt remains best-effort until this architecture is delivered.
