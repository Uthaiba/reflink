# REFLINK branch reconciliation review — 10 November 2026

## Decision

Do not merge `reflink/phase-1-security-remediation` into `reflink/staging-baseline-reconstruction-20261110` as a whole, and do not merge the staging branch back into Phase 1 as a whole. The branches have materially diverged and contain different database assumptions, application integrations and release histories.

## Verified Git comparison

Repository: `Uthaiba/reflink`

- Staging branch: `reflink/staging-baseline-reconstruction-20261110`
- Staging head at review: `376b0f969223efabb8e2c6f7db5d5f50d1db36d7`
- Phase 1 branch: `reflink/phase-1-security-remediation`
- Common ancestor: `26eed63d006e16d744c923fa9f5fabc7a0fe9a8e`
- Git comparison status: `diverged`
- Phase 1 is 634 commits ahead of the common ancestor; staging is 184 commits ahead.
- The compare endpoint reports 634 commits in the Phase 1 direction and a large changed-file set, including application entry points, dashboards, offline queue modules, notification modules, SQL migrations, tests, CI, and extensive security/governance documentation.

This is not a safe fast-forward or routine merge. Commit counts and file-level change statistics do not establish semantic compatibility.

## Important source-baseline difference

The Phase 1 master status register identifies production baseline `v2.0-release` at `cce730ec64aa8be568021f16de4de47c110f81d5` and PR #1 targeting that release line. Its continuity handoff records the Phase 1 branch as the working security-remediation stream.

The staging stream is based on `main` through PR #2 and reconstructs a synthetic staging schema with twenty migrations. It has its own current frontend integration, reporting RPC restoration, counter-referral flow, notification centre and encrypted local draft vault.

The two branches must be treated as parallel engineering streams until a deliberate integration base is selected by the product owner and maintainers. Neither branch is automatically the canonical production release.

## Valuable Phase 1 work to preserve and evaluate

The Phase 1 branch contains substantive work that should not be discarded:

1. **Receiving referral queue and lifecycle reliability** — priority ordering, overdue acknowledgement logic, expected-status compare-and-set guards and concurrency-focused source tests.
2. **Offline queue security** — encrypted IndexedDB queue, key vault, cross-tab lock handling, account isolation and browser test harness. This is a distinct implementation from the staging branch's simpler encrypted local draft vault; do not combine both storage designs without a threat-model and migration decision.
3. **Notification architecture** — inbox adapter, recipient eligibility, outbox and delivery contracts. The staging branch currently implements an in-app event queue and Realtime notification centre but not a provider-backed delivery worker.
4. **Referral analytics / R-PHI governance** — indicator dictionary, disclosure controls, privacy boundary reviews and aggregate reporting tests. Compare the Phase 1 definitions with the staging SQL RPCs before adopting any indicator or output contract.
5. **Security review artefacts** — privileged function dependency graph, ACL reviews, audit minimisation design, role/column authorization matrices and migration governance.
6. **Accessibility and UI refinements** — counter-referral accessibility tests, workspace and dashboard styling, and the broader role-specific UX improvements.
7. **CI and test coverage** — preserve useful test suites and browser harnesses, but reconcile workflow paths and package scripts against the selected integration branch.

## Integration risks requiring file-level review

- Both branches modify `src/App.jsx`, `src/App.css`, `src/components/dashboards/AdminDashboard.jsx`, package manifests and Supabase function/migration areas. Blind file replacement would lose work.
- Offline implementations differ materially: Phase 1 has a queued sync architecture; staging intentionally uses local encrypted drafts with explicit manual restore/submit and no background sync. These are not interchangeable.
- Notification models differ: staging Realtime inbox/event feed is not equivalent to Phase 1's proposed durable delivery/outbox architecture.
- SQL migrations must be reconciled against the actual staging migration ledger and production baseline. Never replay Phase 1 migrations on top of the twenty-migration staging schema without dependency and idempotency review.
- The two branches may encode different assumptions about lifecycle states, reporting RPCs, facility/role checks and storage paths. Resolve these at domain-contract level before moving code.
- Vercel deployment and Supabase environment variables are environment-specific. Do not copy secrets or production values between branches or projects.

## Controlled integration sequence

### Gate A — freeze evidence, not development

1. Record exact branch heads and PR metadata before each integration attempt.
2. Preserve both branches and their existing PRs; no force-push, reset or broad merge.
3. Keep production read-only and use only synthetic staging data.

### Gate B — compare domain contracts

Create and approve a shared contract for:
- supported roles and facility assignment;
- referral lifecycle states and permitted transitions;
- referral create/update column ownership;
- counter-referral submission and completion;
- notification event, recipient and delivery semantics;
- offline storage, sync, idempotency and conflict handling;
- public-health indicator definitions, disclosure and access scopes.

### Gate C — integrate one bounded capability at a time

For each capability:
1. Identify the exact Phase 1 commits and files that implement it.
2. Compare against current staging implementation and live staging database dependencies.
3. Select one implementation or design a compatibility adapter; do not retain two competing sources of truth.
4. Port only the necessary changes into a dedicated integration branch based on the chosen canonical staging head.
5. Add or adapt tests for the merged domain contract.
6. Run lint, build, unit, browser and migration integrity checks.
7. Apply database changes only to synthetic staging after SQL review and migration-ledger verification.
8. Deploy a fresh Preview and perform real Auth-issued acceptance before declaring the capability integrated.

### Recommended integration order

1. **Receiving lifecycle compare-and-set protections** — first, because stale concurrent writes can compromise workflow correctness. Verify the database also enforces transition invariants; client-side guards alone are insufficient.
2. **Accessibility and design-system refinements** — low database coupling; preserve current staging functionality and run accessibility checks.
3. **R-PHI indicator definitions and disclosure tests** — reconcile definitions and suppression rules before adopting UI or SQL.
4. **Notification outbox/recipient contracts** — decide whether the staging event feed is extended into a durable delivery architecture; keep SMS disabled until consent, provider, retry and monitoring controls exist.
5. **Offline queue architecture** — only after threat-model comparison, explicit decision on manual draft vs queued background sync, device/shared-device retention, key recovery and clinical conflict handling.
6. **Remaining dashboard and UI changes** — feature-by-feature, preserving current role boundaries and API contracts.

## Release and safety controls

- PR #1 and PR #2 remain separate, open/draft engineering streams unless maintainers explicitly approve a consolidation strategy.
- No production deployment, production migration, production Auth setting change or secret rotation is authorised by this review.
- Do not infer that a branch is production-ready from its commit count, mergeable flag, build status or a Preview HTTP 200.
- Keep all test data synthetic. Do not copy patient records, Auth users, storage objects, credentials or secrets between environments.

## Next execution item

Begin with a focused review of the Phase 1 receiving lifecycle compare-and-set implementation against the current staging `src/App.jsx` handlers and database transition enforcement. Produce a bounded compatibility patch only if it closes a verified gap without weakening staging RLS or workflow invariants. Do not merge the branches wholesale.


## Receiving lifecycle compare-and-set review — 10 November 2026

A bounded compatibility change was made after comparing the Phase 1 source and its lifecycle source-contract test with the current staging frontend.

### Implemented in staging

Commit: `5927c177cbbe9cb9f99e3b1af2e6ebe5511764ab`

The six receiving-facility update handlers now include expected-current-status filters and use `maybeSingle()` to detect a stale/no-match update:

| Operation | Required current status | New status |
|---|---|---|
| Acknowledge referral | `sent` | `acknowledged` |
| Record patient arrival | `acknowledged` | `patient_arrived` |
| Start assessment | `patient_arrived` | `under_assessment` |
| Save clinical assessment | `under_assessment` | Disposition selected by the assessment workflow |
| Save admission details | `admitted` | `admitted` |
| Discharge patient | `admitted` | `discharged` |

A no-match now produces a stale-referral message instructing the user to refresh and review the current status. This prevents the frontend from treating a stale update as a successful transition.

### Validation

- GitHub Actions quality-gate run #275 completed successfully on commit `5927c177cbbe9cb9f99e3b1af2e6ebe5511764ab`.
- Frontend lint and production build: PASS.
- Supabase Edge Function type check: PASS.
- Supabase migration integrity: PASS.
- This run does not include a real concurrent PostgreSQL transaction test or Auth-issued browser workflow. The source change is therefore CI-validated, not yet live lifecycle acceptance.

### Important boundary

These compare-and-set predicates are an application-level concurrency guard. They do not replace authoritative database-side role/facility RLS, workflow transition enforcement, trigger validation or transactional RPCs. The staging database must still reject forbidden transitions and unauthorized field changes. Do not describe this change as a complete server-side concurrency guarantee.

### Next bounded verification

Inspect the current staging database transition triggers/constraints and the six update paths together. Confirm each expected prior status matches the actual lifecycle contract, then add rollback-only synthetic SQL tests for forbidden and stale transitions before declaring the receiving workflow concurrency-safe.
