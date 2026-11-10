# REFLINK — Continuous Development Handoff

**Updated:** 10 November 2026 (Europe/London)
**Purpose:** Durable session-to-session engineering checkpoint. This file records verified state; it does not replace the Master Product Transformation specification.

## 1. Governing product direction

REFLINK is an existing healthcare referral coordination product being strengthened into a secure, accessible, low-connectivity referral platform with a future privacy-preserving public-health intelligence capability (R-PHI). Do not rebuild from scratch, discard working functionality, or introduce unnecessary architecture changes.

The user-supplied Master Product Transformation specification remains the product requirements source. It must be retained alongside this handoff and updated only through deliberate product decisions.

## 2. Repository and release control

- Repository: `Uthaiba/reflink`
- Active remediation PR: [#1 — Phase 1: security remediation and production baseline](https://github.com/Uthaiba/reflink/pull/1)
- PR state at last inspection: **open, draft, unmerged**.
- PR base: `v2.0-release`
- PR head branch: `reflink/phase-1-security-remediation`
- Do not merge or deploy to production until all release gates and clinical/product approvals are satisfied.
- The PR description reports 622 commits and 137 changed files; treat the PR diff and current branch contents as authoritative, not an old conversation summary.

### Recent commit/status evidence

- `37da8390ffc8fbf5218613694e68913808447087`: PR comment dated 10 November reports unit tests, lint and production build passed; Chromium/browser checks were still running at that comment's timestamp. Its Vercel status currently reports success. Do **not** describe the full GitHub Actions/browser suite as green without checking the latest workflow run.
- `7ca65d02a345647eea3034cfdcac163e29890f93`: sender- and receiving-facility active checks were added to the proposed referral-create-context migration and source-contract test. Vercel status reports success; the PR comment reported unit tests passed while lint/build/browser checks were still pending at that time.
- `8b74e86ed340f556083f415403b3142737c4bd4b`: earlier source-contract test commit; Vercel status reports success. It is not assumed to be the current PR HEAD.

Before every new session, fetch PR #1 and verify its actual current head SHA, branch state, latest GitHub Actions run and Vercel status.

## 3. Supabase environments — last verified 10 November 2026

| Environment | Project | Ref | State |
|---|---|---|---|
| Production | Reflink | `uwwzbljufqbzkjflpnll` | ACTIVE_HEALTHY |
| Synthetic staging | reflink-synthetic-staging | `rcskuzmvyugbanygizri` | ACTIVE_HEALTHY |

- Staging public schema currently has **zero tables**.
- Staging migration ledger currently has **zero migrations**.
- Production migration ledger has one recorded entry: `20260928203447_reflink_v2_rural_first`.
- The previous read-only production catalog inspection found 14 public tables, all with RLS enabled. Do not infer row-level security correctness from RLS being enabled.
- Production contains existing application records. Never copy production patient data, Auth users, referral records, audit records, Storage objects or secrets to staging.
- No production or staging DDL was applied during the latest continuity review.

## 4. Staging reconstruction evidence and gaps

Repository evidence:
- `docs/REFLINK_SYNTHETIC_STAGING_BASELINE_RECONCILIATION.md`
- `docs/catalog_exports/20261109_live_public_trigger_snapshot.sql`

The reconciliation document describes an owner-supplied `reflink-production-schema.sql` export (64,434 bytes; 1,612 lines) with 14 tables, 16 functions, 2 views, 30 RLS policies, 10 explicit indexes and 23 foreign keys. It explicitly records that the export contains **zero CREATE TRIGGER statements**.
The separate trigger snapshot contains nine live public trigger attachments. It is evidence, not an approved migration.

Important: the attempted repository path `docs/catalog_exports/reflink-production-schema.sql` returned NOT_FOUND. The authoritative schema export has therefore **not yet been located in the repository at that path**. Do not reconstruct it from table summaries or invent missing SQL. Locate the original owner-supplied export (or an exact verified path) before generating a faithful baseline.

Other staging decisions still required:
- Reconcile production catalog grants and default ACLs, including both `postgres` and `supabase_admin`.
- Decide and document a least-privilege staging target; do not silently reproduce unsafe production defaults.
- Inventory Auth configuration, Storage buckets/policies, Realtime publication membership, extensions and non-public schemas if they are in scope.
- Verify object ownership, function definitions, dependencies, trigger ordering, constraints, indexes, RLS policies and effective grants after reconstruction.

## 5. Security and lifecycle findings to preserve

1. Receiving-facility referral SELECT policy needs explicit receiving-role enforcement, not facility match alone.
2. Broad table UPDATE privilege plus RLS does not provide column-level protection for referral provenance and PHC-originated clinical fields. Use a reviewed column boundary or transactional workflow API.
3. Authenticated structural privileges (including TRUNCATE) require catalog-wide review; RLS does not protect against TRUNCATE.
4. Audit-log ACL review found authenticated had SELECT, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on `public.audit_log`, plus USAGE/SELECT/UPDATE on `public.audit_log_id_seq`. Proposed restriction is documentation/design only until a reviewed migration is tested in staging.
5. Default ACLs for `postgres` and `supabase_admin` broadly grant future object privileges to browser roles; this remains a separate release blocker.
6. Referral creation candidate must validate both the active referring facility and active receiving facility. Service-role/database-owner bypass requires a separate inventory of all privileged referral-insert paths.
7. Audit-log data minimisation for future events does not resolve historical full-row snapshots; retention/redaction requires a separate governance decision.
8. Two RLS-enabled tables without policies, five authenticated-callable SECURITY DEFINER functions, and disabled leaked-password protection were reported in prior advisor/catalog review. Re-verify current state and dependencies before changing ACLs or settings.
9. SMS dispatch remains best-effort, not exactly-once. Provider acceptance followed by database-record failure can cause duplicate retries; a durable outbox/idempotency design is still required before critical alert use.
10. Offline encryption/key-vault work must be assessed from the current branch and integrated application path; do not equate helper tests with end-to-end protection of stored PHI.

## 6. Immediate next task — Phase 0 staging baseline reconstruction

**Current task state: BLOCKED pending authoritative schema-export location.**

Execution order:
1. Locate and verify the complete owner-supplied production schema export. Confirm file size, line count and checksum if available.
2. Compare it against read-only production catalog inventory; explicitly account for missing triggers and default ACL discrepancies.
3. Produce a reviewed staging-only baseline with least-privilege defaults and explicit object ownership/grants.
4. Apply only to the empty synthetic staging project after source review; do not run against production.
5. Verify tables, columns, constraints, indexes, functions, views, triggers, RLS policies, effective grants and migration ledger from PostgreSQL catalogs.
6. Load synthetic Auth users, facilities and referral fixtures only.
7. Run positive and negative tests for PHC staff, receiving staff, wrong-facility users and administrators, including trigger/lifecycle cases.
8. Update this handoff with exact migration commit, staging verification evidence and remaining blockers.

## 7. Operating rules for every development session

- Start by reading this handoff and the master specification.
- Verify GitHub PR/head/CI and the relevant Supabase state before relying on prior notes.
- Work only on the next unresolved task; do not repeat completed work without a documented reason.
- Production stays read-only until explicit release approval.
- Use synthetic data for staging and testing.
- Every code or schema change must identify affected files/objects, rationale, tests, exact commit SHA and deployment status.
- Distinguish source-contract tests from live PostgreSQL, integration, browser, clinical and production tests.
- Update this handoff after every meaningful milestone.
- When the user says **NEXT**, continue from the next unresolved item in this file.

## 8. Release gate

PR #1 remains draft and unmerged. No production release is approved by this handoff. Security, database, clinical workflow, offline PHI, accessibility, browser/mobile, disaster-recovery and product-owner/clinical-governance gates must be evidenced before release.
