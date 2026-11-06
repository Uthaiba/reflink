# REFLINK Durable Notification Outbox

**Status:** Source implementation committed for review only. The migration is not applied. No worker, provider credentials, templates, delivery schedule or live notification dispatch is configured.

## Scope of this stage

This stage establishes the database-side queue primitives required for reliable notifications. It deliberately does not send SMS or in-app messages and does not alter the referral acknowledgement targets (Emergency 15 minutes, Urgent 2 hours, Routine 24 hours).

## Architecture

- The queue and attempt ledger live in a non-exposed `private` schema.
- Browser roles (`anon` and `authenticated`) receive no schema, table or function access.
- Only the Supabase `service_role` can enqueue, claim and settle queue work.
- The queue stores event metadata and internal recipient/referral references only. It does not store phone numbers, message bodies, patient names, diagnoses, clinical narratives or arbitrary JSON payloads.
- Event types, channels and versioned template keys are allowlisted.
- A unique `event_key` makes enqueue idempotent. Reusing the key with different event metadata raises a conflict.
- Workers claim at most 50 rows per call with `FOR UPDATE SKIP LOCKED`. A five-minute lease prevents concurrent workers from processing the same live claim.
- Provider network calls must occur after the claim transaction has committed.
- The worker settles only with the matching claim token. Retry delay is bounded to 1–3,600 seconds; the queue dead-letters after eight attempts.
- Expired notifications are cancelled. A worker must independently re-check referral status, recipient role/facility assignment, contact eligibility and consent immediately before dispatch.
- The attempt ledger records claim and outcome metadata without raw provider responses.
- Expired, exhausted and reclaimed leases close their prior attempt-ledger rows before the queue item changes state.

## Database functions

The implementation functions reside in the non-exposed `private` schema. Because PostgREST cannot invoke functions in a schema that is not exposed, the migration also defines three thin `public` RPC wrappers. These wrappers are `SECURITY INVOKER`, pin an empty search path, delegate to the private functions, and revoke execution from `PUBLIC`, `anon` and `authenticated`; only `service_role` receives execute permission. A trusted server-side worker can therefore call the public wrappers through Supabase RPC without exposing the private tables or functions to browser roles.



| Function | Purpose |
|---|---|
| `private.enqueue_notification(...)` | Service-only idempotent event enqueue |
| `private.claim_notification_batch(batch_size)` | Bounded, leased work claim |
| `private.finish_notification_attempt(...)` | Lease-checked success/retry/dead-letter settlement |

All three functions are SECURITY INVOKER. They rely on explicit schema/table/function grants to `service_role`; no SECURITY DEFINER bypass is introduced.

## Not yet implemented

1. Atomic enqueue hooks from the referral lifecycle transaction. Until those are added, no referral event automatically enters the queue.
2. A scheduled Edge Function/worker and provider adapter.
3. Approved notification recipient rules, SMS wording, in-app templates, consent/contact validation and delivery policy.
4. Provider sandbox credentials, idempotency support and failure-injection tests.
5. Supervisor escalation policy and notification governance approval.
6. Operational dashboard for queue age, delivery latency, retries and dead-letter counts.

## Important delivery semantics

A successful provider acceptance is not proof that a recipient read or acted on a message. For SMS providers without idempotency support, a timeout after provider acceptance can still create a duplicate-send window. The worker must use provider idempotency where available and document residual risk otherwise.

The queue is not a clinical escalation decision engine. It must not automatically decline, redirect or close referrals. An acknowledgement reminder cannot replace direct clinical escalation for an emergency.

## Migration baseline verification blocker

A read-only inspection of the linked Supabase project confirmed that the live schema contains the required referral and profile columns, and that the existing acknowledgement-deadline trigger runs before referral insert/update. It also confirmed existing referral status-validation and audit triggers.

However, the Supabase migration ledger currently reports only version `20260928203447`. The repository branch contains subsequent remediation migrations `20261105000100` through `20261105000600`, plus this acknowledgement-hook migration. Those repository migrations are not recorded as applied in the linked project's ledger.

**Do not apply migration `20261105000600` or `20261106000100` independently yet.** First reconcile the migration history and verify which SQL changes are already represented in the live schema. Applying the branch migrations out of sequence could conflict with existing functions, triggers, grants or policies. This verification was read-only; no database schema or migration history was changed.

## Required staging tests before migration approval

- Verify the migration against the actual schema baseline and Supabase role grants.
- Confirm browser roles cannot resolve or execute any object in `private`.
- Confirm `service_role` can enqueue and claim synthetic events.
- Duplicate event key with identical metadata returns the same ID; mismatched metadata fails.
- Concurrent workers cannot claim the same live lease.
- Expired leases can be reclaimed; stale claim tokens cannot settle a newer lease.
- Retry delays are bounded; permanent failures and attempt eight dead-letter.
- Expired events cancel without dispatch.
- Attempt ledger and outbox contain no phone, message body, clinical content or raw provider response.
- Verify no provider call is made by the database functions.
- Verify referral creation remains independent of provider availability.

## Rollout order

1. Reconcile migration history and test this migration in a non-production database.
2. Approve event catalogue, recipient routing, consent/contact policy and templates with clinical/privacy owners.
3. Add transactional enqueue hooks to verified referral lifecycle events.
4. Implement a server-side worker and sandbox provider integration.
5. Run security, concurrency, retry, timeout and duplicate-send tests.
6. Pilot with explicitly opted-in facilities before any production activation.

No live notification has been sent by this change.

## 6 November 2026 source integration audit

A read-only review of the current feature branch confirms that a dispatch worker cannot yet be implemented safely against the present source contract:

- `api/referral-sms.js` is the only current server-side notification sender. It authenticates the caller with a Supabase access token, re-reads the actor profile and referral, authorizes by role/facility, and sends directly to the destination/source facility's `referral_notification_phone` using Twilio.
- `src/App.jsx` invokes that endpoint directly after referral workflow actions. This remains a best-effort client-triggered delivery path; it is not backed by an outbox claim and has no durable pre-send idempotency claim.
- The current outbox schema requires `recipient_user_id` for every event. The existing SMS workflow addresses a facility-level phone number, not an individual user. A worker must not map a facility phone to an arbitrary staff profile or choose one recipient without an approved routing rule.
- The inspected application source contains no established in-app notification persistence/read model that the proposed `in_app` channel can safely write to. The outbox's `in_app` label is therefore not yet a complete delivery implementation.
- The inspected `supabase/functions` tree has no notification worker. No scheduled worker or provider adapter is configured in the repository.

### Required design decisions before worker implementation

1. Define recipient identity explicitly. For facility-directed SMS, model a facility recipient separately from a user recipient (for example, a mutually exclusive recipient-user / recipient-facility contract with channel-specific constraints). Define how facility contact changes, opt-in/consent and delivery eligibility are handled.
2. Define the in-app notification store and read contract, including user visibility, read state, retention and RLS. Do not assume an existing `notifications` table.
3. Choose the server runtime and scheduling/authentication mechanism. The worker must use server-only credentials, reject unauthenticated invocations, bound its batch size and avoid logging PHI or secrets.
4. Add the transactional event producer and worker together in a reviewed sequence. Do not switch `api/referral-sms.js` or the client call sites to depend on the unapplied outbox migration.
5. Specify provider timeout semantics. Without provider-supported idempotency, a timeout after provider acceptance remains an at-least-once duplicate-send risk; a database claim token cannot prove whether Twilio accepted a timed-out request.

### Current implementation decision

**Worker implementation is blocked by the recipient-model and in-app-store decisions, in addition to the previously documented migration-baseline/staging blocker.** Keep the existing SMS endpoint unchanged. Do not add a referral-sent trigger, schedule a worker, send test SMS, apply migrations or alter production configuration until these contracts are approved and validated with synthetic data.
