# REFLINK master-plan audit and continuation register

Audit date: 16 November 2026. Source baseline: `5082fa02095ede8715c44cb3c33d1875145b17a3`, draft PR #3.
This register reconciles the user's complete master product transformation plan with
the current repository and fresh read-only database catalog evidence.

## Evidence boundary

Inspected the recursive repository tree, main application, all three dashboard
implementations, user-management implementation, browser Supabase configuration,
Edge Function source, attachment/analytics helpers, tests, CI workflow, existing
audit documents, and production/staging schemas, constraints, foreign keys,
indexes, grants, RLS policies, function bodies and triggers. Inspected private
attachment bucket configuration, migration ledgers, deployed Edge Function
metadata, staging change-password source and security/performance advisors.
Vercel identifies the connected project as a Vite project.

No clinical rows, patient files, auth-account records or secrets were queried.
No database, Auth configuration, function deployment, production settings or live
deployment was changed. SQL inspections read system catalogs and bucket configuration.
Database definitions are evidence of configured behavior, not authenticated
integration-test results. Source review is not a visual or accessibility audit.
The local execution/browser environment is unavailable; runtime checks remain open.

## 1. Existing architecture and capabilities

- React/Vite frontend, JSX rather than TypeScript. Browser configuration uses
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the reviewed browser client
  does not embed a service-role key.
- `src/App.jsx` has 7,609 lines at this baseline and contains authentication,
  password changes, state-based navigation, PHC referral creation/listing,
  receiving workflows, clinical result editing and print layouts.
- `AdminDashboard.jsx` has 2,946 lines and handles operational summaries,
  facilities and profile administration. `AnalysisHub.jsx` has 2,969 lines;
  `AnalyticsDashboard.jsx` has 436. Several large CSS files overlap.
- The repository has one frontend CI workflow running locked dependency install,
  lint, Node tests and build, with no deployment step. At baseline, runs #64/#65
  passed and all 20 tests passed. These are unit/build results only.
- Source implements role-specific PHC, receiving and administrator experiences,
  search/filtering, printable clinical records, referral status actions,
  assessment/admission/discharge documentation and attachment recovery warnings.
  Their full authenticated lifecycle is not certified by those unit tests.
- State-based screen navigation is not a route architecture with demonstrated
  deep-link restoration. The auth listener explicitly handles password recovery;
  comprehensive session expiry/revocation handling still needs testing.
- The baseline tree has no tracked migration sequence under
  `supabase/migrations`, PWA manifest or service worker. It contains downloaded
  HTML/browser asset directories unrelated to application source; review and
  remove them separately after checking for sensitive content.

## 2. Verified database inventory and relationships

Both projects have these 14 public tables, all with RLS enabled:

`audit_log`, `counter_referrals`, `diagnosis_categories`, `facilities`,
`feedback`, `profiles`, `referral_drafts`, `referral_events`,
`referral_feedback`, `referral_notifications`, `referral_print_events`,
`referral_updates`, `referrals`, `users`.

- `profiles.id` references Auth users; `profiles.facility_id` references facilities.
- Referrals reference referring/receiving facilities and a referring profile.
- Events, feedback, updates, notifications, counter-referrals and print events
  reference referrals; multiple child relationships cascade on referral deletion.
- `counter_referrals.referral_id` is unique.
- `users` is a separate directory with its own generated ID, email, role and status.
  It is not interchangeable with Auth/`profiles`.
- Profile roles are constrained to `phc_staff`, `receiving_staff`,
  `administrator`. The directory's default `referrer` role is not an accepted
  login profile role. Existing user counts must be reconciled by environment and
  identity source; do not recreate missing accounts based on an empty UI.
- Both schemas store diagnosis/investigation JSON alongside legacy scalar fields.
  There is no investigation revision column or atomic result-edit RPC in the
  inspected public/private function inventory.
- Lifecycle constraints allow draft, sent, acknowledged, patient_arrived,
  under_assessment, admitted, discharged, referred_again, completed, cancelled.
  Acceptance/rejection with reason is not a distinct implemented state contract.
  Do not invent a rejected count or silently equate cancellation with rejection.

## 3. Production versus synthetic staging

| Area | Production | Synthetic staging |
| --- | --- | --- |
| Project | `uwwzbljufqbzkjflpnll` | `rcskuzmvyugbanygizri` |
| Migration ledger | 1 entry | 22 entries |
| Public views | 2 legacy analytics views | 2 legacy analytics views plus monthly public-health aggregate |
| View security option | no explicit invoker option | `security_invoker=true` |
| Investigation storage | private, 10 MB MIME allowlist | private, same limit/allowlist |
| Object policies | SELECT/INSERT plus broad participant UPDATE/DELETE | SELECT/INSERT only |
| PHC registration RPC | absent | `register_referral_investigation_files` present |
| Reporting RPCs | limited legacy summary | additional admin monthly/facility/pathway/coverage/delay RPCs |
| Deployed Edge Functions | create-user v2 | create-user v5 and change-password v4 |
| Clinical audit snapshots | full old/new row JSON | sensitive fields removed |
| Referral update grants | broad authenticated column access subject to RLS | restricted clinical update columns |

The ledger is not a full inventory: the staging registration RPC is present even
though its deployment is not a separately named entry in the returned ledger.
Reconcile actual definitions and source, not just migration counts. No staging
change should be copied directly into production.

## 4. Findings and priorities

### High: clinical attachment update integrity

Receiving attachment/result handlers read and then replace an entire investigation
array. Another writer can update it between these requests. No expected revision,
stable per-item database identity or transactional idempotency contract exists.
The browser's stale-data warning does not provide atomicity.

PHC creation uploads files and then attempts a direct referral UPDATE. Both
environments' UPDATE policy only admits assigned receiving staff. A PHC metadata
update may therefore affect zero rows without a useful error; the current PHC
path does not request affected rows. Staging has a PHC registration RPC, but the
frontend does not use it and production lacks it. The staging RPC also treats
existing file-path keys as immutable; normalization currently creates empty path
keys, so its compatibility must be resolved before wiring it.

Preserve uploaded documents. Implement the previously specified atomic result
update/upload-intent protocol only after baseline reconciliation, authorization
review and synthetic concurrency tests. Do not enable orphan deletion.

### High: completed clinical records remain editable

The status-transition trigger rejects transitions out of closed states, but returns
early when the status is unchanged. The inspected referral UPDATE policy is scoped
to receiving facility, not open clinical state. Together these do not establish
immutability of clinical fields after completion. A controlled correction RPC,
reason, actor and immutable revision history are needed before claiming protection.

### High: production storage allows mutation/deletion

Production's participant UPDATE/DELETE object policies can permit document
replacement or deletion through storage APIs even though the updated browser uses
immutable uploads. Frontend behavior does not remove those permissions.
Prepare reviewed retention/correction policies and test direct API access before
changing production. Staging's stricter policies are not proof of production safety.

### High: password-change workflow disagrees with staging security

The frontend calls Auth `updateUser`, then directly clears the profile flag,
without inspecting the returned profile-update error. Staging's profile trigger
forbids a non-admin from changing that flag; staging instead has a server
`change-password` function. Production does not have that function. The browser
can report success while the required flag remains set, and recovery sessions may
have no loaded profile ID. Implement an explicit environment-capability contract
and test first-login/reset/retry flows; do not remove the security trigger.

### High: reporting privacy and completeness

`AnalysisHub` fetches patient identifiers/address and clinical detail and exports
row-level CSV with identifiers. It is not a de-identified R-PHI module. Its
single unpaginated referral query can be truncated by the API. Its CSV quote
escaping does not neutralize spreadsheet formula prefixes. Its age conversion
also needs missing-value tests. Keep this operational export separate from future
aggregate public-health reporting and restrict its audience.

The smaller analytics dashboard has bounded pagination and excludes test rows,
but free-text diagnosis breakdowns are not a standard classification or population
disease measure. Client pagination is not a database snapshot.

Production legacy views lack an explicit invoker setting. The inspected
anon/authenticated table-grant inventory did not show direct access to those views;
do not claim public data exposure from view options alone. Review their owners,
privileged RPC callers and future grants before making them available.

### High: diagnosis scalar/JSON mismatch (safe repository fix selected)

Both databases constrain `diagnosis_status` to null, suspected, provisional or
confirmed. Creation currently joins distinct statuses with commas. A valid
multi-diagnosis referral with mixed statuses therefore generates an invalid scalar
and can be rejected. Preserve all structured entries. Populate the legacy status
only when every entry has the same supported status; use null for mixed statuses.
Never label an entire mixed referral confirmed because one diagnosis is confirmed.

### Medium: security and identity hardening

- Profile/role guards exist, but the separate directory's `status` is not a proven
  revocation mechanism for Auth/profile-based policies.
- Production audit triggers duplicate entire clinical row snapshots into audit
  storage. Staging removes sensitive fields. Decide minimum necessary audit data
  and correction-history requirements before migrating.
- Production RLS is enabled without policies on events and referral_feedback.
  This defaults to denial for ordinary clients, rather than proving a leak.
  Define appropriate audit/feedback access explicitly; never add permissive
  policies merely to silence an advisor.
- Security advisors report leaked-password protection disabled in both projects
  and callable definer-function warnings (5 production, 14 staging). Review each
  function's intended authorization, grants and search path individually.
- Authenticated production table grants include unnecessary TRUNCATE/TRIGGER
  privileges. This does not establish an ordinary REST exploit, but warrants
  least-privilege review; RLS alone is not a substitute for appropriate grants.
- Repository Edge Function code uses a server environment service-role key,
  validates the caller/profile, but has weak payload/method restrictions, broad
  CORS and unpinned remote major-version dependency. Its Auth creation plus
  profile insertion uses compensating deletion, whose outcome is not checked.
  Deployed versions differ; do not assume this source matches them.
- MFA, rate limits, retention, backup recovery and legal compliance are unverified.
  No legal-compliance certification is made.

### Medium: performance, UI and maintainability

Production advisors report 16 unindexed foreign keys, 17 auth-RLS evaluation
warnings, 4 multiple-permissive-policy findings and 5 unused-index notices.
Do not drop indexes solely because an advisor reports low use.

Modularize features gradually, using small services/hooks/components and shared
contracts. Preserve print layouts and role navigation. Consolidate design tokens
before expanding CSS. WCAG 2.2 AA requires keyboard, screen-reader, contrast,
focus, errors and small-screen evidence; a stylesheet is not certification.
QR verification is not established by this source inspection.

## 5. Master-plan phase register

| Phase | Current evidence | Remaining completion gate |
| --- | --- | --- |
| 1 Audit | Current source/catalog baseline documented here | Authenticated abuse tests, deployed function parity, browser/performance/backup assessment |
| 2 Design/layout | Existing theme and accessibility CSS | Consolidated tokens/components and measured accessibility |
| 3 Role dashboards | Three role experiences and admin tools exist | Authorized navigation inventory, session recovery and real lifecycle checks |
| 4 Referral engine | Core clinical screens/printing/status triggers exist | Atomic edits, explicit acceptance/rejection, corrections, idempotent submission, counter-referral parity |
| 5 Security | RLS and profile guards exist; staging hardening differs | Versioned reviewed baseline, direct-API role tests, storage retention, privileged auth controls |
| 6 Analytics | Smaller paginated module and unit-tested summary | Server aggregates, complete authorized scope, standard categories and disclosure controls |
| 7 R-PHI | Staging aggregate/report RPCs exist | De-identified dedicated UI/export, methodology, coverage, human-reviewed signals; no autonomous clinical AI |
| 8 Offline/interoperability | Connectivity warning, offline-related DB fields/indexes | Encrypted expiring drafts, resumable/idempotent sync, reviewed FHIR/DHIS2 requirements |
| 9 QA/release | 20 baseline unit tests plus lint/build; draft PR | Auth/RLS/E2E, accessibility, mobile, concurrency, recovery rehearsal and release approval |

No phase is marked wholly complete based solely on frontend CI.

## 6. Database structures genuinely needed next

Reuse existing referral events, audit, drafts and notification tables when their
security contracts permit. Avoid duplicate tables.

1. Stable investigation identities/revisions, with non-destructive legacy JSON
   migration and transactional compare-and-swap.
2. Actor/operation-scoped idempotency records and server-owned attachment intents,
   including verification and reconciliation state.
3. A correction-history contract for completed clinical records.
4. Only after reporting requirements are approved: versioned indicator definitions
   and authorized aggregate endpoints. Reuse existing staging aggregates where
   they satisfy disclosure and methodological requirements.

Every schema change still needs an explicit migration, rollback/data-preservation
plan and synthetic tests. This audit does not authorize a production migration.

## 7. Execution order and evidence to retain

1. Commit this audit and a master-plan continuation register to the existing PR.
2. Fix the confirmed diagnosis serialization mismatch with regression tests.
3. Resolve first-login/password recovery through the verified server capability;
   test failure after password change and retry without misleading success.
4. Reconstruct versioned source from the two catalogs and reconcile PHC attachment
   registration before implementing the atomic receiving-update RPC.
5. Test wrong-facility, revoked, anonymous and completed-record operations using
   synthetic identities, including concurrent writes and ambiguous responses.
6. Replace public-health row exports with approved aggregate reporting; retain
   clearly authorized operational reports under separate access rules.
7. Proceed with design consolidation and role dashboard improvements against the
   recorded nine-phase register. Complete release rehearsal and approvals last.

## Advisor remediation references

- [Function execution review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

These references guide review; advisor output alone does not prove an exploit or
that a function should be converted to invoker semantics.
