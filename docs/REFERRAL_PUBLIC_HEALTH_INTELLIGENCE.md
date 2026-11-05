# REFLINK Referral-Based Public Health Intelligence (R-PHI)

## Purpose

R-PHI is the public-health intelligence layer of REFLINK. It uses the operational referral pathway to produce timely, privacy-preserving information about service demand, referral completion, facility coordination and system bottlenecks. It is not a replacement for DHIS2, a national health information system, a disease surveillance authority or a clinical record.

The source of truth remains the authorised referral record and its auditable lifecycle. R-PHI consumes governed, minimised aggregates from that workflow.

## Product principles

1. **Referral-first:** indicators must arise from actual referral events and documented workflow states.
2. **Aggregate by default:** public-health dashboards must not expose names, phone numbers, patient identifiers, addresses, free-text notes or row-level clinical narratives.
3. **Purpose limitation:** operational care coordination and public-health reporting are separate access purposes and separate views.
4. **Small-cell protection:** suppress counts from 1–4 by default; assess complementary suppression and differencing risk before enabling multiple filters or drill-downs.
5. **Denominator discipline:** every rate must display its numerator, denominator, reporting period, inclusion criteria and data-quality caveats.
6. **No unsupported inference:** referral activity is not population incidence, prevalence, disease burden or unmet need unless an approved denominator and validated method exist.
7. **Human accountability:** AI may help draft explanations from approved aggregates; it must not diagnose, triage, prescribe, accept/decline referrals or autonomously alter clinical records.
8. **Rural resilience:** design for intermittent connectivity, delayed synchronisation, incomplete reporting and facilities with low digital capacity.
9. **Interoperability by governance:** exchange data only through documented, approved interfaces and minimum necessary datasets.

## Initial indicator catalogue

These are candidate operational indicators. They require clinical/public-health owner approval, data-quality review and validation before being labelled production indicators.

| Indicator | Numerator / calculation | Denominator / cohort | Interpretation limit |
|---|---|---|---|
| Referrals initiated | Count of non-test referrals created in period | None | Measures platform-recorded activity, not population need |
| Referral acknowledgement rate | Referrals acknowledged within defined window | Eligible referrals sent in period with complete follow-up window | Requires a governed acknowledgement SLA and exclusion rules |
| Median acknowledgement time | Median time from sent to acknowledged | Referrals with both timestamps | Exclude or separately report incomplete timestamps |
| Arrival confirmation rate | Referrals with patient arrival recorded | Eligible acknowledged referrals | Does not prove clinical assessment or treatment |
| Assessment completion rate | Referrals with assessment completion timestamp | Referrals where assessment was expected and follow-up window elapsed | Define observation and emergency pathways separately |
| Discharge counter-referral completion | Discharged referrals with valid counter-referral | All discharged referrals eligible for counter-referral | A missing counter-referral may reflect workflow or connectivity failure |
| Further referral proportion | Counter-referrals with outcome referred_further | Counter-referrals with known outcome | Not a measure of avoidable referral or facility quality |
| Referral cancellation proportion | Cancelled referrals | Referrals initiated in the same cohort | Reasons must be structured and reviewed |
| Facility referral volume | Count grouped by facility and period | None | Suppress small cells; distinguish sending from receiving facility |
| Data completeness | Records with required fields populated | Records expected to contain those fields | Report field-level completeness; do not imply clinical correctness |

### Required metadata on every report

- Reporting period and timezone (Africa/Lagos for Nigeria-facing reports).
- Date the report was generated and data freshness / last successful sync.
- Indicator definition and version.
- Numerator, denominator and exclusions where applicable.
- Number of facilities reporting and expected facilities, when a reliable registry exists.
- Missingness, late-arriving records and known coverage limitations.
- Suppression status and reason.
- Whether values are provisional or approved.

## Dashboard boundaries

### Referring facility / PHC workspace

- Create and track referrals initiated by the signed-in user's facility.
- Show status, acknowledgement, arrival and feedback relevant to that referral.
- Show facility-level operational summaries only where the user is authorised.
- Do not show another facility's identifiable patient record.

### Receiving facility workspace

- Manage referrals assigned to that facility.
- Record acknowledgement, arrival, assessment, admission/discharge and structured counter-referral feedback.
- Show queue and turnaround indicators for its own authorised workflow.
- Do not permit silent closure, deletion or reassignment of a patient's referral.

### Administrator workspace

- Manage user accounts and facility configuration through audited, least-privilege server-side actions.
- See platform-wide aggregate indicators, not patient-level referral rows by default.
- User-management access does not imply access to clinical narratives.
- Require reason, actor and timestamp for sensitive administrative actions; prevent self-promotion and protect the last active administrator.

### Public-health / programme workspace (future governed role)

- Access approved aggregate reports at authorised geography and period.
- No row-level patient drill-down.
- Export only de-identified aggregates with disclosure controls.
- Access must be explicitly provisioned and audited; do not silently reuse administrator privileges.

## AI-assisted reporting boundary

AI reporting is a later, controlled capability. Before implementation:

1. Approve the indicator catalogue and data dictionary.
2. Create a server-side aggregate dataset with explicit access rules.
3. Remove direct and indirect identifiers before any model input.
4. Use only approved aggregate values and metadata; do not send free-text clinical notes or patient records.
5. Require the model to cite the indicator names, periods and source aggregates used.
6. Require a human reviewer to approve any report before external circulation.
7. Label uncertainty, missing data, suppression and non-representative coverage.
8. Log report metadata and reviewer decisions without storing unnecessary patient-level data.
9. Prohibit diagnosis, prescribing, automated triage, referral acceptance/decline and autonomous clinical action.

If an aggregate is suppressed, the model must not infer or reconstruct it from other filters or contextual information.

## Privacy and disclosure controls

- Use a dedicated aggregate query/RPC or materialised aggregate pipeline, not browser-side filtering of patient rows.
- Keep role-specific operational queries separate from public-health reporting.
- Suppress counts 1–4 as an initial default; consider complementary suppression when totals could reveal suppressed values.
- Limit combinations of filters, export dimensions and repeated queries that could reveal small groups.
- Do not expose free-text values in aggregate endpoints.
- Do not treat pseudonymised or hashed patient identifiers as anonymous data.
- Define retention, access logging, report sharing and incident response before production release.

## Interoperability roadmap

Interoperability is not enabled merely by adding a format label. Each interface requires an approved data-sharing purpose, data dictionary mapping, consent/legal basis where applicable, security review, receiving-system agreement, test environment and operational support.

Potential standards to evaluate with stakeholders:

- HL7 FHIR resources for referral/service-request and encounter-related exchange, with a locally governed implementation guide.
- DHIS2 aggregate indicator exchange for approved programme reporting.
- Facility and service directories using stable identifiers and controlled terminology.
- CSV only as a constrained, documented aggregate export where a receiving partner cannot support an API.

Do not claim live FHIR or DHIS2 integration until a real endpoint, mapping, authentication, test evidence and partner approval exist.

## Release gates

R-PHI must not be enabled in production until:

- Indicator owners approve definitions and limitations.
- Aggregate data access is tested against each role.
- Small-cell and differencing tests pass.
- Exports contain no direct identifiers or clinical free text.
- Data freshness, completeness and missingness are visible.
- AI reporting (if enabled) is limited to approved aggregates and requires human approval.
- Interoperability claims are backed by a tested, approved interface.
- Monitoring, audit, retention and incident response are documented.

## Current implementation status

As of 5 November 2026, R-PHI is a product/architecture specification, not a deployed analytics service. The current development branch includes a proposed administrator-only aggregate referral-volume RPC with a 1–4 small-cell suppression rule. That migration is not applied, and the RPC has not been integration-tested. No AI reporting or FHIR/DHIS2 integration is claimed.
