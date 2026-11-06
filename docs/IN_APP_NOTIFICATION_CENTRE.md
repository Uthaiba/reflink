# REFLINK In-App Notification Centre — UI and Lifecycle Contract

**Status:** Isolated source implementation for review. The component is not mounted in the production application and has no database integration.

## 1. Component boundary

- Component: `src/components/notifications/NotificationCenter.jsx`
- Presentation helpers: `notificationCenterModel.js`
- Styles: `notification-center.css`
- The component accepts notification records and callbacks as props. It does not import Supabase, access auth state, fetch data, or mutate records directly.
- The component is deliberately not imported into `App.jsx` until a reviewed inbox table, RLS policy and authenticated data-access layer exist.

## 2. Supported UI behavior

- All and Unread filters.
- Unread count.
- Loading, error and empty states.
- Generic event presentation for known event types.
- Safe fallback wording for unknown event types.
- Optional callbacks to refresh, mark a notification read, or open its related referral.
- Responsive layout and keyboard-visible focus treatment.

The UI does not fabricate notifications. An empty collection renders an honest empty state. No demo patient or referral data is bundled.

## 3. Data contract expected from a future repository

The UI currently consumes a minimal, normalized record:
- `id`: opaque notification ID;
- `event_type`: allowlisted event key;
- `created_at`: timestamp;
- `read_at`: null when unread, otherwise timestamp;
- `referral_id`: optional opaque referral reference.

It intentionally does not render patient identifiers, names, diagnoses, clinical narrative, phone numbers, message bodies or arbitrary server-provided text. Event descriptions are generated from a local allowlist, not copied from untrusted payload fields.

## 4. Lifecycle proposal

1. **Created:** a committed and approved referral lifecycle event creates one user-owned inbox record transactionally.
2. **Unread:** the record is visible only to its recipient through RLS.
3. **Read:** the recipient explicitly marks it read; the server verifies ownership and records `read_at`.
4. **Opened:** selecting Open referral navigates through the existing referral authorization path; the notification ID does not grant referral access.
5. **Expired/retained:** retention and deletion follow an approved privacy and clinical governance policy. No automatic retention period is assumed here.

Delivery status in the outbox and user read state in the inbox are separate concepts. An SMS accepted by a provider does not mark an in-app notification read.

## 5. Future database/security requirements

- Separate inbox table from the private service-only outbox.
- RLS restricts SELECT and UPDATE to `recipient_user_id = auth.uid()`.
- Insert permissions are not granted to browser roles; only a trusted server-side producer may create records.
- Update policy permits only the recipient's read-state fields to change; use a narrow RPC if column-level enforcement cannot be guaranteed.
- Referral access remains independently authorized by existing role/facility rules.
- The inbox contains no PHI beyond an opaque referral reference; ideally no patient data at all.
- Index recipient and created timestamp; define retention, expiry and deletion before rollout.
- Tests prove cross-user isolation, stale-session rejection, read ownership and no referral authorization bypass.

## 6. Current limitations

This is an isolated UI component and model-helper implementation only. It is not mounted in the application, does not have a live data source, does not mark anything read, and does not send messages. Do not connect it to production until migration baseline reconciliation and synthetic-data staging validation are complete.

## Related backend security design

The proposed inbox schema, owner-only RLS, mark-read contract, recipient eligibility blockers and release gates are documented in [NOTIFICATION_INBOX_SCHEMA_AND_ACCESS_DESIGN.md](./NOTIFICATION_INBOX_SCHEMA_AND_ACCESS_DESIGN.md).
