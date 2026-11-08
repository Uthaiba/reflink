# REFLINK Master Product Transformation — Status Register

**Last reviewed:** 7 November 2026  
**Production baseline:** `v2.0-release` at `cce730ec64aa8be568021f16de4de47c110f81d5`  
**Working branch:** `reflink/phase-1-security-remediation`  
**Source changes reviewed through:** `c322a82c4ebc3d3e3bf46122aff05326404d7fb3` (documentation update itself is committed separately).  
**Pull request:** #1, open and draft; target `v2.0-release`.

This register distinguishes source implementation, automated verification, live database validation and production release. A source file or passing unit test is not evidence that a database migration is safe or that a feature is live in production.

## Executive status

The transformation is in incremental implementation, not complete. Phase 1 audit work is substantially complete. The largest completed engineering stream is offline queue protection. The next active product stream is receiving-facility referral workflow reliability, followed by clinical workflow acceptance and role/security integration testing. Database-dependent R-PHI and notification features remain blocked by the missing reproducible migration baseline and lack of a designated synthetic-data environment.

## Checklist by master phase

| Phase | Status | Verified work | Outstanding |
|---|---|---|---|
| 1. Technical, database and security audit | Substantially complete | Production v2.0 source baseline, React/Vite/Supabase/Vercel architecture, public schema inventory, role model, referral status/trigger model, RLS and privileged routine findings documented. | Recover/reconstruct the exact historical migration source and complete a reproducible schema baseline. Validate live ACL/RLS/function behavior in an approved synthetic environment. |
| 2. Design system and UI/UX | Partial | Responsive workspace styling, administrator workspace, PHC/receiving layout refinements, PWA metadata, visible keyboard focus, reduced-motion support and responsive workspace refinements. A static accessibility scan found existing labels, selected live regions and alert/status roles, but no `aria-invalid` or `aria-describedby` attributes in `src/App.jsx`. | Complete WCAG 2.2 AA review; associate field-level validation messages with controls; add programmatic invalid-state semantics where custom validation is used; audit dialog focus management, keyboard operation, contrast, zoom/reflow and screen-reader announcements; usability testing with frontline staff. |
| 3. Role-specific dashboards | Partial | Existing PHC, receiving and administrator dashboards refined; PHC referral search; receiving status/urgency filters, emergency/overdue indicators and prioritised queue; administrator patient-level view replaced by aggregate-oriented workspace. | Verify every role's information architecture and action permissions; complete facility directory, reports, settings, help/support and user-management workflows; full mobile and accessibility review. |
| 4. Referral engine | Partial | Existing referral lifecycle retained; structured counter-referral form and proposed atomic completion RPC; receiving assessment, admission/discharge and investigation result workflows; acknowledgement/arrival actions; PHC referral journey now separates admission, discharge, counter-referral submission and formal completion, with expanded receiving feedback visibility. | Clinical acceptance testing for every transition; validate correction/audit controls; test concurrency, duplicate submissions, referral escalation, rejected/declined workflow under clinical governance, follow-up and end-to-end closure. |
| 5. Security and privacy | Source remediation advanced; live validation blocked | PHI console logging removed; admin UI avoids patient-level referral reads; role-limited user-provisioning source; service-worker caching restrictions; notification/outbox source hardening; offline encryption/key vault and account isolation; dependency audit gate; metadata-only catalog snapshots. | Reconcile and test migration baseline; test RLS with synthetic roles/facilities; review all five legacy SECURITY DEFINER RPCs and dependencies; minimise full-row audit snapshots; validate Storage access, MFA/leaked-password settings, retention, incident response and recovery. No production security change is claimed. |
| 6. Referral analytics | Partial / proposal | Aggregate reporting RPC proposals for referral volume, LGA summaries, facility coverage, pathways and acknowledgement delays; small-cell suppression helper and tests. | SQL execution, denominator/data-quality validation, cross-filter differencing tests, role access tests and actual dashboard integration in synthetic staging. Do not call referral counts population incidence or prevalence. |
| 7. R-PHI | Foundation implemented | R-PHI architecture, indicator data dictionary, schema review, disclosure helper and reporting documentation. | Profile source data quality and coverage; human/public-health governance approval; build validated visualisations and aggregate exports; reporting assistant remains future work and must be human-reviewed. |
| 8. Offline and low-connectivity support | Substantial source implementation; limited browser verification | Encrypted IndexedDB queue APIs, AES-GCM, passphrase-wrapped account key vault, encrypted queue integration, legacy record migration, account isolation, cross-tab lock and sync claims, Chromium tests. | Firefox/WebKit; storage eviction/crash/device-loss tests; passphrase recovery/reset and lockout policy; managed/shared-device and retention policy; same-origin XSS limitations; real low-bandwidth and offline field validation. |
| 9. Interoperability | Not started | FHIR and DHIS2 are documented as future architecture considerations only. | Map required workflows and institutional owners; assess FHIR resources, terminology/facility identifiers and DHIS2 aggregate exchange; no integration should be built before counterpart requirements are confirmed. |
| 10. Testing and production readiness | Partial | Node unit tests, static migration/source-contract tests, npm audit gate, lint/build and Chromium offline queue tests. | Exact-HEAD CI for current changes; live PostgreSQL migration/RLS integration; authenticated role/facility workflow tests; accessibility, mobile, clinical acceptance, performance, backup/restore and production release sign-off. |

## Receiving-facility workflow — current implementation review

The receiving dashboard already contains:
- Incoming referral search.
- Status and urgency filters.
- Emergency and overdue acknowledgement indicators.
- Emergency > urgent > routine ordering, overdue-first within the same urgency tier, then oldest referral.
- Acknowledgement and patient-arrival actions.
- Clinical assessment, admission/discharge and counter-referral flows.

A data-projection defect was found during this review: the receiving referral query used the overdue helper and displayed acknowledgement targets but did not select `ack_due_at`. Consequently, the overdue count and target display could silently fail even though the UI logic existed.

### Corrective source changes in this continuation

- Added `ack_due_at` to the receiving-facility referral projection.
- Extracted pure referral priority helpers into `src/lib/referralPriority.js`.
- Made overdue evaluation fail closed for missing or invalid timestamps and apply only to referrals still in `sent` status.
- Centralised queue ordering: emergency, urgent, routine; then overdue acknowledgement; then oldest referral.
- Corrected the active queue definition so cancelled/completed referrals are closed, while discharged referrals remain operationally open until counter-referral is recorded.
- Emergency KPI now counts open emergency referrals only.
- Added `tests/referralPriority.test.js` for deadline handling, priority ordering, active/closed status and query projection.

**Validation:** the preceding receiving-queue commit `5098ee1b3fc58ff6e976d6ff73fab63dcda1b71a` passed GitHub Actions workflow #625, including unit tests, lint, production bundle build and Chromium offline-queue browser tests. Vercel's status check was successful for that commit. The subsequent lifecycle compare-and-set changes documented below are newer and have not yet produced an exact-HEAD GitHub Actions run in the available PR-run query. Vercel reports `build-rate-limit` for the newer commits, so no Preview deployment is claimed.

## Receiving lifecycle concurrency protection — latest source changes\n\n- Added expected-current-status filters to all six receiving-facility update handlers: acknowledgement (`sent`), patient arrival (`acknowledged`), assessment start (`patient_arrived`), assessment save (`under_assessment`), admission save (`admitted`) and discharge (`admitted`).\n- Changed these update responses to `maybeSingle()` and treat a no-match as a stale referral rather than reporting success. The user receives a clear instruction to refresh and review the current status before retrying.\n- Added `tests/referralLifecycleConcurrency.test.js` to assert each handler's expected-status guard, no-match handling and stale-state message. These are source-contract tests, not concurrent PostgreSQL integration tests; server-side atomicity and trigger behavior still require synthetic-database validation.\n\n## Referral lifecycle end-to-end contract review — latest source changes

- Reviewed the complete source-level lifecycle from PHC referral visibility through receiving acknowledgement, patient arrival, assessment, admission, discharge, counter-referral submission and formal completion.
- Confirmed the six receiving-side referral update handlers use expected-prior-status filters and no-match handling. These client-side compare-and-set checks reduce stale-write risk but do not replace database-side transactional enforcement.
- Reviewed the transactional `submit_counter_referral` function source: it checks authenticated receiving-staff role and assigned facility, locks the referral row, accepts final feedback only for discharged referrals, and handles a retry by the same receiving user after completion. The function is present in an unapplied proposal migration; this review does not establish that it exists or is active in production.
- Added `tests/referralLifecycleEndToEnd.test.js` with synthetic lifecycle/timeline cases and source-contract assertions for update guards, timestamps, counter-referral completion, facility ownership and both realtime scopes.
- The test suite is not a live end-to-end test. No synthetic database environment is currently approved, so actual role/RLS behavior, RPC execution, concurrent submissions, persisted timestamps, realtime delivery and refresh consistency remain unverified.
- No migration was applied, no database branch was created, and no production data was changed.

## Migration baseline reconciliation — latest source findings

- Re-inspected the Git trees for `v2.0-release`, `main` and the remediation branch. Neither release baseline contains a historical `supabase/migrations/` directory; the working branch contains exactly eight proposed November migrations and no source for the recorded production migration `20260928203447_reflink_v2_rural_first`.
- Re-read the connected Supabase migration ledger. It still reports exactly one applied migration: `20260928203447_reflink_v2_rural_first`.
- Re-listed Supabase branches. The only listed branch is non-persistent and data-free but reports the production project reference; it is not a separate synthetic integration environment. Existing project tables contain production records.
- Added a migration-governance regression test to prevent accidental fabrication of the missing historical migration.
- No database changes, test fixtures, branch creation, migration replay or ledger updates were performed. The next database test gate remains blocked pending a reviewed schema-only baseline export and an isolated synthetic environment.

## Receiving-facility realtime continuity — latest source changes

- Added a facility-scoped Supabase Realtime subscription for receiving users, filtered by the signed-in profile's `receiving_facility_id`.
- Referral insert/update/delete events trigger a refresh of the receiving queue, so cross-facility referral lifecycle changes can become visible without requiring a manual refresh.
- Subscription setup is skipped when there is no authenticated user or assigned facility; asynchronous setup is guarded against component unmount, and the channel is removed during cleanup.
- Channel error and timeout statuses are logged for operational visibility.
- Added `tests/receivingRealtime.test.js` to check facility scoping, refresh behavior, cleanup and unauthenticated/unassigned-profile guards. These are source-contract tests only; they do not establish that Supabase Realtime is enabled, correctly authorized by RLS, or operational in a live environment.

## PHC-to-receiving referral continuity — latest source changes\n\n- Extracted the referral journey timeline into `src/lib/referralTimeline.js` so milestone semantics can be unit-tested independently of the React view.\n- The PHC timeline now displays admission, discharge, counter-referral submission and formal referral completion as separate milestones. Discharge no longer appears as completed referral. The active milestone is derived from the actual lifecycle status (e.g. admitted → awaiting discharge; discharged → awaiting counter-referral), rather than simply selecting the first timestamp that is missing.\n- Added `completed_at` to the PHC referral projection so formal completion can be rendered from the server timestamp.\n- Expanded the referring facility's counter-referral summary to show treatment provided, further referral destination and additional notes alongside final diagnosis, outcome and follow-up instructions.\n- Removed the duplicate timeline instance from the PHC referral detail view.\n- Added `tests/referralTimeline.test.js` covering discharge/completion distinction, counter-referral timestamp, relationship result shape, lifecycle-aware active milestone and PHC projection/display contracts. Tests use synthetic referral examples.\n- Source-level review confirms the PHC query includes `completed_at`, one timeline instance remains, and all intended counter-referral feedback fields are rendered. Exact-HEAD CI has not yet been verified for this batch.\n\n## Hard release blockers

1. The connected production Supabase migration ledger records `20260928203447_reflink_v2_rural_first`, but its historical SQL source is missing from the current branch. The November proposal migrations are not recorded as applied.
2. No approved non-production Supabase environment with synthetic facilities, users and referrals is available. Do not create a billable branch or use production as a test database.
3. Proposed aggregate RPC, counter-referral RPC, outbox, acknowledgement hooks and notification-log grant migration have not been applied.
4. The notification inbox UI remains intentionally unmounted; the inbox table/RPC and RLS have not been validated. User-recipient eligibility requires an authoritative notification-duty assignment source; facility-wide fan-out is not approved.
5. The canonical create-user Edge Function source has not been deployed.
6. The legacy SMS endpoint has remaining delivery/idempotency and operational governance limitations. Exactly-once delivery is not claimed.
7. No full clinical, RLS, authenticated integration, accessibility or multi-browser acceptance has been completed.

## Next execution order

1. Verify exact-HEAD CI for the receiving-queue correction.
2. Complete receiving workflow review: acknowledgement, patient arrival, assessment save, admission, discharge, counter-referral and overdue handling; test invalid/no-op/retry cases without changing clinical decisions.
3. Review PHC-to-receiving lifecycle symmetry and ensure the referrer can track receiving-facility feedback and follow-up.
4. Add synthetic-data role/facility tests and establish a reproducible schema baseline when a non-billable approved environment is available.
5. Validate aggregate R-PHI RPCs and disclosure controls before connecting dashboard data.
6. Complete accessibility and supported mobile/browser testing.
7. Only after clinical, security and product-owner sign-off prepare a production release plan.

## Operating constraints

- Preserve the REFLINK identity, v2.0 referral workflows, clinical fields, existing role names and facility access model.
- Make incremental, reviewable commits on the working branch.
- Do not merge the draft PR or deploy to production during this work.
- Do not apply migrations, edit the production migration ledger, change RLS/ACLs, deploy Edge Functions, send SMS or configure a worker without the separate release gates.
- Do not create billable Supabase branches or paid infrastructure.
- Use synthetic data for all tests and demonstrations.
- Report CI, Preview and production states separately and only when verified.

## Latest continuation — migration dependency review (7 November 2026)

- Corrected the migration-governance regression assertion to check the explicit no-reconstruction/no-ledger-edit safeguard in the reconciliation plan.
- Corrected the synthetic referral lifecycle fixture so the expected active timeline milestone is undated at each state.
- The latest CI run for commit `0376cb2852cbe165cd85fcdd812c0f54cfbdcbd1` reported automated unit tests, lint and production bundle build passing; Chromium installation completed and browser test server startup was still in progress at the last check. This is not yet a complete CI pass.
- Added a source-only dependency and preflight review to `docs/MIGRATION_RECONCILIATION_PLAN.md`.
- Key finding: migration 001 drops and recreates `public.get_admin_referral_volume(date, date)`; dependent objects, callers, owner and grants must be inventoried and validated before execution. Five reporting RPCs also rely on the existing `public.is_administrator()` helper, which is not defined by the proposal migrations.
- Migration 007 explicitly depends on outbox migration 006. The notification-log ACL migration is a separate sensitive permission change requiring exact privilege and frontend-query validation.
- No SQL was executed, no production or shared-project database was used for testing, and no migration or deployment was applied.

## Latest continuation — exact-HEAD CI and aggregate disclosure review (7 November 2026)

- CI for commit `cf1c9f7639b7376725a97cd6b02da09aa34abe31` completed successfully: dependency installation/audit reporting, unit tests, lint, production bundle build, Chromium installation and real-browser offline queue tests all passed.
- Draft PR #1 remains open and unmerged. No Preview or production deployment is claimed.
- A focused source audit confirmed the reporting and counter-referral RPCs use `SECURITY DEFINER` with an empty search path and explicit execute revokes/grants. The five administrator reporting RPCs still rely on the externally defined `public.is_administrator()` helper; its authoritative definition, owner, security mode, search path and grants remain a required preflight.
- The notification outbox foundation uses SECURITY INVOKER routines, revokes browser-role access to its private tables/functions, and grants worker routines to `service_role`. The acknowledgement hook remains cancellation-only and does not infer recipients or dispatch notifications.
- **New disclosure-control finding:** the referral-volume RPC permits arbitrary overlapping date ranges up to 366 days, unlike the other aggregate summaries which require a complete calendar month. Repeated overlapping queries may allow differencing to recover suppressed small counts. This risk and the required fixed-period policy decision/tests are recorded in `docs/MIGRATION_RECONCILIATION_PLAN.md` section 10.
- No SQL, database ACL, RLS, production data, or frontend behavior was changed. No Supabase branch was created. Migration baseline and isolated synthetic database validation remain blocked.
- Documentation-only follow-up commit: `f9a5b3b750e92208eb8c6d93916de5c8fa6f380e`. Its CI must be polled before treating this commit as fully verified.

## Latest continuation — aggregate reporting disclosure-control hardening (8 November 2026)

- Closed a source-level disclosure inconsistency in the proposed R-PHI reporting migration: the referral-volume RPC previously allowed arbitrary windows up to 366 days while the other breakdown RPCs required complete calendar months.
- The proposed referral-volume RPC now rejects partial, rolling and overlapping windows and requires exactly one complete calendar month.
- The administrator report screen now defaults to the latest completed Africa/Lagos month, exposes previous complete-month shortcuts, and does not call aggregate RPCs for invalid periods.
- Added tests for Lagos-month calculation, year-boundary/leap-year behavior, the SQL guard and UI request gating.
- This remains a source-only mitigation. The November migrations are unapplied; no live Supabase schema, RLS, ACL, migration ledger, production data, Edge Function, SMS workflow or production deployment was changed.
- GitHub Actions quality run #707 (run ID `42466215027`) passed on exact source HEAD `fbeff4fad8ba30159721ddc1372a0dfe16185770`: dependency audit reporting, automated unit tests, lint, production bundle build, Chromium installation and real-browser offline-queue tests all succeeded.
- Vercel deployment `reflink-9yzjgkd1l-uthaibas-projects.vercel.app` reached READY for that same source HEAD. This is a branch deployment, not a production release.
- The current status-register update is documentation-only; no production database, production deployment, migration ledger or patient data was changed.

## Live Supabase gate recheck — 8 November 2026

- Supabase project is healthy, but the migration ledger still contains only `20260928203447_reflink_v2_rural_first`; the historical SQL source is still absent from the repository.
- The sole listed branch is non-persistent, data-free and references the same project as its parent. It is not treated as isolated migration-test staging.
- Security advisor: 2 RLS-enabled tables without policies, 5 authenticated-callable SECURITY DEFINER functions, and leaked-password protection disabled.
- Performance advisor: 16 unindexed foreign keys, 17 RLS init-plan warnings, 5 unused-index candidates and 4 multiple-permissive-policy warnings.
- These are read-only findings. No live schema, RLS, ACL, Auth setting, migration ledger, patient row or deployment was changed.

## Receiving assessment discharge-summary hardening — 8 November 2026

A focused workflow review found that the assessment form allowed a receiving clinician to select `discharged` directly from `under_assessment`, setting `discharged_at` and changing status without requiring the discharge diagnosis, condition at discharge or follow-up plan required by the separate inpatient discharge form.

### Source correction

- The assessment form now conditionally presents a discharge-summary section when the disposition is `discharged`.
- Discharge diagnosis, condition at discharge and follow-up plan are required in both browser validation and the save handler; discharge medications remain optional.
- The handler persists these fields with the discharge status and timestamp.
- Existing referral values are loaded when reopening an assessment, and the form state is reset after submission.
- Assessment progress reflects the additional required discharge fields when the discharged disposition is selected.
- Added a source-contract regression test covering required-field validation, persistence and conditional UI fields.

This is a source-level workflow completeness correction, not a clinical rule defining when discharge is appropriate. The receiving clinician remains responsible for the clinical decision. The source test does not establish database trigger behavior, authorization or persisted data integrity. No live database, clinical record, migration, notification or production deployment was changed.

## Receiving workflow handover and counter-referral queue correction — 8 November 2026

Two additional source-level defects were corrected during the receiving workflow review:

1. Direct discharge from the assessment form previously allowed a `discharged` status/timestamp without requiring discharge diagnosis, condition at discharge and follow-up plan. These are now conditionally required and persisted; discharge medications remain optional.
2. The receiving query projects `counter_referral:counter_referrals(*)`, a one-to-many PostgREST relation. An absent relation is represented as an empty array (`[]`), which is truthy in JavaScript. The queue's previous `!referral.counter_referral` checks therefore treated a discharged referral with no counter-referral as closed and omitted it from the pending counter-referral KPI. Added `hasCounterReferral()` to normalise object/array relation shapes and used it for both open-queue status and the pending KPI.

Regression tests now cover null, empty-array and populated-array relation shapes, including metric counts. These are deterministic application tests; they do not replace database relationship/RLS validation or a clinical workflow acceptance test. No production database, patient record, migration or deployment was changed.

## Receiving lifecycle verification — 8 November 2026

### Verified source behavior

- Receiving-facility actions use conditional status updates for acknowledgement (`sent`), patient arrival (`acknowledged`), assessment start (`patient_arrived`), assessment save (`under_assessment`), admission record save (`admitted`), and inpatient discharge (`admitted`).
- These updates request the changed row with `.select().maybeSingle()`; a stale/no-match result is surfaced to the user rather than reported as success.
- The counter-referral submission uses the `submit_counter_referral` RPC and checks the returned completion status before updating the UI. The migration source test checks facility ownership, discharged-only submission, row locking and retry behavior.
- Acknowledgement and patient-arrival timestamps are persisted. Assessment completion, admission and discharge timestamps are also persisted by their respective actions.
- The SMS request helper catches network and response errors so notification failure does not convert a successful acknowledgement into an unhandled promise rejection.

### Remaining lifecycle gap / release evidence needed

- Starting an assessment changes status to `under_assessment` but does not persist a distinct `assessment_started_at` timestamp. The timeline therefore shows the assessment as in progress without a start time. Do not add a new column until the authoritative production schema baseline and migration history are recovered and a safe migration can be validated.
- The application source does not itself insert rows into `referral_events` or `referral_updates` during these transitions. Whether database triggers or RPCs provide a complete immutable event history cannot be established from the available historical migration source. Verify this against the recovered schema and trigger definitions before claiming a complete audit trail.
- The lifecycle regression test is a source-contract test plus synthetic timeline test. It does not execute real Postgres concurrency, RLS, triggers or clinical acceptance workflows. Those remain blocked pending an isolated synthetic database environment and authoritative migration baseline.

### Exact-HEAD quality verification

- GitHub Actions run #731 (run ID `42467165513`) completed successfully on source commit `2c8b4757084eb6096577a47b75d2eeadf85a6a81`. All steps in the Build and lint job passed, including automated unit tests, lint, production bundle build, Chromium installation and real-browser offline queue tests.
- Vercel Preview for the same commit is READY at `https://reflink-i4l47hf1g-uthaibas-projects.vercel.app`. This is not a production deployment.
- PR #1 remains draft and unmerged. No live Supabase schema, RLS, ACL, migration ledger, patient data or production deployment was changed.

### Additional lifecycle gap — receiving-facility rejection

- The current receiving workspace source (`src/App.jsx`) contains no rejection/decline action, no rejection-reason capture and no rejected status transition in its referral lifecycle controls.
- This means the planned receiving-facility rejection workflow is not yet demonstrably implemented, despite the master plan requiring rejection with a documented reason.
- Do not add a guessed status or field: the authoritative historical schema/migration source is still missing, and the production migration ledger cannot safely be reconstructed from the live database. First recover the baseline and verify the allowed status values, reason field (or event design), RLS ownership rules and audit mechanism. Then implement the workflow with a conditional status update, mandatory reason, and an immutable event record in an isolated synthetic database.

## Database baseline reconciliation — fresh read-only cross-check, 8 November 2026

The next database-baseline stage now has a more precise metadata map. A fresh read-only Supabase inspection reconfirmed that the migration ledger contains only `20260928203447_reflink_v2_rural_first`, while the repository has no source for that historical migration. The only Supabase branch remains non-persistent and points to the production project, so it is not an acceptable synthetic integration environment.

### New verified findings

- The live referral status constraint has no `rejected` value. It permits `referred_again` and `cancelled`, which are not semantically equivalent to a receiving-facility decline.
- The live database already records status changes through `log_referral_status_change()` into `referral_updates`. The timeline should continue to use that status-history model unless a distinct event taxonomy is approved.
- The database also has row-mutation audit triggers on `referrals` and `counter_referrals`. They copy full OLD/NEW row JSON to `audit_log`, which creates a PHI minimisation, retention and access-review requirement.
- `referral_events` and `referral_feedback` have RLS enabled but no policies in the current catalog. They remain fail-closed; no broad policies were added.
- The live schema has no `assessment_started_at` column. No migration was drafted against the live project.

### Decision

The baseline is better documented but is **not yet reconciled or restorable**. Existing metadata exports are not a complete schema dump, and the historical migration source remains missing. Next implementation work is limited to source documentation and a reviewed synthetic-environment plan until an isolated database and authoritative baseline are available. No production schema, migration ledger, RLS policy, grant, Auth setting, patient row or deployment was changed.


## Accessibility source review — 8 November 2026

A bounded static review of `src/App.jsx` and the shared workspace styles was completed as the next UI/UX workstream. This is a source inspection, not a WCAG conformance audit or assistive-technology test.

### Positive evidence

- The application includes visible `:focus-visible` styling in the shared CSS.
- Reduced-motion preferences are respected by the workspace quality stylesheet.
- The inspected referral, discharge and counter-referral forms use explicit labels in the reviewed sections.
- Existing dynamic feedback includes selected `aria-live="polite"`, `role="alert"` and `role="status"` regions.

### Confirmed gap

- A source scan of `src/App.jsx` found no `aria-invalid` or `aria-describedby` attributes.
- Some custom validation messages are therefore not demonstrably associated with the exact field they describe, and invalid state is not consistently exposed programmatically. Native `required` validation and form-level alert messages do not replace field-level error association.
- The inspected counter-referral form has form-level alert/status feedback, but this review did not verify focus placement after failed submission or successful completion.
- No `<dialog>` or `aria-modal` pattern was found in `src/App.jsx`; any custom overlays elsewhere still need a separate focus-trap, Escape-key and focus-return review.

### Next safe implementation sequence

1. Inventory every form that performs custom validation and identify its control IDs, error conditions and existing message elements.
2. Add stable per-field error IDs, conditionally apply `aria-invalid`, and connect errors using `aria-describedby`; preserve visible error text and avoid duplicating announcements.
3. On failed submission, focus the first invalid field or a concise error summary with links to invalid controls; do not steal focus during ordinary typing.
4. Add component tests for error association, invalid-state removal after correction, keyboard submission and announcement behavior.
5. Run automated accessibility checks, then manual keyboard and screen-reader checks on the supported browsers and mobile layouts. Verify contrast and 200–400% zoom/reflow before claiming WCAG 2.2 AA conformance.

No application source, database schema, policies, patient data, deployment or production configuration was changed during this static review. Accessibility conformance is not claimed.


## Synthetic staging environment provisioning — 8 November 2026

The project owner approved creating a separate Supabase project, conditional on strict isolation from the existing REFLINK project. The requested target was `reflink-synthetic-staging` in the `reflink` organisation, region `eu-west-2`, using the Primary Supabase account.

- The quoted project cost was $0/month. The user's approval was obtained and the provider's cost-confirmation step completed.
- Supabase rejected project creation because the organisation owner has reached the Free-plan limit of two active projects.
- **No project was created.** No existing project was paused, deleted, upgraded or modified. No database, Auth, Storage, secrets, deployment or production configuration was changed.
- The staging requirement remains a hard release blocker. Do not repurpose the existing non-persistent branch: it references the production project and is not an independent synthetic environment.
- Safe next options are for the organisation owner to independently free an eligible project slot or approve a plan upgrade, after reviewing any billing implications. Do not pause or delete any existing project without explicit, project-specific approval.
- If a separate project becomes available, provision it with independent credentials and environment variables, synthetic-only facilities/users/referrals, and no production secrets or connection strings. Keep production migrations and deployment workflows disabled until staging baseline and tests pass.

The user explicitly conditioned approval on the new environment not affecting the existing project. This condition remains mandatory for any retry.


## Counter-referral form accessibility remediation — 8 November 2026

A focused source-level remediation was implemented for the custom validation paths in `CounterReferralForm`.

- Custom validation now records field-specific errors for final diagnosis, patient outcome and conditional further-referral destination.
- Each affected control exposes `aria-invalid` only while its field has an error and references the corresponding visible error message through `aria-describedby`.
- A failed custom validation focuses the first invalid control. Correcting a field clears that field's error association without clearing unrelated field errors.
- The form-level alert remains available for record-level and server/RPC errors; successful submission feedback remains a status message.
- Added `tests/counterReferralAccessibility.test.js` to assert field/error associations, invalid-state semantics, first-invalid focus and per-field error clearing.

This is a targeted source-contract regression test, not a rendered component test or assistive-technology test. The form uses `noValidate` so required-field checks consistently run through the field-associated custom validation and first-invalid focus path; required semantics remain exposed on the controls. Manual keyboard and screen-reader verification remains required. No referral lifecycle behavior, clinical validation rule, database, patient record, migration, deployment or production configuration was changed.


## Referral-form accessibility and focus-management remediation — 8 November 2026

### New referral form

- Added field-associated custom validation for patient identifier, age, sex, chief complaint, conditional “Other” chief complaint, urgency, receiving facility and emergency clinical findings.
- Added `aria-invalid` and `aria-describedby` associations with visible error text, and focus moves to the first invalid field in the form's visual order.
- Retained the prior validation constraints when moving the form to custom validation: age must be a whole number greater than or equal to zero; the conditional “Other” complaint remains required.
- Diagnosis-entry status, category and diagnosis now expose their own validation messages and receive focus in sequence.
- The form-level alert remains for record-level messages such as duplicate diagnosis and submission/server failures.

### Investigation result editor

- Attempting to classify a quantitative or blood-pressure result now runs the existing validation before accepting the status change.
- Invalid classification is blocked; the message is announced, associated with the status and relevant measurement controls, and focus moves to the missing/invalid measurement or reference range.
- Correcting a measurement clears the local validation message; the user can then retry the classification.
- No clinical reference threshold was added or inferred. Existing laboratory-range validation remains authoritative.

### Referral detail and inpatient view focus

- Source inspection found no actual `dialog`, `aria-modal` or `alertdialog` implementation in the reviewed `src/App.jsx` views. The selected referral and inpatient screens are conditional page-content views, not modal dialogs; a modal focus trap or Escape-to-dismiss behavior would be misleading without a genuine modal interaction model.
- Added focus movement to the referral detail or inpatient heading when those views open.
- On close, focus returns to the control that opened the view, or to the referral search field if the original trigger is no longer in the document.
- This is source-level focus management; real keyboard testing is still required.

Regression coverage is in `tests/referralFormAccessibility.test.js` and `tests/counterReferralAccessibility.test.js`. These tests assert source contracts and do not substitute for rendered interaction tests, manual keyboard checks or screen-reader testing.

## Supabase SECURITY DEFINER function review — read-only — 8 November 2026

Reviewed live definitions, ownership, function settings, execute ACLs, relevant RLS policy expressions and table RLS metadata for five advisor-flagged functions. No table rows, patient records, auth-user rows, audit-log rows, secrets or storage contents were queried. No database writes or configuration changes were made.

| Function | Authorization observed | Execute privilege observed | Assessment |
|---|---|---|---|
| `get_facility_user_count(uuid)` | Requires `auth.uid()`; administrator may query a facility; other callers are restricted to their own profile facility | authenticated, service_role; not anon/PUBLIC | In-function authorization present; empty `search_path` already set |
| `get_facility_user_counts()` | Requires administrator profile role before returning grouped counts | authenticated, service_role; not anon/PUBLIC | In-function authorization present; fixed `search_path=public` |
| `is_administrator()` | Returns whether the current auth user has the canonical administrator role | authenticated, service_role; not anon/PUBLIC | Boolean-only helper; fixed `search_path=public` |
| `log_referral_print(uuid,text)` | Requires a referral visible to administrator, referring user or receiving facility before inserting a print event | authenticated, service_role; not anon/PUBLIC | Participant check present; print-number allocation is race-prone |
| `log_referral_read(uuid)` | Requires a referral visible to administrator, referring user or receiving facility before writing a READ audit event | authenticated, service_role; not anon/PUBLIC | Participant check present; audit table RLS is enabled and SELECT policy is administrator-only |

All five functions are owned by `postgres`. The four functions with `search_path=public` schema-qualify the referenced application relations and `auth.uid()`; this reduces current name-resolution exposure, but Supabase's current guidance recommends `SET search_path = ''` for SECURITY DEFINER functions with all objects explicitly schema-qualified. The facility-count function already uses the empty path. No function is executable by `anon` or `PUBLIC`; `authenticated` and `service_role` are explicitly allowed. Relevant `profiles`, `referrals`, `referral_print_events` and `audit_log` RLS flags were enabled. The inspected referral access predicates for print/read logging correspond to the current participant model.

**Confirmed integrity issue:** `log_referral_print` allocates `print_number` using `MAX(print_number) + 1`. The inspected `referral_print_events` constraints contain no uniqueness constraint on `(referral_id, print_number)`. Concurrent print RPCs can therefore allocate duplicate sequence numbers. Recommend a transaction-safe allocation design plus a unique constraint, validated in isolated staging before any production migration.

**Disposition:** No immediate anonymous-execution or missing in-function authorization defect was demonstrated in these five definitions. Hardening opportunities remain: move the four mutable paths to empty `search_path`, verify exact role behaviour with positive/negative integration tests, and correct print-number concurrency. Do not blindly revoke grants or alter SECURITY DEFINER to INVOKER: these routines write protected audit/print tables and are used as privileged RPCs. All changes remain blocked on isolated staging and migration-baseline recovery.
