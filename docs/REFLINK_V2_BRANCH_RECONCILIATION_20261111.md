# REFLINK v2.0 — branch reconciliation and release gates (2026-11-11)

## Scope and evidence
This is a **read-only branch-content comparison**, not a verified merge or a full runtime audit. The staging administrator reports that dashboard access now works after password change. GitHub Quality Gate run #308 passed for commit `f89fc932d25fe556e54fbf22809ae53a21250b0d`. This does **not** establish authenticated referral/RLS acceptance or authorize production release.

Compared repository branches: `main`, `v2.0-release`, `reflink/phase-1-security-remediation`, `reflink/staging-baseline-reconstruction-20261110`.

| Branch | src/App.jsx blob SHA | Lines | AdminDashboard.jsx blob SHA | Lines |
| --- | --- | ---: | --- | ---: |
| main | d053ccc664cb362d2c57e34dca95a8343ca19c0a | 7520 | 8f168768b78fa33694df0c6d972184a3727f4f48 | 2946 |
| v2.0-release | 78eb1f2a7e1dd8cb8224876a9df5fb5fb163c2dc | 8065 | 8f168768b78fa33694df0c6d972184a3727f4f48 | 2946 |
| reflink/phase-1-security-remediation | 0aaa4aeb9252007592b0abd260b4a90123bb66ce | 9021 | 28e7d38f94e1115f071460ff481a2dafff7bf790 | 3206 |
| reflink/staging-baseline-reconstruction-20261110 | 763599adef313db8274dd8ce6974ec8be959ccad | 7591 | 1702391b03ef4688c99a25ddfdf7784b573cbe16 | 2976 |

The differing blob SHAs prove the files are **not identical**; line counts alone do not establish which changes are newer or safe. The staging branch includes the password-change/dashboard transition fix. The v2.0 and security-remediation branches contain substantial distinct application code and must **not** be blindly overwritten or merged.

## Release-preserving integration order
1. Freeze the currently working production deployment and database; capture commit SHA, environment mapping, schema backup and rollback point.
2. Treat staging as the integration target; inventory the exact commits/files changed on each branch, and review diffs before selective cherry-picks or manual merges.
3. Port security-remediation controls **first**, preserving server-side and database-level enforcement; independently inspect any schema migrations and Edge Functions.
4. Port v2.0 UX, workflow and analytics changes in small reviewed sets; retain staging's working authentication/password-change flow.
5. For every set: lint, build, Edge Function type check, migration integrity check, then browser smoke tests against synthetic staging data.
6. Test with Auth-issued administrator, PHC, receiving and unrelated-facility identities; verify facility isolation, forbidden column writes, referral lifecycle, investigation uploads, notifications, offline drafts and recovery.
7. Confirm patient-data minimization, R-PHI aggregate-only reporting, auditability and release rollback. Do not call the system production-ready before these gates pass.

## Explicit hold points
- No production Supabase writes or environment-variable repointing.
- No branch merge into `main` or `v2.0-release` based solely on a successful frontend login.
- No billable Supabase branch.
- No live patient data in tests.
- No claim that staging browser success proves production readiness.

## Next actionable engineering work
Obtain file-level and commit-level diffs between the four branches; establish an integration matrix (keep/port/rewrite/drop) for auth, referral lifecycle, clinical investigation attachments, administrator dashboard, analytics/R-PHI, migrations, RLS, offline draft vault and Edge Functions. Implement one bounded set at a time with tests and explicit evidence.