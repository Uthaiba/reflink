# Atomic investigation updates — database implementation specification

**Status: design only; NOT deployed.** Existing browser-side stale-data detection is not an atomic concurrency guarantee.

## Required database contract

Implement a security-reviewed PostgreSQL function that updates one investigation result using an expected record revision. The function must perform authorization, revision comparison and mutation **in the same transaction**.

Proposed request: `referral_id`, `investigation_record_id` (stable ID, not array index), `expected_revision`, `patch`, `idempotency_key`.

Proposed response: `saved_revision`, updated authorized record, or a distinguishable `conflict`, `forbidden`, `not_found` or `invalid_transition` result. Never return another facility's patient details in error responses.

## Preconditions

1. Verify the deployed referrals schema, existing RLS policies, available RPCs and clinical event audit design. Do not invent columns or overwrite existing procedures.
2. Add stable investigation item IDs and a monotonically increasing revision, with a migration/backfill plan and rollback. Preserve historical investigation JSON.
3. Authorize the current authenticated clinician and assigned receiving facility **inside the transaction**. Reject revoked users and wrong-facility requests.
4. Compare the expected revision using an atomic `UPDATE ... WHERE revision = expected_revision RETURNING ...` (or equivalent locked-row transaction). A mismatch must not modify the record.
5. Apply only an allowlisted patch; validate clinical status, file metadata and attachment ownership. Never accept arbitrary JSON keys or storage paths.
6. Record actor, event timestamp, old/new revision and clinical audit event. Protect audit records from client mutation.
7. Enforce unique idempotency keys scoped to actor and operation, including retry after network interruption.
8. Grant EXECUTE only to authorized roles and test `SECURITY INVOKER` versus reviewed `SECURITY DEFINER` semantics. If using a definer, pin `search_path` and explicitly re-check authorization.

## Synthetic acceptance tests

- Two clinicians edit the same revision: exactly one succeeds; the other receives conflict.
- Clinicians edit separate records: no unintended lost updates.
- Wrong facility, revoked user, anonymous caller and PHC-only role cannot modify receiving-facility investigations.
- Invalid status, oversized or unauthorized attachment metadata, and repeated idempotency keys are rejected safely.
- Network timeout after successful commit: retry returns the original result without a second write.
- Existing printed referral and QR verification remain functional.

## Release gate

Keep frontend conflict messaging, but replace the browser read-then-write path only after the reviewed RPC is deployed and exercised in synthetic staging. Do not apply schema changes to production without a verified backup, migration review, and explicit approval.
