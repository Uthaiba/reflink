# Synthetic referral acceptance and print correction

User-operated staging screenshots for RF-2026-117770 demonstrate creation at PHC A, receiving-facility acknowledgement, arrival, assessment, admission, saved admission re-open, discharge, and subsequent PHC visibility of clinical feedback and discharge/follow-up details. These are manual observations for one synthetic case, not full authenticated acceptance or authorization testing.

The supplied five-page PDF had three blank pages, missing facility names, missing admission/discharge/follow-up details, and a continuity diagram without event times. The data remained visible in the application. Discharge was incorrectly presented as formal referral completion in the timeline, and the receiving list excluded discharged records without a history selector.

## Changes

- Body-level printable portal and print-only layout reset remove hidden dashboard space from pagination.
- Both dashboard queries include both facility relations; draft printing resolves selected facilities from its existing list.
- Saved admission and discharge fields, follow-up and separate recorded lifecycle timestamps are included in print. Historical assessment disposition is explicitly labelled.
- Receiving staff can select active, discharged/completed, or all already-authorized referrals. Closed records expose review/print and no investigation editing controls.
- Discharge and formal completion remain distinct events. No clinical values or lifecycle state are changed by these presentation fixes.

## Verification

114 local unit tests passed; local frontend build and lint passed (existing warnings remain). Local Chromium could not start because the workspace denies its process socket. A synthetic-only Chromium/PDF test is included in the existing frontend CI workflow. It checks actual PDF text, populated pages, facility names, saved inpatient/discharge fields, timestamps, closure semantics and exclusion of screen content. Its result must pass before preview acceptance is claimed.

## Still open

The earlier acknowledgement logout remains unexplained. Staging initially had no diagnosis categories; one synthetic Injury / Trauma category was inserted during testing, not a complete clinical catalogue reconciliation. Outsider authorization, attachments, correction workflows, formal follow-up/closure and full production restore/release acceptance remain open. Production has not been changed.

## Manual acceptance continuation — 18 November 2026

User-operated synthetic staging checks for RF-2026-117770 confirm two-page printing, receiving access to the discharged record, a view-only discharged receiving screen, PHC visibility of discharge feedback, and an empty outsider referral list. The user reports no referral details after sign-out/Back/refresh, including Back from an open record. These are manual UI observations, not direct API/RLS/storage authorization certification.

The PHC detail screen rendered ReferralTimeline twice, before and after ReferralSourceDetails. Removed the second rendering; the receiving timeline and print timestamp table remain intact. Validation and deployment of this change must be tracked separately from the earlier preview.

Closure inspection: src contains no call to submit_counter_referral. The recovered 20261110182502 function restricts submission to assigned receiving_staff and completes a discharged episode after final counter-referral feedback. It does not implement PHC follow-up confirmation. The current UI exposes neither that submission nor a separate PHC follow-up workflow. Do not equate discharge or displayed follow-up instructions with performed follow-up. Before connecting closure, review the live function and subsequent guards, strengthen current session/account/password and replay checks as needed, and test the authenticated receiving/PHC/outsider paths. No closure function, status, grant or hosted record was changed in this fix.
