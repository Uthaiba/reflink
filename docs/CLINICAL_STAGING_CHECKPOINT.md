# Clinical staging verification checkpoint

The next step is authenticated synthetic staging rehearsal. This checkpoint does not authorize production changes or certify the system.

## Read-only structural preflight

Run `database/checks/clinical_staging_preflight.sql` through a database-owner catalog inspection connection to the approved synthetic staging project. The script starts a read-only transaction and returns one JSON report. It reads catalog metadata only; it does not read patient, profile, Auth user/session or file rows, function bodies, or credentials.

The six checks cover required column types, the clinical RPC definer/search-path configuration and execution grants, private ledger RLS/client grants, and enabled clinical/closed-record guard functions. Missing candidate objects are expected blockers until reviewed migrations are installed. Restricted catalog visibility is not evidence that the environment is ready; use the approved operator connection. Preserve the complete report, inspected project, timestamp and source SHA as release evidence.

A zero blocker count proves only these structural checks. It does not compare function bodies, certify RLS, validate existing audit triggers or storage policies, assess ownership/privileged writers, or verify deployed frontend flags. Reconcile those against the reviewed baseline before applying any candidate.

The disposable PostgreSQL suite tests both a ready fixture and negative scenarios: disabled clinical guard and an authenticated ledger SELECT grant. Those test mutations never run in the preflight script or against hosted projects.

## Authenticated rehearsal matrix

Use synthetic referrals and accounts exclusively. Record the source SHA, project identity, enabled flags, actor role/facility, expected outcome, observed result and audit evidence for every case. Never capture credentials or patient information in evidence.

| Scenario | Required result |
| --- | --- |
| Receiving assessment, observation | One audited save; server completion timestamp; remains under assessment |
| Assessment followed by admission and discharge | Correct lifecycle, server discharge timestamp, fields retained |
| Two receiving sessions edit the same snapshot | Exactly one save; other retains draft and receives conflict |
| Same operation key and unchanged request | Same revision; no duplicate write/audit; currently authorized projection |
| Same key with changed input | Rejected; no duplicate mutation |
| Wrong facility, PHC, administrator clinical save, anonymous | Denied |
| Expired/revoked/banned session or required password reset | Denied including replay |
| Completed/cancelled referral | Denied without altering clinical or operation history |
| Direct REST clinical update or admission/discharge transition | Denied by guard |
| Acknowledge, arrival and start assessment | Existing authorized operational transitions still work |
| RPC response lost after commit | Form retained, saving paused; no fallback write; reconcile current record |
| Reload/navigation/sign-out with unsaved form | Warning and safe draft handling; no silent discard |
| Flag disabled against guarded backend | Writes denied; no misleading success; maintenance/recovery path documented |
| Keyboard and 320/375px receiving workflows | Controls, errors, focus and retained drafts usable |
| Printing and follow-up | Synthetic summary matches saved clinical record |

The operation key belongs to a specific request. The current frontend does not automatically retry uncertain operations or persist keys across reloads. Review the authorized current record and ledger through an approved reconciliation procedure; do not generate a new save merely to resolve uncertainty.

## Coordinated rollout boundary

Keep `VITE_ATOMIC_CLINICAL_SAVES_ENABLED` absent/false outside the reviewed rehearsal. Validate the candidate and flag-enabled build together during an approved maintenance window. The guard blocks legacy clinical writers, including old tabs. Do not remove the guard or operation history to make an old client work.

No hosted migration, environment-variable change or production deployment is performed by adding this checkpoint. Browser, live RLS/Auth, storage, restore and clinical approval remain open until actual evidence is recorded. See ATOMIC_CLINICAL_SAVES.md and PRODUCTION_COMPLETION_RUNBOOK.md.
