# REFLINK master system audit — 10 November 2026

**Review branch:** `reflink/phase-1-security-remediation`  
**Production baseline:** `v2.0-release`  
**Pull request:** #1 — open, draft, unmerged  
**Production project:** `uwwzbljufqbzkjflpnll` — read-only review only  
**Synthetic staging:** `reflink-synthetic-staging` (`rcskuzmvyugbanygizri`)  
**Audit type:** source, repository, and read-only database/catalog review. This is not a full authenticated penetration test, clinical validation, or legal compliance assessment.

## 1. Executive status

REFLINK is an existing React/Vite/Supabase healthcare referral application with substantial implemented functionality. The transformation must continue incrementally from the current codebase; no rewrite is justified by this audit.

The repository contains the existing PHC and receiving-facility workflows, administrator workspace, encrypted offline referral queue, notification and reporting foundations, R-PHI indicator documentation, migration candidates, and automated tests. Several planned features remain source-only or unmounted, and the production schema is not yet reproducible from committed historical migrations.

The active staging project is healthy and isolated. A fresh read-only check confirms **zero public application tables and zero migration records**. It is available for reconstruction; it is no longer accurate to describe the staging environment itself as unavailable. No schema has yet been applied there.

## 2. Verified technical baseline

- Frontend: React 19, Vite 8, JavaScript/JSX (not yet a TypeScript application).
- Database/backend: Supabase PostgreSQL 17, Auth, Storage, Realtime and Edge Functions.
- Deployment shape: Vercel-style `api/referral-sms.js` serverless route and Vite frontend.
- Package scripts: `npm test`, `npm run lint`, `npm run build`.
- Working branch contains approximately 505 tracked files, including application source, migrations, verification SQL, tests and several large exported HTML/evidence assets.
- The repository README remains the generic React/Vite starter text and should be replaced with REFLINK-specific setup, architecture, security and deployment documentation.
- The database role constraint in the production export currently permits `administrator`, `phc_staff` and `receiving_staff`. Do not introduce a fourth `referrer` role without a reviewed identity/role migration and application contract.

## 3. Application source review

### Existing strengths

- The application is not a static prototype: `src/App.jsx` contains the PHC and receiving workspaces, referral creation, referral history, receiving status transitions, clinical assessment, admission/discharge and investigation-result workflows.
- The active application imports the professional theme and the branding, human-centred UX, dashboard, referral-detail, investigation-result and workspace-quality styles.
- `AdminDashboard.jsx` is mounted from the active application and uses aggregate reporting calls rather than a routine patient-level referral list.
- Offline referral storage is encrypted with AES-GCM; the key vault wraps the account key using PBKDF2-HMAC-SHA-256 (600,000 iterations) and AES-GCM. Queue records are account-scoped and encrypted before IndexedDB persistence.
- The frontend uses an explicit referral-create payload builder rather than spreading arbitrary decrypted queue objects into the insert.
- Referral timeline, urgency/overdue ordering, receiving metrics, R-PHI disclosure helpers and notification inbox adapters have isolated helper modules and automated tests.

### UI/UX and accessibility gaps

- Static source count in `App.jsx`: 19 `aria-invalid` and 19 `aria-describedby` attributes are present. This corrects the older status-register claim that these attributes were absent.
- `AdminDashboard.jsx` currently has no `aria-invalid` or `aria-describedby` attributes in the scanned source; administrator form validation needs the same field-level semantics.
- The active application source has no `role="dialog"`, `aria-modal` or native `<dialog>` markers in the scanned file. Referral detail panels include focus movement and focus restoration, but dialog semantics, focus containment, Escape behavior and screen-reader modal announcement still require review.
- The app has a large monolithic `App.jsx` (approximately 9,000 lines) containing multiple workspaces, workflows and data-access paths. Refactor by extracting stable, tested feature boundaries; do not perform a wholesale rewrite.
- Multiple additive CSS layers are active. Consolidate duplicated tokens and component rules only after visual regression coverage exists.
- No claim of WCAG 2.2 AA conformance is made. Contrast, keyboard-only flows, 200–400% zoom/reflow, focus visibility, touch targets, announcements and frontline usability remain to be tested.

### Diagnostics and error handling

Static source scan found 43 console calls in `App.jsx` and 8 in `AdminDashboard.jsx`. Several log raw Supabase/JavaScript error objects or error messages. The scan does not prove patient information is present in those objects, but raw diagnostic objects can disclose query, schema or operational details in browser consoles. Replace them with structured, sanitised event codes and generic user-facing errors; never log patient payloads, tokens, phone numbers, referral contents or provider diagnostics.

## 4. Database and security findings

### Schema snapshot

The supplied export checksum is `72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3` (64,434 bytes, 1,612 lines). The duplicate upload is byte-identical.

It contains 14 public tables, 16 public functions, 2 views, 10 explicit indexes, 23 foreign keys, 30 RLS policies, nine trigger definitions, and broad explicit grants/default-privilege statements. All 14 public tables have RLS enabled in production; none has FORCE ROW LEVEL SECURITY.

The nine trigger names in the export match the separate live trigger snapshot and the live production trigger catalogue. Older runbook text saying the export contains zero triggers is superseded and has been corrected.

### Effective table and sequence privileges — new live finding

A fresh read-only effective-privilege check on production found authenticated has `TRUNCATE`, `REFERENCES`, `TRIGGER` and PostgreSQL 17 `MAINTAIN` on **12 of 14 public tables**:

- `audit_log`
- `counter_referrals`
- `diagnosis_categories`
- `facilities`
- `feedback`
- `profiles`
- `referral_drafts`
- `referral_notifications`
- `referral_print_events`
- `referral_updates`
- `referrals`
- `users`

The two tables `referral_events` and `referral_feedback` have no authenticated table privileges and no RLS policies in the export. Preserve this fail-closed state; do not invent permissive policies.

Authenticated also has USAGE, SELECT and UPDATE on both `public.audit_log_id_seq` and `public.referral_print_events_id_seq`. An earlier structural-privilege proposal covered only four tables and omitted the audit log and other exposed tables. The proposal has now been expanded to cover the complete 12-table set and both sequences. This is a source proposal only; it has not been applied to staging or production.

The proposal deliberately leaves ordinary SELECT/INSERT/UPDATE/DELETE grants unchanged. Column-level write authorisation and operation-specific RPC boundaries are a separate workstream; this structural revocation does not by itself solve broad DML permissions.

### Supabase security advisor — production snapshot

The live security advisor currently reports:

1. Two RLS-enabled tables without policies: `public.referral_events` and `public.referral_feedback` (fail-closed, but should be documented and tested).
2. Five authenticated-callable SECURITY DEFINER functions: `get_facility_user_count(uuid)`, `get_facility_user_counts()`, `is_administrator()`, `log_referral_print(uuid,text)`, and `log_referral_read(uuid)`. These are not automatically vulnerabilities; each has an authorization contract and dependency graph. Preserve the 12 policy dependency entries for `is_administrator()`.
3. Supabase Auth leaked-password protection is disabled. This is a project-level setting and requires a separate controlled staging setting review before any production change.

### Other confirmed database risks

- `audit_referral_mutation()` stores full OLD/NEW referral rows as JSON in `audit_log`, duplicating patient identifiers, contact details and clinical information. Future audit writes need field minimisation, while historical audit records require a separate retention/redaction decision.
- `log_referral_read(uuid)` is a caller-reported event, not proof that a successful RLS-protected read occurred; it can be invoked repeatedly.
- `log_referral_print(uuid,text)` uses `MAX(print_number)+1` without row locking or a unique `(referral_id, print_number)` constraint. Concurrent print calls can race.
- Read/print receiving-facility checks compare facility IDs but do not explicitly require `receiving_staff` or an active assignment.
- The investigation-result Storage policies use broad referral/facility matching without an explicit role check. A clinical file lifecycle and access matrix is needed before changing them.
- Production default ACLs for `postgres` and `supabase_admin` broadly grant future objects in `public` to browser roles. The staging project has the same defaults. `postgres` has no membership in `supabase_admin`; do not assume a migration running as postgres can alter that role's defaults.
- The analytics base view includes patient identifiers and diagnosis fields and remains service-role-only. Do not expose it to browser roles.
- `handle_new_user()` exists in the public schema, but no non-internal trigger on `auth.users` was found in staging. Do not infer or create an Auth trigger from the function name; retrieve the exact production trigger contract first.

## 5. Referral engine and integrations

- The client lifecycle uses expected-prior-status filters and no-match handling for stale writes. These are useful client safeguards, not a replacement for transactional database enforcement.
- The structured counter-referral completion RPC is present in an unapplied proposal migration and requires synthetic database integration tests.
- Referral creation has a client allowlist and an unapplied database trigger proposal that derives the actor and facility from `auth.uid()`. Verify active sender and destination facilities, offline idempotency, service-role bypass paths and tampered PostgREST payloads in staging.
- The SMS API checks bearer identity and caller role/facility, but the current send/log sequence can result in a delivered SMS followed by a failed database log write and a retry. No exactly-once delivery guarantee exists. A durable outbox and idempotency/claim contract are required before SMS is treated as a critical reliable alert.
- The in-app NotificationCenter component and inbox adapter exist, but the component is not yet mounted and the proposed inbox table/RPC are not approved/applied.
- R-PHI disclosure helper and indicator dictionary exist. Aggregate RPC migrations are proposals; denominator quality, cross-filter differencing, disclosure control and public-health governance still need validation. Referral counts must not be described as population incidence/prevalence.
- FHIR and DHIS2 remain architecture considerations; no live interoperability is claimed.

## 6. Staging readiness — verified 10 November 2026

The Supabase project `rcskuzmvyugbanygizri` (`reflink-synthetic-staging`) is ACTIVE_HEALTHY on PostgreSQL 17.11. It has:
- 0 public application tables.
- 0 public migration records.
- No non-internal trigger on `auth.users`.
- No current Supabase security or performance advisor lints on the empty public schema.

However, its public-schema default ACLs are broad for both `postgres` and `supabase_admin`, and managed schemas also have platform ACLs. Do not change managed schemas as part of REFLINK application reconstruction. Before creating public objects, establish the authorised creator role and a reviewed least-privilege default-ACL strategy. The staging baseline must omit the production export's broad browser-role default grants and must not attempt to modify `supabase_admin` defaults without the required owner authority.

## 7. Verification and delivery status

- GitHub Actions run `42767135987` passed on commit `58ac892a47ddc57a67c90d3f51c82085545a877b` (tests, lint, build and Chromium offline-queue browser tests).
- The expanded structural-privilege proposal and its updated test are newer commits; exact-HEAD CI must complete before marking them verified.
- PR #1 remains open and draft, targeting `v2.0-release`.
- No production DDL, DML, grants, RLS, Auth settings, Storage policies, secrets, SMS dispatch, or production deployment was changed.
- No staging DDL or migration was applied in this audit.

## 8. Priority sequence

1. Complete and verify the expanded privilege proposal with exact-HEAD CI.
2. Resolve staging public default ACLs for the approved object-creating role without modifying managed-schema defaults or claiming authority over `supabase_admin`.
3. Build a dependency-ordered public-schema baseline from the checksum-verified export, with nine triggers, reviewed grants, and no production patient data.
4. Apply only to the isolated empty staging project; verify object counts, RLS, grants, views, functions, triggers and Supabase advisors.
5. Run synthetic PHC Facility A, PHC Facility C, receiving Facility B, receiving Facility D, unrelated authenticated and administrator tests, including concurrency and direct PostgREST attempts.
6. Complete column-level authorisation, profile-role delegation, audit minimisation, Storage access and SMS outbox reviews.
7. Continue UI extraction/design-system consolidation and accessibility testing.
8. Integrate R-PHI analytics only after data-quality, privacy and public-health governance gates.
9. Complete offline/browser field validation, then interoperability design and deployment/recovery rehearsal.

**No production release or clinical deployment is approved by this audit.**
