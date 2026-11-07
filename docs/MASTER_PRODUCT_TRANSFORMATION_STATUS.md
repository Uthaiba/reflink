# REFLINK Master Product Transformation — Status Register

**Last reviewed:** 7 November 2026  
**Production baseline:** `v2.0-release` at `cce730ec64aa8be568021f16de4de47c110f81d5`  
**Working branch:** `reflink/phase-1-security-remediation`  
**Current reviewed HEAD:** `f99bf38e006547bf02e501cae4b62983edfdabaf`  
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
| 4. Referral engine | Partial | Existing referral lifecycle retained; structured counter-referral form and proposed atomic completion RPC; receiving assessment, admission/discharge and investigation result workflows; acknowledgement/arrival actions and audit history retained. | Clinical acceptance testing for every transition; validate correction/audit controls; test concurrency, duplicate submissions, referral escalation, rejected/declined workflow under clinical governance, follow-up and end-to-end closure. |
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

**Validation:** the preceding receiving-queue commit `5098ee1b3fc58ff6e976d6ff73fab63dcda1b71a` passed GitHub Actions workflow #625, including unit tests, lint, production bundle build and Chromium offline-queue browser tests. Vercel's status check was successful for that commit. The subsequent lifecycle compare-and-set changes documented below are newer and require their own exact-HEAD CI run; no Preview deployment is inferred from the earlier status.

## Receiving lifecycle concurrency protection — latest source changes\n\n- Added expected-current-status filters to all six receiving-facility update handlers: acknowledgement (`sent`), patient arrival (`acknowledged`), assessment start (`patient_arrived`), assessment save (`under_assessment`), admission save (`admitted`) and discharge (`admitted`).\n- Changed these update responses to `maybeSingle()` and treat a no-match as a stale referral rather than reporting success. The user receives a clear instruction to refresh and review the current status before retrying.\n- Added `tests/referralLifecycleConcurrency.test.js` to assert each handler's expected-status guard, no-match handling and stale-state message. These are source-contract tests, not concurrent PostgreSQL integration tests; server-side atomicity and trigger behavior still require synthetic-database validation.\n\n## Hard release blockers

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
