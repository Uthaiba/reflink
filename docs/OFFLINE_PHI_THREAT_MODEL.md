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
- Requires the payload's `referring_user_id` to match the owner context before encryption and after decryption.
- Rejects malformed envelopes, unsupported versions, extractable keys and invalid record context.
- Normalizes decryption/authentication failures so callers do not receive low-level cryptographic details.

Added `tests/offlineQueueCrypto.test.js` for key properties, encryption/decryption round trips, fresh IVs, owner/record binding, tampering, wrong-key rejection, malformed envelopes and extractable-key rejection.

**Important implementation boundary:** this module is not wired into `offlineReferralQueue.js`. Existing IndexedDB records are still stored in plaintext, and the application does not yet provision, persist, unlock, rotate, revoke or recover encryption keys. The helper's generated key is in-memory only; using it without a durable, approved lifecycle would make unsynced referrals unrecoverable after a reload. It does not by itself protect against same-origin XSS, malicious extensions, or a compromised browser profile.

Do not describe offline referral storage as encrypted until the queue migration, key lifecycle, logout/recovery flow, retention policy and browser integration tests are implemented and reviewed. This source-only step does not change the database, production app, current queue schema or referral synchronization behaviour.


## Offline key-vault foundation — 6 November 2026

Added `src/lib/offlineQueueKeyVault.js` with a passphrase-wrapped data-key lifecycle foundation:
- Generates a random 256-bit data key and imports it as a non-extractable AES-GCM CryptoKey for active use.
- Wraps the raw data key using an AES-256-GCM key derived from a user-supplied passphrase with PBKDF2-HMAC-SHA-256 (600,000 iterations) and a random 128-bit salt.
- Uses a fresh 96-bit IV and binds the vault envelope to the account owner through authenticated additional data.
- Unlocks into a non-extractable, in-memory CryptoKey; the passphrase is not returned or persisted.
- Supports passphrase rewrapping of the same data key without changing referral ciphertext.
- Bounds and validates envelope fields and clears temporary raw-key byte buffers after use.

Added `tests/offlineQueueKeyVault.test.js` for vault creation, correct unlock, wrong-passphrase rejection, cross-account rejection, envelope tampering, passphrase rotation and invalid passphrase/envelope handling.

**Not yet integrated with IndexedDB or the referral queue:** the vault envelope is not persisted by the application, no UI prompts for a passphrase, and the returned CryptoKey is not connected to queue reads/writes. Existing queue payloads remain plaintext. There is no recovery mechanism if the passphrase is lost; losing it makes wrapped key material and any data encrypted by it unrecoverable. A reset must never silently discard pending referrals.

Before production integration, approve a passphrase/recovery policy, device and session threat model, rate-limiting/lockout approach, cross-tab coordination, account-disablement behaviour, key rotation workflow and unsynced-record recovery. A passphrase-derived wrapping key does not protect against malicious same-origin JavaScript while the vault is unlocked.


## IndexedDB key-vault envelope persistence — 6 November 2026

The offline database schema is now version 3 and creates a separate `offline_key_vault` object store keyed by `owner_user_id`. The queue module exposes account-scoped functions to save, retrieve and explicitly delete the wrapped vault envelope. Before saving, it validates the expected PBKDF2/AES-GCM envelope fields, owner binding, fixed cryptographic parameters and encoded field lengths; unexpected fields (including passphrases) are rejected. The active non-extractable CryptoKey is never written to IndexedDB by these functions.

**Scope and limitations:**
- This is persistence for the wrapped envelope only. It does not yet create or unlock a vault automatically, retain a CryptoKey across reloads, or add passphrase UI.
- Existing referral queue payloads remain plaintext. The current `queueReferral`, `listQueuedReferrals` and `syncQueuedReferrals` behaviour has not been switched to encryption.
- No existing referral records are rewritten or deleted by the version 3 database upgrade. The upgrade adds the separate vault store; queue ownership migration remains unchanged.
- Logout does not delete the vault or queued referrals. The delete API is explicit and must not be used as a logout side effect.
- The storage functions have unit coverage for envelope validation, but require real-browser IndexedDB tests for upgrade, persistence across reloads, blocked upgrades, multi-tab behaviour and interrupted writes before release.

Do not represent the offline queue as encrypted or production-ready. The next integration step must add a deliberate unlock state, encrypt new queue writes, decrypt only for the authenticated owner, and implement an idempotent per-record migration that commits each ciphertext replacement atomically without losing pending referrals.


## Encrypted queue API and per-record migration foundation — 6 November 2026

Added encrypted queue operations to `src/lib/offlineReferralQueue.js`:
- `queueEncryptedReferral(payload, ownerUserId, key)` encrypts before opening the IndexedDB write transaction and writes an envelope-only queue record. It has no plaintext fallback.
- `decryptQueuedReferralRecord(record, ownerUserId, key)` checks record ownership, decrypts with the owner/client-ID context, and validates the decrypted referrer.
- `migratePlaintextQueueToEncrypted(ownerUserId, key)` processes one record at a time. Web Crypto runs outside IndexedDB transactions; a short readwrite transaction re-reads the original record and replaces it only if its owner and serialized payload still match. A failed or interrupted item is left unchanged; already encrypted items are skipped, making retries idempotent.
- `listDecryptedQueuedReferrals` provides a key-gated read path. `syncQueuedReferrals` now accepts an optional unlocked key and decrypts encrypted records before upload. Without a key, encrypted records fail closed and remain queued.
- Added an explicit encrypted-record classifier and unit coverage that rejects records carrying both ciphertext and a plaintext payload field.

**Critical integration boundary:** the current application still calls the legacy `queueReferral` API, which stores new offline referrals in plaintext. The automatic sync effect also has no vault-unlock UI/key session and therefore cannot sync encrypted records. This step adds the safe primitives and migration path but does not yet switch the production-facing submit flow. Do not claim the application queue is encrypted.

The migration code is guarded against a same-record concurrent change by re-reading and comparing the plaintext payload in the commit transaction. Browser-level tests are still required for real IndexedDB transaction behaviour, database upgrades, multiple tabs, browser termination between encrypt and commit, and simultaneous migration attempts. A Web Crypto key passed to these APIs must come from the correct account's unlocked vault; this module does not itself authenticate a user or implement UI lock state.


Implementation follow-up: the offline queue module's ES module imports were normalized in commit `2dd8f69f965ab0e5df9b1033caba3dc4a98498c6`. The branch's CI and Preview checks for this latest commit have not yet been reported; treat validation as pending until exact-SHA checks are available.


## Application integration — offline vault lifecycle and encrypted submission — 6 November 2026

The PHC application now imports the vault and encrypted queue APIs and exposes an account-scoped vault panel:
- A user can create a vault with a minimum 12-character passphrase or unlock the existing account envelope.
- The application persists only the wrapped envelope. The non-extractable data key remains in React application memory and is cleared on explicit lock, sign-out, and account-switch handling.
- A pending offline referral is held in application memory until vault unlock/create completes. It is then written using `queueEncryptedReferral`; if vault setup fails, the referral is not reported as saved and there is no plaintext fallback.
- Existing plaintext queue records are migrated when the vault is unlocked. Each item is atomically replaced only after successful encryption and unchanged-record verification.
- Background sync now requires an unlocked key for the current authenticated account, attempts migration first, and processes only structurally valid encrypted records. Legacy plaintext records that fail migration remain queued and are not uploaded by this path.
- The app exposes a manual lock control. A `BroadcastChannel` message coordinates manual lock across open tabs where that browser API is supported. Sign-out and account-switch handlers clear the current tab's in-memory key.
- The offline queue badge still reports queued item counts without decrypting patient payloads.

**Security and operational limitations that remain:**
- A vault passphrase has no recovery/reset workflow. If lost, encrypted pending referrals cannot be decrypted. Clinical governance must approve this risk before enabling broad use.
- Cross-tab lock messaging is best-effort and depends on browser support; it is not a substitute for managed-device controls or protection against malicious same-origin JavaScript.
- The pending referral being composed is held in memory until the vault unlock completes. A browser crash or refresh before the encrypted queue write means that not-yet-saved referral is lost; the UI explicitly does not claim it has been stored.
- Browser-level IndexedDB tests (schema upgrade, persistence/reload, migration interruption, multi-tab transactions, quota/eviction and browser compatibility) are not yet implemented. The existing automated tests cover cryptographic helpers, ownership/classification and static contracts, not full browser behaviour.
- Offline encryption does not replace server-side RLS, role/facility authorization, revalidation at sync, endpoint disk encryption, screen locks, CSP/XSS controls or a clinically approved retention policy.
- Do not treat this as production approval for shared or unmanaged devices. PR release gates and clinical/security sign-off remain mandatory.


## Latest CI record — 6 November 2026

The integrated application revision at commit `f4c29fa0da2c1af45c4a297d8cd002493cade0bf` passed the GitHub Actions quality workflow: automated unit tests, lint and production bundle build all completed successfully (run #234, `42173481598`). A subsequent one-line change passes the active unlocked vault key to the online pre-submit sync call (commit `46dc349998d0b5581fda2631fe18f86df5f24710`); exact-HEAD CI has not yet been reported for that final adjustment.

Vercel Preview returned a build-rate-limit failure for this branch. This is a platform quota failure, so there is no successful Preview build for the integrated revision. The source has not been deployed to production.
