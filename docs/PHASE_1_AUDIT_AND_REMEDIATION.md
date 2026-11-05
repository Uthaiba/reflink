# REFLINK Phase 1 — Production Baseline and Remediation Record

**Baseline:** v2.0 production commit cce730ec64aa8be568021f16de4de47c110f81d5
**Working branch:** reflink/phase-1-security-remediation
**Scope:** Read-only inspection followed by narrowly scoped, non-schema source changes. Production database not modified.

## Executive summary
REFLINK is an existing React/Vite and Supabase referral-coordination application. The v2.0 production release—not the older main branch—is the source baseline for this work.
The release contains referral creation and processing, role-specific dashboards, referral analytics, a PWA shell, an IndexedDB referral queue, a Vercel SMS endpoint and a Supabase user-provisioning Edge Function.
The audit identified high-priority issues in browser logging, analytics privacy, RLS/administrator access, counter-referral workflow completeness, offline queue recovery and deployment/source drift.

## Verified production architecture
- React 19, Vite 8, JavaScript/JSX.
- Supabase Auth and PostgreSQL.
- Supabase Storage for investigation-result attachments.
- Supabase Edge Function for user creation.
- Vercel API route for SMS.
- Vercel production deployment from v2.0-release.
- PWA manifest and service worker.
- IndexedDB offline referral queue.

## Database inventory observed
The public schema contains 14 tables: facilities, profiles, referrals, referral_events, referral_feedback, referral_updates, feedback, users, referral_drafts, diagnosis_categories, referral_notifications, counter_referrals, audit_log and referral_print_events.
RLS was enabled on all 14 tables at inspection. referral_events and referral_feedback had no policies and no authenticated table grants in the inspected catalog. Do not add permissive policies without establishing whether these tables are used and defining their intended access model.
The live profiles.role constraint allowed administrator, phc_staff and receiving_staff. The deployed user-creation function accepted additional role strings, producing a role-model mismatch.
The referral status constraint included draft, sent, acknowledged, patient_arrived, under_assessment, admitted, discharged, referred_again, completed and cancelled. It did not include rejected.
The database had a counter-referral guard trigger requiring a structured counter-referral before completion.

## Priority findings
### P0 — Sensitive patient records logged in the browser
The production application logged referral datasets and realtime referral payloads under PHC REFERRALS, PHC REALTIME REFERRAL UPDATE and INCOMING REFERRALS.
Change made on this branch: removed four patient-payload/status console.log statements from src/App.jsx. Error logging remains for review; future error messages must not serialize sensitive records.

### P0 — Administrator access and aggregate analytics
The live RLS catalog did not show an administrator SELECT policy on referrals. Dashboard and analysis modules perform direct referral queries. The inspected analytics RPC had no EXECUTE grant to authenticated or anon.
Required: design an explicitly authorised server-side reporting interface returning aggregate-only data. Separately define, justify and audit any administrator access to individual clinical records. Do not add a blanket administrator policy just to make dashboard counts appear.

### P0 — Counter-referral component reference
The production App.jsx renders CounterReferralForm when a referral is discharged, but the tracked production source inventory did not contain a definition or import for that component. The database guard trigger requires a counter-referral before completion.
Required: implement and test a complete counter-referral form and transactional persistence path before changing the completion guard.

### P0 — Analytics export privacy
The current analysis/export path retrieves patient-level referral rows and can export direct identifiers and clinical details. It is not an appropriate public-health aggregate export.
Required: replace public-health exports with server-side aggregates, small-cell suppression, documented indicator definitions, coverage/quality metadata and explicit limitations. Keep identifiable operational reports separate and access-controlled.

### P1 — Offline queue protection and idempotent recovery
The IndexedDB queue stores referral payloads containing sensitive fields without application-level encryption. A lost response after successful insertion can leave a queued item retrying into a unique-key conflict without first reconciling the existing referral.
Required: define a device threat model, local retention/clearance policy, encryption/key lifecycle and server-side idempotent sync response. Do not claim browser storage is safe merely because it is local.

### P1 — Audit log minimisation
The referral mutation trigger stores full old/new row snapshots. These may duplicate patient identifiers and clinical information.
Required: move toward field-level change metadata and a carefully justified retention policy, preserving auditability without replicating entire clinical records unnecessarily.

### P1 — Notification reliability
The Vercel SMS route checks the authenticated user and facility/role context. Rate limiting, idempotency, delivery callbacks and durable retry handling need further work. The presence of an SLA notification type does not prove a scheduled escalation process exists.

### P1 — Role model and deployment drift
The deployed Supabase user-provisioning Edge Function differs from the committed function source and permits roles not allowed by the live profile constraint. A legacy users table and UserManagement.jsx path coexist with Auth/profiles.
Required: establish Auth/profiles as the single identity model; reconcile function source and deployed code; retire legacy user writes only after dependency review.

### P2 — PWA manifest linkage
The release already included public/manifest.webmanifest, but index.html did not link it.
Change made on this branch: added the manifest link and theme-colour metadata. Browser installability and offline behaviour still require real-device testing.

## Supabase advisor findings observed
- Two RLS-enabled public tables without policies.
- Five callable SECURITY DEFINER functions requiring individual review.
- Leaked-password protection disabled.
- Sixteen unindexed foreign-key warnings.
- Seventeen RLS initialisation performance warnings.
- Five indexes reported unused.
Advisor findings are prompts for review, not proof of exploitation. Index removal and policy rewrites require workload and access-model validation.

## Changes made on this branch
1. Removed four patient-data console logging statements from src/App.jsx.
2. Linked the existing PWA manifest in index.html and added theme-colour metadata.
3. Added this audit record.
No production database schema, RLS policy, patient record, storage object, secret, Edge Function or Vercel production setting was modified.

## Validation status
- Source changes were applied to a new branch created from the exact v2.0 production commit.
- Vercel preview build for commit 3ac2ccd9842b48a85ef686017c0fe017da9b5c4b completed with READY status.
- Automated lint, unit, integration, RLS and browser workflow tests have not yet been run.
- No claim of production readiness or legal compliance is made.
- The new branch must be reviewed and its Vercel preview validated before merge.

## Required acceptance gates
1. Build and lint pass.
2. No patient payloads or secrets appear in browser logs.
3. Role-specific RLS tests prove PHC, receiving facility and administrator boundaries.
4. Counter-referral can be created and referral completion succeeds only after valid feedback.
5. Rejection is implemented with a documented reason and controlled transition.
6. Analytics returns aggregate-only data and suppresses small cells.
7. Offline sync is idempotent and local data handling has an approved security design.
8. Auth, MFA, password protection, storage and privileged functions are reviewed.
9. Migration history is reproducible and tested against a non-production environment.
10. Vercel preview and supported mobile browsers pass end-to-end testing.

## Next implementation sequence
1. Run build/lint and inspect the branch diff.
2. Reconcile and repair the counter-referral UI and lifecycle.
3. Design RLS and aggregate reporting from the real role/facility relationships.
4. Reconcile the role model and deployed Edge Function.
5. Implement privacy-preserving analytics.
6. Strengthen offline queue security and idempotency.
7. Introduce migrations and automated security/workflow tests.
8. Proceed with the design-system and modular UI refactor.