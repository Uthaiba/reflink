# Clinical save recovery — 17 November 2026

Assessment, admission and discharge mutations now share an outcome verification
service. A confirmed update response is checked for the exact referral and
requested fields. A failed/empty/invalid response triggers one read-only recovery
request for the same referral. Clinical text stays in the update body, not URL
filters. Equivalent valid timestamp representations compare as the same instant.

A matching recovery snapshot is reported as observed saved documentation after
interrupted confirmation. It is not proof that this particular request performed
the write. A mismatch, missing field, different referral or failed read produces
CLINICAL_SAVE_UNCONFIRMED. There is no automatic write retry.

The UI retains uncertain forms and pauses further clinical saves for affected
referrals in a per-workspace in-memory set. Other referrals are not automatically
unlocked when another case becomes uncertain. A synchronous in-flight guard
prevents duplicate clinical-save handlers. The pause is a UX protection, not
server authorization or a durable lock; it resets if the dashboard unmounts.
Reconciliation and a review of the latest authorized record are still required.

Eight local tests cover direct confirmation, timeout recovery, timestamp
normalization, recovery failure, changed clinical fields/status, wrong referral,
missing nullable fields and malformed confirmation data.

No database or production change is included. Existing preflight reads/status
predicates do not provide full concurrency protection for these three clinical
writes. Transactional expected revisions, durable idempotency, controlled
corrections and authenticated browser/hosted integration tests remain open.
