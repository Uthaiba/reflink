# REFLINK Authenticated Notification Inbox Adapter

**Status:** Isolated source implementation and unit tests only. The adapter is not mounted in the application. The inbox relation and mark-read RPC are not present as an approved/applied migration.

## 1. Application boundary

`src/lib/notificationInbox.js` exports `createNotificationInboxAdapter(supabaseClient)`. It accepts the existing authenticated Supabase client rather than importing a privileged or separately configured client. It exposes only two operations:

- `listMyNotifications({ limit = 25, before = null })`
- `markMyNotificationRead(notificationId)`

There are no client-side insert, delete, recipient reassignment, event mutation, outbox access or arbitrary query methods.

## 2. Authentication and ownership

Each operation calls `supabase.auth.getUser()` and fails closed unless the server-verified user ID is present. The list query adds `recipient_user_id = auth user ID` as defense-in-depth query narrowing. It does not accept a recipient ID as an authorization input. Database RLS remains the actual security boundary and must independently enforce `recipient_user_id = auth.uid()`.

The adapter selects only:

`id,event_type,template_key,referral_id,created_at,read_at`

Rows are mapped to that allowlisted shape; unexpected columns such as patient names or arbitrary JSON are not returned to the component. Event wording remains controlled by `notificationCenterModel.js`, which renders an allowlisted generic presentation and safe fallback.

## 3. Pagination

The adapter uses descending keyset pagination by `(created_at, id)` with a page size from 1 to 50 (default 25). The opaque cursor contains only `{ createdAt, id }`. The query requests one additional row to determine `hasMore`; it returns `nextCursor` from the last visible row only when another page exists. This avoids offset pagination drift when new notifications arrive between page requests.

The UI's unread count remains a count of the rows currently loaded. A global unread count requires a separately reviewed owner-scoped count query/RPC and is not implied by this adapter.

## 4. Mark-read operation

The adapter calls only `public.mark_notification_read(p_notification_id uuid)`. The proposed database function must:

- be `SECURITY INVOKER` with an empty `search_path` and fully qualified object references;
- derive ownership from `auth.uid()` and update only a row matching both the supplied ID and the authenticated owner;
- set `read_at` using database time only where it is null;
- return no notification content and no distinguishable result for a foreign, missing or already-read ID;
- be executable only by `authenticated`, with minimum underlying column privileges and owner-scoped RLS;
- expose no INSERT, DELETE or immutable-column UPDATE path to the browser.

The adapter deliberately ignores RPC result data. A caller should refresh the list after the operation; it must not use the return value to infer whether a foreign notification ID exists.

## 5. Failure handling and implementation status

Authentication, input, query and RPC failures are surfaced as generic typed errors. Raw database/provider error text is not forwarded to the UI. If the relation or RPC has not been installed, the adapter returns a generic unavailable error; it does not fall back to direct referral reads or to the private outbox.

Unit tests use a mocked Supabase client. They verify authentication gating, owner filtering, minimal projection, stable cursor construction, pagination, input validation, generic error behavior and RPC-only mark-read behavior. These tests do not verify PostgreSQL, RLS, PostgREST, or actual cross-account isolation.

Do not mount `NotificationCenter` or call this adapter from `App.jsx` until the migration baseline is reconciled, a synthetic-data Supabase environment is approved, the inbox/RLS/RPC proposal is reviewed and database integration tests pass.
