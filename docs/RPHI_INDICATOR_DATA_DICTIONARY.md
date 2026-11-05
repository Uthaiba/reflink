# REFLINK R-PHI — Operational Data Dictionary and Indicator Registry

**Status:** Draft for clinical, public-health and data-governance approval  
**Schema inspection:** Read-only inspection of the connected Supabase production schema on 5 November 2026  
**Purpose:** Define a safe and reproducible path from referral workflow events to aggregate operational indicators. This document does not authorise production analytics access or data export.

## 1. Source-system boundary

The current source of truth is the operational referral record in `public.referrals`, supported by `public.counter_referrals`, `public.referral_events`, `public.referral_updates` and the facility registry in `public.facilities`.

The schema inspection verified the column names below. It did not inspect patient row values. A column's presence does not prove that it is consistently populated, semantically valid, or suitable for an indicator. Before an indicator is enabled, profile its completeness and timestamp ordering using synthetic data or approved, controlled aggregate queries.

## 2. Verified source fields and permitted use

### Referral workflow fields

| Field | Intended operational meaning | R-PHI use | Important caveat |
|---|---|---|---|
| `id` | Internal referral primary key | Internal joins only inside trusted aggregation | Never expose in report or export |
| `referral_number` | Human-readable referral reference | No aggregate output use | Treat as identifying |
| `created_at` | Referral creation timestamp | Cohort period for initiated-referral volume | Use Africa/Lagos reporting boundaries; validate timezone and late sync |
| `status` | Current workflow state | Current queue snapshot only | Not a complete historical event timeline |
| `acknowledged_at` | Acknowledgement timestamp | Acknowledgement timeliness | Null may mean pending, missing or workflow defect |
| `patient_arrived_at` | Arrival timestamp | Arrival confirmation and elapsed time | Does not prove assessment |
| `assessment_completed_at` | Assessment completion timestamp | Assessment completion and turnaround | Validate lifecycle and completeness |
| `admission_at` | Admission timestamp | Admission disposition | Do not infer acuity or outcome |
| `discharged_at` | Discharge timestamp | Discharge workflow timing | Distinguish discharge from final counter-referral |
| `completed_at` | Referral completion timestamp | End-to-end workflow completion | Completion definition depends on counter-referral guard |
| `referring_facility_id` | Sending facility reference | Facility-level aggregate dimension | Restrict geography and suppress small cells |
| `receiving_facility_id` | Receiving facility reference | Receiving-facility aggregate dimension | Do not expose facility-linked small cohorts |
| `referring_user_id` | User who initiated referral | No public-health dimension | User-level reporting is not permitted in R-PHI |
| `is_test` | Test-record marker | Exclude test rows from production indicators | Validate test-data governance |
| `sync_source` | Origin/sync metadata | Data-quality monitoring only after definition review | Do not infer offline status without a controlled value set |
| `ack_due_at` | Acknowledgement target timestamp | SLA denominator only after policy approval | Confirm business rule and historical coverage |

### Counter-referral fields

| Field | Intended use | R-PHI restriction |
|---|---|---|
| `referral_id` | Internal join to referral | Never expose |
| `receiving_user_id` | Audit/actor attribution | Never expose as an analytics dimension |
| `outcome` | Structured disposition category | Aggregate only after value-set governance and suppression |
| `created_at` | Counter-referral submission time | Aggregate turnaround only after workflow validation |
| `final_diagnosis`, `treatment_provided`, `follow_up_instructions`, `referred_further_to`, `additional_notes` | Clinical narrative | Prohibited from R-PHI aggregate API and AI prompts |

### Facility and profile fields

The facility registry contains `id`, `facility_type`, `state`, `lga` and `is_active` alongside direct contact and address fields. Only approved facility classifications and geography may be considered for aggregate grouping. Facility names, small-facility combinations and geographic intersections can still disclose sensitive information when counts are small.

Profiles contain identity/contact and role/facility assignment fields. R-PHI must not expose names, phone numbers, user IDs or user-level activity.

## 3. Prohibited analytics inputs and outputs

Do not send these fields to a browser analytics client, external AI model, public report, or downloadable R-PHI export:

- Patient identifier, referral number, patient phone, address, relative/contact names or phone numbers.
- Exact referral or user IDs.
- Chief complaint free text, clinical summary, physical findings, provisional/final diagnosis narrative, investigations, treatment, assessment findings, clinical feedback, admission/discharge narratives, medication details, follow-up notes, or JSON clinical records.
- Staff names, staff phone numbers, user IDs, or individual performance rankings.
- Exact event timestamps at row level.

A diagnosis category or structured outcome may be considered only after a clinical terminology owner approves the value set and a disclosure review approves the aggregation level. Free-text fields must never be transformed into categories by an unvalidated text classifier for production reporting.

## 4. Indicator registry — version 0.1

All indicators below are candidate definitions. The product must not display them as validated clinical or population-health measures until an accountable owner signs off.

| ID | Indicator | Numerator / measure | Denominator | Cohort and timestamp | Interpretation |
|---|---|---|---|---|---|
| RPHI-001 | Referrals initiated | Count of eligible referral IDs | None | `created_at` in period; exclude `is_test=true` | Platform activity only; not population need |
| RPHI-002 | Acknowledgement completion | Count with non-null `acknowledged_at` | Eligible referrals created in cohort whose acknowledgement observation window has elapsed | `created_at` cohort; outcome from `acknowledged_at` | Requires a defined follow-up window and late-arrival policy |
| RPHI-003 | Median acknowledgement time | Median of `acknowledged_at - created_at` for valid positive intervals | Referrals with both timestamps and valid ordering | Referral creation cohort | Report sample size and missingness; not a quality ranking |
| RPHI-004 | Arrival confirmation | Count with non-null `patient_arrived_at` | Eligible referrals expected to arrive and with observation window elapsed | `created_at` cohort | Does not prove assessment or treatment |
| RPHI-005 | Assessment completion | Count with non-null `assessment_completed_at` | Referrals where assessment is expected and observation window elapsed | `created_at` cohort | Requires approved exclusions and definition |
| RPHI-006 | Discharge counter-referral completion | Discharged eligible referrals with a valid linked counter-referral | All eligible discharged referrals whose counter-referral window elapsed | Discharge cohort using `discharged_at`; linked counter-referral presence | Workflow completeness, not clinical outcome |
| RPHI-007 | Further referral proportion | Counter-referrals with approved `outcome='referred_further'` | Counter-referrals with known, approved outcome | Counter-referral `created_at` cohort | Not avoidable-referral rate or facility quality |
| RPHI-008 | Referral completion time | Median of `completed_at - created_at` for valid positive intervals | Completed referrals with both timestamps | Referral creation cohort | Report distribution and censoring; not patient waiting-time standard without policy |
| RPHI-009 | Facility referral volume | Count of eligible referrals by approved facility role and reporting period | None | `created_at`; group by sending or receiving facility separately | Suppress small cells; never rank small facilities |
| RPHI-010 | Required-field completeness | Count with required field populated | Records expected to contain that field | Explicit field-specific cohort | Completeness is not clinical correctness |
| RPHI-011 | Timestamp chronology flags | Count of referrals with at least one lifecycle timestamp earlier than `created_at` | Eligible referral inception cohort | `created_at` cohort; compare acknowledgement, arrival, assessment and completion timestamps | Data-quality signal only; flagged timestamps are excluded from the corresponding lifecycle event counts |

### Cohort rules

- Prefer an inception cohort based on `created_at` for referral lifecycle rates. Do not mix referrals created in one period with outcomes occurring in another without clearly naming the cohort method.
- Use a fixed observation window for rate denominators. Records whose window has not elapsed are pending observation, not failures.
- For time-to-event indicators, include only valid timestamp pairs and publish the number excluded for missing or invalid timestamps.
- Do not use current `status` as a substitute for a historical event timestamp.
- For late offline synchronisation, retain the distinction between event time and server receipt time if the system later captures both. Do not silently rewrite cohort dates.
- Use Africa/Lagos calendar boundaries for Nigeria-facing reporting and store/compare timestamps consistently as timestamptz.

## 5. Disclosure-control policy

Initial default: suppress counts 1–4. Return a null value plus an explicit suppression flag; never return the underlying number in metadata, tooltip, downloadable filename or AI context.

This primary suppression rule is not sufficient by itself. Before adding filters or dimensions, implement and test:
1. Complementary suppression where a total and visible subgroups could reveal a suppressed cell by subtraction.
2. Minimum cohort sizes for cross-tabulations and geographic drill-down.
3. Query-rate and repeated-filter controls to limit differencing attacks.
4. Stable reporting periods and controlled dimension sets.
5. Export review and audit metadata.
6. A policy for zero counts, missing values, unavailable data and not-yet-observed cohorts.

Do not expose arbitrary SQL filters or user-selected combinations of facility, age, sex, diagnosis, urgency and outcome. Each additional dimension creates a disclosure risk.

## 6. Data-quality checks required before publishing

- Null and completeness rate for each timestamp and dimension.
- Negative or impossible timestamp intervals (acknowledged before created, arrival before created, assessment before created, completed before created, completed before discharge, etc.).
- Duplicate referral events and duplicate counter-referrals.
- Orphaned facility and counter-referral references.
- Inactive facility assignments and missing facility geography.
- Test-record exclusion consistency.
- Late-arriving offline sync and backdated events.
- Status/timestamp disagreement.
- Unexpected or unmapped outcome, urgency, diagnosis-category and sync-source values.
- Reporting coverage: active facilities expected to report versus facilities with at least one submitted record. Do not call this coverage unless the expected facility registry is authoritative.

Every report must show data freshness, reporting period, definition version, cohort size, excluded/missing records, suppression status and provisional/approved state.

## 7. Access and processing architecture

1. Referral records remain in the operational schema with existing RLS.
2. A server-side aggregation layer performs only approved grouping and calculations.
3. The aggregation layer returns a narrow response containing indicator ID/version, period, aggregate value or suppression marker, denominator, quality metadata and freshness.
4. The browser renders only this aggregate response; it must not fetch patient rows and aggregate them client-side.
5. Administrator and future programme/public-health roles must be separately defined. Administrator status must not silently grant patient-level access.
6. AI reporting, if later approved, receives only approved aggregates and indicator metadata, with human review before external release.

Before implementing a new RPC, review SECURITY DEFINER necessity, owner, EXECUTE grants, search_path, internal schema exposure, `auth.uid()` checks, RLS bypass, facility scoping and query-plan cost. Prefer SECURITY INVOKER or a non-exposed internal schema where feasible. A public RPC must be treated as an externally callable API endpoint.

## 8. Acceptance tests

- Counts 0, 1, 4, 5 and 6: 0 remains 0; 1 and 4 suppressed; 5 and 6 visible.
- Complementary suppression prevents deriving a hidden subgroup from totals.
- Invalid/reversed/overlong reporting periods are rejected.
- Test referrals are excluded consistently.
- Cross-facility grouping is only available to approved roles and only at approved geography.
- No patient/user IDs, contact data, free text, row timestamps or clinical narratives appear in the response.
- Missing timestamps do not become failures unless the observation window has elapsed.
- Late-arriving sync is reported transparently.
- Rate denominator and numerator use the same cohort and explicit observation window.
- AI/report export cannot recover suppressed values from hidden metadata or prompt context.

## 9. Sign-off required

| Owner | Required decision |
|---|---|
| Clinical governance lead | Approve lifecycle events, exclusions and clinical terminology |
| Public-health/M&E lead | Approve indicator definitions, denominators and interpretation |
| Data protection/security lead | Approve disclosure controls, access, retention and export |
| Facility representatives | Validate operational feasibility and data quality |
| Product owner | Approve scope, release gates and user-facing labels |

Until sign-off and non-production tests are complete, these definitions remain a governed draft, not validated programme statistics.
