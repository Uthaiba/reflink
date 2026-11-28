# CI credential remediation — 17 November 2026

GitGuardian incident 40167512 referred to two occurrences of a predictable
test-only password template introduced in PR #3's disposable PostgreSQL workflow.
The workflow used no Supabase or production credential.

The source now generates a cryptographically random credential for each job,
masks it before use, passes it to Docker through the process environment and
uses the runner's temporary environment file for the subsequent test step.
PostgreSQL is published on runner loopback only and removed after the job.

GitGuardian continued to report an occurrence in an earlier PR #3 commit after
the source fix. That incident was not suppressed or marked resolved. Its
dashboard required sign-in, so its historical status was not changed.

The replacement review branch is a consolidated source snapshot based directly
on main. It preserves PR #3 and its commits, avoids force-pushing existing
history, and carries forward the full application changes. Differences from the
final PR #3 source are the two workflow push-branch lists and this document.
Fresh security, frontend and synthetic database checks are required here.

No production deployment, hosted database change, credential rotation or
security-scanner disabling is included. Existing release gates still apply.
