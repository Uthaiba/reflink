# Offline referral integration security decision — 2026-11-11

## Reviewed source
- `v2.0-release:src/lib/offlineReferralQueue.js`
- `reflink/staging-baseline-reconstruction-20261110:src/lib/offlineDraftVault.js`

## Confirmed source-level findings
1. v2.0's queue stores `payload: {...payload}` in a browser IndexedDB object store **without encryption**. Because referral payloads can contain clinical/patient information, **do not port or enable this implementation unchanged**.
2. v2.0's `syncQueuedReferrals` calls `referrals.insert(payload)` and removes the queue item after successful insert. It sets `offline_client_id`, but source review alone does **not** establish a database uniqueness constraint or server-side idempotency. A network failure after server commit but before client acknowledgment could create duplicate referrals on retry.
3. v2.0's queue does not partition queued records by authenticated user/facility. This is unsafe for shared clinic devices without stronger isolation.
4. Staging's offline vault uses PBKDF2-SHA256 (310,000 iterations), AES-GCM-256 with per-record IV and authenticated additional data, a local passphrase, and owner/vault identifiers. These are **source-level design observations**, not a penetration test or verified recovery test.
5. The vault stores drafts; it is **not** an automatically synchronized referral queue. Existing encrypted drafts must remain readable through future migrations.

## Decision
**BLOCK direct port of v2.0 offlineReferralQueue.js.** Retain the staging encrypted draft vault. Design a separate, explicitly user-confirmed sync operation using encrypted queue entries, user/facility isolation, server-side unique client idempotency keys, resumable states and retry-safe acknowledgments. Do not automatically transmit sensitive clinical records merely because connectivity returns.

## Acceptance requirements
- No unencrypted clinical payloads in IndexedDB, Cache Storage, service-worker caches or logs.
- Authenticated user/facility verified immediately before submission.
- Database uniqueness of a stable client submission key and atomic idempotent insert.
- Retry after ambiguous network outcome yields exactly one referral.
- Logout locks local drafts and cannot expose another user's records.
- Vault passphrase recovery limitations and offline retention policy documented.
- Tests with synthetic clinical data on a shared device; verify interrupted uploads and failure recovery.
- Do not enable auto-sync or copy patient data into staging before these pass.
