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
| 2. Design system and UI/UX | Partial | Responsive workspace styling, administrator workspace, PHC/receiving layout refinements, PWA metadata, focus-state and service-worker cache improvements. | Consolidated tokens/components; complete WCAG 2.2 AA review; consistent tables, forms, modal, notification, loading/empty/error states; usability testing with frontline staff. |
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
