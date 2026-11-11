# REFLINK file-level integration matrix — 2026-11-11

Evidence: GitHub compare API, `v2.0-release...reflink/staging-baseline-reconstruction-20261110`: diverged, staging 206 commits ahead and 1 behind v2.0. Compared `main...v2.0-release`: diverged, v2.0 1 ahead and 5 behind main. The security-remediation branch and staging are also diverged (staging 206 ahead, 634 behind). **Ahead/behind are history counts, not release quality or a safe merge plan.** The GitHub compare file list for the first pair lists 45 changed paths, including migrations; it does not mean other unchanged files have been functionally validated.

| Area | Observed evidence | Decision | Gate |
|---|---|---|---|
| Login / password change | Staging `src/App.jsx` includes verified post-password-change transition; user confirms dashboard opens | **KEEP staging behavior**; do not overwrite with v2.0 file | Repeat auth + expired-session and wrong-role tests |
| Core referral UI | `src/App.jsx` differs between v2.0 and staging; 439 changed lines reported by compare API | **MANUAL REVIEW** of changed hunks; no wholesale replacement | PHC → receiving → counter-referral lifecycle |
| Administrator dashboard | `src/components/dashboards/AdminDashboard.jsx` differs (30 lines changed) | **KEEP staging shell pending hunk review** | Admin access, reporting, users, mobile |
| Counter-referral | Staging adds `src/components/CounterReferralForm.jsx` and CSS | **KEEP and TEST** | RLS, participant visibility, completion and history |
| Notifications | Staging adds NotificationCenter and notification queue/realtime migrations | **KEEP and TEST** | No duplicates; participant isolation; delivery |
| Public health reporting | Staging adds `AdminPublicHealthReporting.jsx` and aggregate migration | **KEEP and PRIVACY-REVIEW** | Aggregate-only, small-cell suppression and provenance |
| Offline draft vault | Staging adds `src/lib/offlineDraftVault.js` and component | **KEEP and TEST** | Encryption, recovery, logout isolation |
| v2.0 offline referral queue | `src/lib/offlineReferralQueue.js` exists in v2.0 but **not** staging | **REVIEW FOR SELECTIVE PORT**, not automatic copy | Duplicate prevention, sync after reconnect, no PHI leakage |
| Edge Functions | Staging adds `create-user` and `change-password` | **KEEP and TEST** | Auth-issued sessions, CORS, role authorization |
| Database security | Staging adds RLS/permissions, audit and notification migrations | **KEEP MIGRATION ORDER**; inspect security-remediation branch separately | Schema diff, RLS negative tests, no destructive production SQL |
| Original v2.0 PWA/SMS | v2.0 differs from main in service worker, manifest and SMS endpoint; v2.0/staging comparison does not list them as changed | **VERIFY retained behavior**, do not assume deployment configuration | Offline smoke and SMS authorization/secret handling |

## Immediate bounded implementation
1. Keep the current staging authentication fix and its passing GitHub Quality Gate #308 as the stable baseline.
2. Audit `offlineReferralQueue.js` from v2.0 against staging's `offlineDraftVault.js`; they serve different purposes and must not be conflated.
3. Audit `src/App.jsx` hunk-by-hunk before merging the v2.0/security-remediation changes; specifically preserve user-visible investigation result upload, receiving workflows and administrator routing.
4. Execute real staging tests with separate Auth-issued accounts and synthetic patients. Administrator dashboard success is one positive test, not a four-role RLS pass.
5. Keep PR #2 draft; no production changes, no billable branch, no real patient data in tests.

## Release blockers
Authenticated role/facility-isolation tests, notification/CORS preflight, offline sync idempotency, private attachment access and R-PHI privacy acceptance remain unverified by this comparison. Production deployment requires evidence for each.
