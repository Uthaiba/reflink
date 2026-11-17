# Investigation attachment reconciliation implementation contract

Status: repository design only; no RPC, migration or cleanup worker is deployed.

## Current verified source limitations

The frontend still writes the complete investigation JSON array after a separate read.
This cannot prevent concurrent lost updates. The atomic update specification remains a
release blocker. A passed frontend quality gate is not evidence of transaction safety.

Client attachment checks now cover non-empty files, the 10 MB limit, MIME/extension
agreement, basic binary headers and UTF-8 text. These do not prove a document is safe,
clinically valid or free of malicious content. Recheck on a trusted server before
making an attachment available. Storage paths for new uploads contain UUIDs and a
canonical extension; original filenames remain clinical metadata, subject to access
control. Existing paths and files must remain readable.

## Required transaction and storage boundary

Storage upload and PostgreSQL commit are separate operations. Do not present them
as a single distributed transaction. Introduce a server-owned upload-intent record
only after verifying the deployed schema, storage policies and role model.

Proposed sequence:

1. Authenticate the actor and verify current receiving-facility assignment. Create a
   bounded upload intent with an opaque ID, target referral/item, immutable object
   key and expiry. Never trust a browser-supplied storage key or actor identity.
2. Upload to that reserved private key without overwrite. Verify actual size,
   format and ownership on the server; quarantine unverified content.
3. Finalize through the atomic investigation RPC. In one database transaction,
   lock the intent, recheck active actor/facility authorization, compare the expected
   investigation revision, attach the verified object and write audit/idempotency
   records. Mark the intent linked only if all writes commit.
4. Retry an ambiguous finalize with the SAME idempotency key and request digest.
   An exact retry returns its original authorized outcome. A reused key with a
   different payload returns an error. Recheck authorization before returning any
   saved clinical result.
5. A conflict or timeout preserves the object and intent for reconciliation.
   Never automatically delete either the prior attachment or the new upload.

## Reconciliation and deletion fencing

An administrator reconciliation view must distinguish uploaded/unlinked, linked,
expired, quarantined and deletion-pending intents. These are proposed states, not
existing database columns. Read-only inspection must not mutate clinical metadata.

Any future retention-approved cleanup must first acquire a database lock also used
by finalization, establish that the intent is unlinked, and transition it to a
terminal deletion-pending state in a transaction. Finalization MUST reject that
state. Only then may a narrowly authorized worker delete the storage object.
Retry deletion idempotently and audit the outcome; do not permit key reuse.
Checking references and deleting later without this shared fence is unsafe.

Direct writes to investigation attachment metadata must be denied or constrained
server-side before this protocol can claim safety. Otherwise a legacy client can
bypass the intent lock and attach an object during cleanup. Verify all existing
writers, triggers, RLS and grants before enabling deletion.

Audit only opaque intent/object identifiers, actor, operation, revisions, timestamp
and outcome. Keep filenames, patient identifiers and document contents out of CI
logs and generic error telemetry. Do not store recovery receipts in browser local
storage. Reconciliation must remain discoverable server-side after browser closure.

## Synthetic integration acceptance gate

- Competing finalizations at the same revision: exactly one commits.
- Concurrent intent finalization versus cleanup: either linked and preserved or
  fenced from attachment; never linked to a deleted object.
- Transaction failure after audit/idempotency writes rolls all database changes back.
- Timeout after commit, then exact retry: one revision increment and one audit event.
- Same key with a changed payload: rejection without mutation.
- Revoked/wrong-facility/anonymous actors: no mutation or clinical result disclosure.
- Tampered key, wrong owner, mismatched size/type, missing/quarantined object:
  no attachment link.
- Browser closure after upload: pending intent remains administratively discoverable.
- Storage deletion failure: retryable pending state, no object-key reuse.
- Legacy browser metadata writes cannot bypass the protocol.
- Existing clinical documents and printed referrals remain usable.

Run these against a reconciled synthetic database baseline before wiring the browser
to the RPC. This document is not a deployable migration or integration test result.
