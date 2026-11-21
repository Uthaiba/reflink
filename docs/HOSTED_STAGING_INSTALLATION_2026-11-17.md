# Hosted synthetic staging installation — 17 November 2026

Project: reflink-synthetic-staging, rcskuzmvyugbanygizri (ACTIVE_HEALTHY).
Reviewed source: a4ec18bc75a9ba54d1e0db341e3f3ac4dbc016ba, preserving the tested aa12519 SQL.

## Applied migrations

| Original generated source | Actual hosted ledger identity |
| --- | --- |
| 20261117135653_atomic_investigation_updates.sql | 20261117144634_atomic_investigation_updates.sql |
| 20261117135703_atomic_clinical_updates.sql | 20261117144653_atomic_clinical_updates.sql |

The connected migration service generated the installed identities. Repository files and contract references now use those actual versions, with SQL bytes unchanged. The existing 22 historical migrations were preserved; the recovered archive remains separate. Neither migration was applied to production, and no production history was repaired or marked applied.

Both migrations completed successfully. The hosted clinical preflight returned zero blockers: required types, clinical RPC security/grants, clinical write guard, closed-record guard and private ledger checks all passed. Authenticated execution of the legacy registration RPC is now false. Structural results do not prove real-user clinical workflows.

## Live API and preview evidence

Public-key HTTP calls to both new RPCs without a user session returned HTTP 401 / PostgreSQL 42501. This verifies anonymous denial, not authenticated authorization.

The branch-specific Vercel preview is configured exclusively for synthetic staging with both atomic mutation flags enabled. Deployment dpl_7pb74umHN9gFTVpsKs1hCSRXVR6B reached READY, target staging, from the reviewed source above. URL: https://reflink-697m49ttr-uthaibas-projects.vercel.app . No production environment variables or deployment were changed. Vercel Authentication protects the preview.

Auth settings report email signup enabled, signup not disabled, and email confirmation required. No test signup emails, credentials, sessions or accounts were created. Real authenticated clinical tests require an authorized staging session and synthetic role accounts; no role-simulation result is being counted as a successful login.

## Security review limits

Post-install advisors report 15 authenticated-callable SECURITY DEFINER functions requiring individual authorization review, two RLS-without-policy informational findings, and leaked-password protection disabled. New RPCs deliberately require a definer transaction and enforce current account/session/profile/facility checks; advisor warnings are not waived by this document.

- Definer review: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Deny-by-default table review: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Password protection: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Remaining requested programme

Hosted baseline comparison still omits grants/indexes/default privileges/managed-service details. Authenticated full clinical testing, controlled corrections, server-owned attachment reconciliation, remaining workflow/design, approved AI/interoperability and backup/restore verification are not marked complete. No actual patient records were inspected or modified in this installation. The migrations add operation ledgers and guards and preserve clinical records/documents; old staging clients using direct clinical writes or the retired RPC are intentionally denied.

Keep production NO-GO. Coordinate any rollback with the guards; do not re-enable unsafe writers, drop operation/audit history, delete documents, or reset hosted databases.
