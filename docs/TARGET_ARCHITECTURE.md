# REFLINK — Target Architecture (Incremental Evolution)

## Design rule
Preserve the current React/Vite, Supabase and Vercel product. Extract responsibilities gradually. Do not rewrite the clinical workflow until parity tests exist.

## Proposed logical modules
src/
  app/ (App.jsx, routes, providers, access)
  features/ (auth, referrals, facilities, notifications, administration, analytics, public-health-intelligence, reports)
  shared/ (components, forms, tables, feedback, design-tokens, hooks, utils)
  lib/ (supabase.js, offline, security, telemetry)
  styles/ (tokens.css, base.css, components.css, layouts.css)
supabase/ (migrations, functions, tests)
api/ (referral-sms.js)
docs/

This is a target structure, not a direction to move every file immediately. Migrate one feature at a time and preserve imports/behaviour with tests.

## Trust boundaries
1. Browser: presentation, input validation and non-sensitive UI state. Never trusted for authorisation.
2. Supabase Auth: authenticated identity.
3. PostgreSQL/RLS: authoritative row-level access and workflow invariants.
4. Server-side functions: privileged operations, SMS dispatch, aggregate analytics and idempotent offline sync.
5. Storage: private objects with referral/facility-scoped access.
6. Analytics: aggregate, de-identified outputs only; separate from operational clinical access.

## Identity and role model
Use Supabase Auth user ID as the identity key and profiles as the authoritative application profile. Define the supported role set once and enforce it consistently in the profile constraint, user-provisioning function, frontend route guards, database policies, tests and documentation.
Do not authorise from user-editable user metadata. Do not trust hidden navigation or disabled buttons as security controls.

## Referral lifecycle
Keep workflow transitions in a central domain service and database validation: draft, sent, acknowledged, patient_arrived, under_assessment, admitted/discharged, counter-referral recorded and completed.
Add rejected only through an explicit migration and a defined transition matrix. Every rejection needs an authorised actor, timestamp and structured reason. Keep cancellation distinct from rejection.
All writes should be auditable and correction-oriented; completed clinical records should not be silently overwritten.

## Public Health Intelligence (R-PHI)
Data flow: clinical referral data → access-controlled aggregation → disclosure control → indicator registry → aggregate API → dashboards/reports → human review.
Every indicator should define numerator, denominator (if applicable), inclusion/exclusion rules, time window, source fields, refresh cadence, coverage, missingness and interpretation limits.
Referral counts are not population incidence or prevalence. Small cells and rare combinations require suppression. Do not release patient-level rows to the analytics client.
AI reporting should only consume approved aggregates and indicator metadata. It must cite the underlying period, filters and aggregate values, mark uncertainty and require human approval. It must not diagnose, prescribe or confirm outbreaks.

## Offline design
Use IndexedDB only with a documented device threat model. Minimise cached patient fields, protect local data where feasible, define expiry/clearance, and avoid caching authenticated clinical API responses in the service worker. Sync requests need a stable idempotency key and a server response that can reconcile a previously committed request after a client timeout.

## Interoperability
Add adapters only after local data definitions and governance are stable: FHIR resources and profiles for referral-related exchange; DHIS2 aggregate indicator exchange where institutions approve; facility identifiers and diagnosis classifications with controlled mappings.
Do not replace national health information systems. Interoperability is a governed integration, not just an export button.

## Quality gates
Every feature should include unit tests for domain logic, integration tests for database operations, RLS tests for each role and facility boundary, workflow tests for permitted and forbidden transitions, accessibility and responsive checks, failure/offline/retry tests, and migration rollback and backup/recovery review.