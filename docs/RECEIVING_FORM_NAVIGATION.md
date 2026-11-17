# Receiving clinical form navigation — 17 November 2026

Assessment, admission and discharge form edits now participate in the shared
unsaved-clinical-draft navigation registry. Selected forms also retain a navigation
warning while their save action is in progress. Opening another referral or
inpatient record requests confirmation before replacing current unsaved work.

The comparison baseline matches displayed controls, including the existing
admission timestamp projection and admission-diagnosis fallback. This preserves
current display behavior; it does not validate or change timezone handling.
Null database fields map to empty controls. Deleting existing text and whitespace
changes remain meaningful edits.

Eight local regression cases passed for clean prefills, every assessment and
inpatient/discharge field, cleared text, whitespace, nulls, confirmed baselines and
unrelated investigation updates. Full authenticated browser tests remain open.

No clinical field persistence, database policy, status-transition or production
deployment change is included. The existing read-then-write clinical save paths
still require the broader atomic-update/correction work recorded in the audit.
Navigation warnings do not guarantee crash recovery or session-loss recovery.
