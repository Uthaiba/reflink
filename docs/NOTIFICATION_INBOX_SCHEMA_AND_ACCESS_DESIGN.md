# REFLINK In-App Notification Inbox — Schema and Access Design

**Status:** Source-only architecture proposal. No migration, RLS policy, database function, application integration, or production configuration is changed by this document.

## 1. Decision and scope

The in-app notification centre requires a durable, user-owned inbox record. The private delivery outbox is not itself a browser-readable inbox: it tracks dispatch state, leases and attempts, while the UI needs a minimal notification record with read state.

Keep these responsibilities separate:

- **Notification outbox:** trusted server-side delivery work and attempt lifecycle. It remains private and unavailable to browser roles.
- **Notification inbox:** minimal user-facing workflow notice, readable only by its intended recipient.
- **Referral record:** authoritative clinical/workflow record. Opening a notification must re-run the existing referral authorization path; a notification reference is not permission to read a referral.

This document does not authorize implementation against production. The repository's migration baseline and a synthetic-data non-production environment remain mandatory prerequisites.

## 2. Proposed inbox record

Candidate relation: `public.notification_inbox` (subject to baseline/schema review).

| Column | Type | Requirement |
|---|---|---|
| `id` | uuid | Primary key; opaque identifier |
| `recipient_user_id` | uuid | Required owner identity; references the authoritative profile/auth identity after FK target is verified |
| `event_key` | text | Required stable deduplication key, unique per recipient |
| `event_type` | text | Allowlisted workflow event |
| `template_key` | text | Allowlisted, versioned presentation key |
| `referral_id` | uuid | Nullable internal referral reference; FK target and deletion behavior require baseline review |
| `created_at` | timestamptz | Server-generated, immutable |
| `read_at` | timestamptz | Nullable; changed only by the recipient's mark-read operation |
| `expires_at` | timestamptz | Nullable; no default retention period until governance approves one |

Recommended uniqueness: `(recipient_user_id, event_key)`.

Recommended query index: `(recipient_user_id, created_at DESC, id DESC)`; unread filtering may justify a partial index on `(recipient_user_id, created_at DESC)` where `read_at IS NULL` after query-plan validation.

Do not store patient names, MRNs, dates of birth, diagnoses, clinical narratives, phone numbers, message bodies, provider payloads, access tokens, or arbitrary JSON. The event and template allowlists must map to generic text in the UI. Unknown event types must render a safe generic fallback.

No retention or expiry interval is selected here. Clinical, privacy and records-management owners must approve retention, deletion, legal hold and backup behavior before schema implementation.

## 3. Row-level and column-level access

The following is a policy design, not executable migration SQL.

### SELECT

- Enable RLS on the exposed inbox relation.
- Grant `SELECT` to `authenticated` only; do not grant to `anon`.
- The only row predicate is ownership: `recipient_user_id = (select auth.uid())`.
- Do not trust a recipient ID supplied by the browser as authorization. A client-side owner filter is useful query narrowing, but RLS is the security boundary.
- Do not add administrator, facility-wide or support-role read policies. No broad inbox browsing is required for the current notification-centre scope.

### Mark read

Preferred interface: a narrow `SECURITY INVOKER` RPC such as `public.mark_notification_read(notification_id)`, with a fixed empty `search_path`, fully qualified relation names, and execute permission granted only to `authenticated`.

The function should update only the row matching both the supplied opaque ID and `auth.uid()`, set `read_at` using database time only when it is currently null, and return a non-enumerating result for missing, foreign-owned or already-read rows. It must not return notification content.

The invoker needs only the minimum underlying `UPDATE(read_at)` and `SELECT` privileges. RLS must include an owner SELECT policy and an UPDATE policy with matching owner predicates in both `USING` and `WITH CHECK`. Do not grant browser INSERT or DELETE. Do not allow the client to change owner, event, referral, creation or expiry fields.

An alternative direct column-limited update may be considered only if the exact PostgREST behavior, grants and RLS are integration-tested. Do not expose a broad row UPDATE grant.

### Producer

The trusted referral lifecycle producer must create the inbox record transactionally with the relevant event. It must derive recipient identity from verified server-side profile/facility assignment data, never from arbitrary browser-supplied IDs.

If an internal trigger requires elevated rights to insert into the inbox, its privileged function must be narrowly scoped, non-exposed where possible, use an empty `search_path`, schema-qualify all references, have explicit owner/ACL review, and have execution revoked from browser roles. Do not add a general-purpose SECURITY DEFINER API.

## 4. Recipient eligibility is not yet approved

The current acknowledgement-hook migration selects **every** `public.profiles` row with `role = 'receiving_staff'` and `facility_id = receiving_facility_id`. The recipient contract separately says not to broadcast to every profile by default and requires approved active membership, on-call responsibility, role eligibility and reassignment behavior.

The schema evidence currently available confirms `profiles.id`, `role` and `facility_id`; it does not demonstrate `profiles.is_active`, an on-call roster, shift assignment or notification preferences. Do not invent these columns or infer eligibility from a profile's existence.

Before the acknowledgement hook is approved, the product/clinical owners must choose one explicit rule:
1. all currently assigned receiving-staff profiles are intentionally eligible, with that broad fan-out documented and approved; or
2. a verified active-membership/on-call/assignment source is identified and recipient selection is constrained to it.

Until this decision is made, the existing hook is a source proposal only and must not be applied.

## 5. Relationship to the outbox

The current proposed outbox has `recipient_user_id NOT NULL` for both `in_app` and `sms`, while the existing SMS endpoint addresses a facility phone number. The recipient-model contract already identifies this mismatch. Do not use an arbitrary staff ID to represent a facility SMS destination.

For in-app delivery, the eventual event producer should atomically create the user inbox record and, if an outbox audit/work item is still needed, its corresponding outbox record in the same transaction. A worker must not be required merely to make a notification visible in the inbox. The exact producer/outbox relationship and event-key contract must be settled before implementation.

Facility SMS requires a separately approved facility-recipient model, contact resolution, consent basis and dispatch eligibility. It must not be conflated with inbox ownership.

## 6. Application data-access contract

A future adapter should accept the already-authenticated Supabase client and expose only:

- `listMyNotifications({ limit, before })`: fetch minimal columns, newest first, cursor-paginated; optionally return unread count from the same owner-scoped query.
- `markMyNotificationRead(notificationId)`: invoke the narrow mark-read operation.
- No client-side insert, delete, recipient reassignment, event mutation or direct outbox access.

The adapter may call `auth.getUser()` to fail closed when there is no verified user and may include `recipient_user_id = user.id` as an additional query filter. That filter is defense in depth only; RLS remains mandatory.

The UI's `onOpenReferral` callback must route through the existing referral loader and its current authorization checks. Never fetch referral details solely because an inbox row contains a `referral_id`.

Do not wire the current isolated `NotificationCenter` into `App.jsx` until the inbox table, RLS, mark-read operation and authenticated adapter have passed synthetic-account integration tests.

## 7. Required security and behavior tests

- User A can list only A's records; User B cannot list, infer, mark read or alter A's records.
- Anonymous requests cannot read or mutate inbox rows.
- Authenticated users cannot INSERT, DELETE or change immutable columns.
- The mark-read operation is owner-scoped, idempotent and does not reveal whether a foreign notification ID exists.
- Recipient IDs cannot be reassigned by a client update.
- Duplicate event creation produces one inbox record per recipient/event key.
- A referral reference does not bypass referral RLS or application facility authorization.
- Revoked/reassigned staff stop receiving future notices according to the approved eligibility rule.
- Generic rendering contains no PHI, including for unknown event keys.
- Pagination is stable under concurrent inserts; unread counts are consistent with the chosen query semantics.
- Retention, expiry, deletion and backup behavior are tested after governance approves the policy.
- Tests run against PostgreSQL/Supabase with synthetic users and facilities; static source tests alone are insufficient.

## 8. Findings against the current source proposal

1. `NotificationCenter.jsx` is correctly isolated and presentational; it has no Supabase access and is not mounted in `App.jsx`.
2. Its expected `read_at` field and callbacks have no confirmed persisted inbox relation or authenticated data-access adapter.
3. The outbox migration is a private delivery queue, not a user-facing inbox. It has no `read_at` field and must not be exposed to browser roles.
4. The acknowledgement hook selects every receiving-staff profile at the destination facility, while recipient eligibility is not approved.
5. The outbox's user-only recipient contract cannot represent the facility-level SMS destinations used by `api/referral-sms.js`.
6. The acknowledgement-hook trigger functions are `SECURITY DEFINER`; their exact owner, effective privileges, dependency behavior and ACL must be reviewed in the disposable database before approval. Static tests do not establish this.

## 9. Release decision

**Inbox persistence and integration remain blocked.** Continue only with source-level design and tests until all of the following are available:

- reconciled migration baseline;
- separate synthetic-data Supabase environment;
- approved recipient eligibility and fan-out policy;
- approved retention/deletion policy;
- verified schema/FK targets and grants;
- RLS and mark-read integration tests;
- referral access regression tests;
- reviewed trigger owner/ACL and transaction behavior.

No production schema, RLS, Auth setting, Edge Function, provider configuration, patient record or deployment was changed by this design.


## 10. Recipient policy decision — 6 November 2026

The recipient eligibility decision is now explicit: **do not select any automatic user recipient until an approved authoritative roster or notification-duty assignment source is identified. Facility-wide fan-out to every `receiving_staff` profile is not approved.** This supersedes the two open options described in §4; option 1 (all assigned receiving staff) is not an implicit default.

The proposed trigger in `20261106000100_referral_acknowledgement_notification_hooks.sql` still contains broad profile fan-out and must remain unapplied. Referral workflows must not depend on a notification recipient being available. The required governance questions, assignment lifecycle and acceptance tests are recorded in [NOTIFICATION_RECIPIENT_ELIGIBILITY.md](./NOTIFICATION_RECIPIENT_ELIGIBILITY.md).

## 11. Authenticated adapter source status

An isolated client adapter is now implemented in `src/lib/notificationInbox.js`, with mocked-client tests in `tests/notificationInbox.test.js`. It verifies the authenticated user, narrows list queries to that owner, selects an allowlisted projection, uses bounded keyset pagination and calls only the proposed owner-scoped mark-read RPC. It is not mounted in `App.jsx`; the inbox relation and RPC remain proposals. See [NOTIFICATION_INBOX_ADAPTER.md](./NOTIFICATION_INBOX_ADAPTER.md).

The tests do not establish PostgreSQL/RLS/PostgREST behavior or cross-account isolation. Database integration remains blocked by migration-baseline reconciliation, synthetic-data staging, recipient approval and retention approval.
