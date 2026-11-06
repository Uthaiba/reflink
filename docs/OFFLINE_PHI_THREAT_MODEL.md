# REFLINK Offline PHI Threat Model

**Status:** Design specification; implementation and security validation outstanding.

## Scope and current position

The current browser queue stores referral payloads in IndexedDB. The queue retry logic now reconciles a previously committed `offline_client_id` before retrying an insert, but the payload remains readable to code executing in the same browser origin. Service-worker cache restrictions do not encrypt IndexedDB.

Do not describe the current offline mode as encrypted, secure on shared devices, or suitable for unmanaged endpoints.

## Assets

- Patient identifiers and contact details.
- Referral reason, urgency and clinical narrative.
- Facility, referrer and receiving-facility identifiers.
- Authentication/session material.
- Offline queue metadata and sync state.

## Threat actors and failure modes

| Threat | Potential impact | Required control |
|---|---|---|
| Lost or stolen device | Local PHI disclosure | Device encryption, screen lock, remote wipe where managed, short offline retention |
| Shared workstation/browser profile | Next user accesses prior queue | Per-user queue isolation, sign-out lock, explicit purge and device policy |
| XSS or malicious same-origin script | Read queued PHI and active session | Strict CSP, output encoding, dependency hygiene, minimal third-party scripts |
| Browser profile/backup extraction | IndexedDB copied off device | Platform disk encryption and application-layer encryption with key lifecycle |
| Lost network response | Duplicate referral creation | Stable client-generated idempotency key and server unique constraint |
| User role/facility changes while offline | Stale authorisation at sync | Server re-authorisation at sync; never trust queued role/facility claims |
| Clock manipulation | Incorrect queue expiry | Server-issued timestamps where online; treat local clock as advisory |
| Browser storage eviction | Lost unsynced referral | Visible queue state, explicit export/recovery policy approved by clinical governance |

## Required design before enabling offline PHI broadly

1. **Minimise:** queue only fields required to initiate a referral; avoid copying unrelated patient records or attachments.
2. **Identity boundary:** partition queue records by authenticated subject and tenant/facility; revalidate both server-side during sync.
3. **Encryption:** use authenticated encryption (AES-GCM) through Web Crypto with a documented per-device/per-user key strategy. Do not hard-code keys, derive keys from user IDs, or store raw keys beside ciphertext.
4. **Key lifecycle:** define key provisioning, rotation, expiry, logout, account disablement, recovery and secure deletion. A non-extractable browser key is not a complete defence against same-origin XSS or a compromised browser profile.
5. **Retention:** set a clinically approved maximum offline lifetime and purge expired, synced and abandoned records. Do not rely only on a user-controlled device clock.
6. **Sync:** use server-side idempotency constraints, atomic reconciliation and current authorization checks. Keep notification delivery outside the referral transaction.
7. **Observability:** log counts, error classes and correlation IDs only; never log patient payloads, access tokens or clinical narratives.
8. **User controls:** display queued/synced/failed status, warn on shared devices, provide a deliberate sign-out/purge workflow, and avoid silently deleting unsynced clinical work.
9. **Endpoint governance:** document supported browsers, device ownership, OS encryption, screen lock, patching, remote wipe and incident response.
10. **Validation:** test device loss, logout, role revocation, facility transfer, XSS assumptions, storage eviction, concurrent sync and retry after lost responses using synthetic records.

## Recommended staged policy

- Until key lifecycle and endpoint controls are implemented and tested, restrict offline queue use to approved, managed devices under an explicit organisational policy.
- If the device is shared or unmanaged, disable offline PHI capture rather than implying browser storage is protected.
- Do not persist attachments offline in the initial hardened release.
- On logout, lock access immediately and execute the approved purge/key-destruction policy without silently discarding unsynced work; present a safe reconciliation path.

## Acceptance criteria

- No plaintext patient payload is stored in the offline queue.
- Keys are not stored alongside ciphertext or embedded in source.
- Sync rechecks user identity, active status, role, facility and referral eligibility on the server.
- Repeated and concurrent sync attempts create one referral only.
- Queue retention and deletion behaviour are verified on supported browsers.
- Security review and clinical governance approve the endpoint and recovery model.

This document is a design baseline, not evidence that current offline storage meets these criteria.


## Source-only hardening implemented (6 November 2026)

The browser queue now records an explicit `owner_user_id` for each newly queued referral and creates an IndexedDB index for that field. Existing queue entries are migrated using their original `payload.referring_user_id` value. Queue listing and deletion require the matching owner; the application badge counts only the current session user's queue. This is a client-side separation measure, not an authorization boundary.

Automatic sync now:
- Requires an online browser and a successful `supabase.auth.getUser()` verification before reading the user's queue.
- Processes only records whose stored owner and payload referrer match the verified user.
- Constrains duplicate reconciliation queries by both `offline_client_id` and `referring_user_id`.
- Rechecks the authenticated user before deleting a locally queued record after server reconciliation.
- Prevents overlapping sync runs in the same JavaScript runtime.

Static unit tests cover owner matching and reject unowned records. They do not prove IndexedDB isolation against same-origin script execution, cross-tab races, RLS correctness or server-side role/facility authorization. Those controls remain mandatory.

**Still outstanding:** queue payloads remain plaintext in IndexedDB; no application-layer encryption or key lifecycle has been implemented. Logout does not yet implement a reviewed purge/recovery policy. Device encryption, screen locks, managed endpoints, XSS mitigation, server-side sync authorization and clinical retention policy remain release gates.


## AES-GCM implementation foundation — 6 November 2026

Added `src/lib/offlineQueueCrypto.js` as a source-only cryptographic primitive. It:
- Generates non-extractable AES-256-GCM keys through Web Crypto.
- Uses a fresh 96-bit IV for each encryption operation and a 128-bit authentication tag.
- Authenticates the format version, owner user ID and offline client ID as additional authenticated data.
- Rejects malformed envelopes, unsupported versions, extractable keys and invalid record context.
- Normalizes decryption/authentication failures so callers do not receive low-level cryptographic details.

Added `tests/offlineQueueCrypto.test.js` for key properties, encryption/decryption round trips, fresh IVs, owner/record binding, tampering, wrong-key rejection, malformed envelopes and extractable-key rejection.

**Important implementation boundary:** this module is not wired into `offlineReferralQueue.js`. Existing IndexedDB records are still stored in plaintext, and the application does not yet provision, persist, unlock, rotate, revoke or recover encryption keys. The helper's generated key is in-memory only; using it without a durable, approved lifecycle would make unsynced referrals unrecoverable after a reload. It does not by itself protect against same-origin XSS, malicious extensions, or a compromised browser profile.

Do not describe offline referral storage as encrypted until the queue migration, key lifecycle, logout/recovery flow, retention policy and browser integration tests are implemented and reviewed. This source-only step does not change the database, production app, current queue schema or referral synchronization behaviour.
