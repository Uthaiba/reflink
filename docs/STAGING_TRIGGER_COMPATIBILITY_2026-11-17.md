# Staging trigger compatibility review — 17 November 2026

Read-only catalog review of synthetic staging rcskuzmvyugbanygizri found 22 migration-ledger entries, ending with 20261110203341 (require_authenticated_referral_read_audit). Neither candidate atomic RPC nor operation ledger is installed. No hosted migration or production change was made.

Seven enabled referral trigger functions were inspected with their attachment definitions. Exact function bodies are captured in tests/database/staging_trigger_fixture.sql for disposable regression testing; supporting tables and grants are simplified. This fixture is not a hosted schema baseline and must never be installed in staging or production.

## Compatibility findings

- Entry validation runs BEFORE every INSERT/UPDATE, including clinical RPC saves. Incomplete legacy patient age, identifier, sex, complaint, urgency or emergency findings may reject a save. Preserve the clinical draft; repair source data only through a reviewed authorized process. Do not bypass validation in hosted environments.
- Status validation admits the candidate assessment outcomes and admitted-to-discharged transition, including same-status observation/admission updates.
- The counter-referral guard requires a structured record before completion. Ordinary acknowledgement/arrival/start-assessment transitions remain available under the candidate guard.
- Status changes append referral_updates; mutation audit writes minimized snapshots. Audit errors must roll back the clinical operation, not be swallowed.
- Notifications enqueue only sent and acknowledged changes. Assessment/admission/discharge saves should not create unrelated dashboard notifications.
- Acknowledgement deadlines are recalculated on insertion or explicit urgency/created_at updates; clinical patches do not include those columns.

## Disposable verification

The extended workflow first runs all investigation, clinical and preflight groups, then checks:
1. Admission/discharge plus replay produce exactly two status events and two minimized UPDATE audit entries without duplicated side effects.
2. A simulated incomplete legacy referral rejects the clinical write and operation insertion transactionally; after synthetic intake correction, the same rolled-back operation key can succeed.
3. Authorized operational transitions preserve notifications, direct admission bypass is denied, and completion still requires a counter-referral.

The fixture deliberately omits full hosted table constraints, Auth machinery, child-table RLS, storage, realtime and external side effects. Real session/API/browser tests are still required.

## Remaining completion work

The master plan remains incomplete: reviewed migration baseline and hosted synthetic installation; authenticated lifecycle and attachment tests; controlled corrections and server-owned reconciliation; consolidated design/accessibility/mobile checks; acceptance/rejection and escalation contracts; approved aggregate disclosure, geography and AI reporting; full controlled offline synchronization and interoperability; backup restoration, clinical approval and production deployment.

Keep both atomic flags disabled until the backend/client rehearsal passes. Preserve all existing facilities, accounts, clinical documents and operation history. No stage is declared complete merely because this fixture passes.
