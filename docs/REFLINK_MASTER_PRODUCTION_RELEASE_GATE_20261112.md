# REFLINK master transformation — production release gate (2026-11-12)

This is a **go/no-go evidence register**, not a claim that REFLINK v2.0 has been fully released. Preserve the existing application, its mission, production database and patient confidentiality.

## Verified
- GitHub Actions PR quality gate **#482**: frontend lint/build, Edge Function type check and migration integrity all passed (commit `9cd6ecfe338162352df2f11a79a0511b9b331226`).
- Live staging read-only migration final-effect matrix: **13/13 checks passed**, but the 13 source versions are absent from staging's migration ledger.
- Eight staging SQL authorization scripts executed successfully. Database-level simulated JWT subjects **do not** prove real authenticated behavior.
- Live staging fixture-readiness recheck: **4 active facilities, 1 administrator, 0 PHC staff, 0 receiving staff, 0 test referrals, 0 real referrals**; status **NOT_READY**.
- Staging-only `create-user` Edge Function v5 deployed, active with JWT verification.
- Repository contains staging-only guarded account provisioner, synthetic referral creator, and authenticated access acceptance runner; scripts are not proof of successful account provisioning or acceptance.

## Mandatory NO-GO items
1. **Synthetic Auth identities:** Run `scripts/staging-provision-synthetic-clinical-users.mjs` with private staging-only credentials; verify PHC A, receiving B, outsider D profiles and active facilities. Do not store credentials in GitHub, logs or chat.
2. **Synthetic referral:** Run `scripts/staging-create-synthetic-referral.mjs` after provisioning, with explicit `REFLINK_STAGING_FIXTURE_CONFIRM=YES_STAGING_ONLY`. Verify `is_test=true` and record its UUID privately.
3. **Real Auth acceptance:** Run `scripts/staging-authenticated-referral-access.mjs` with the four test accounts and referral UUID. The script checks clinical participant access, unrelated facility denial, administrator patient-level denial, profile confidentiality, notification isolation and administrator-only analytics.
4. **Migration history:** Independently compare source migrations to the live staging catalog, establish a restorable Supabase-compatible backup, then obtain approval for any ledger reconciliation. **Never blindly replay migrations or insert migration-history rows.**
5. **Recovery:** Complete a full restore rehearsal with Auth dependencies, foreign keys, triggers, RLS, storage and functions, then validate recovered data and authorization behavior. The existing local restore attempt is partial only.
6. **Supply-chain security:** CI log for run #480 reported **two high-severity npm audit findings**. Obtain the exact advisory/dependency report and remediate or explicitly risk-accept before release. Do not blindly run `npm audit fix` without reviewing compatibility and lockfile changes.
7. **Clinical/product sign-off:** Review workflows with PHC and receiving clinicians, patient safety, auditability, incident response, consent/privacy, Nigeria NDPA applicability, accessibility, performance and low-connectivity behavior. Record evidence, not only verbal approval.
8. **Production approval:** Explicitly approve the release, verify rollback/recovery and monitor the staged rollout. No production merge, migration, deployment or real patient data import is authorized by this document.

## Controlled execution sequence
```bash
# Run locally with private staging-only REFLINK_STAGING_* variables.
# All scripts fail closed on the wrong Supabase project.
node scripts/staging-provision-synthetic-clinical-users.mjs
# After reviewing preflight, set REFLINK_STAGING_PROVISION_CONFIRM=YES_STAGING_ONLY
# and run the provisioner again to create synthetic accounts.
node scripts/staging-create-synthetic-referral.mjs
# After reviewing preflight, set REFLINK_STAGING_FIXTURE_CONFIRM=YES_STAGING_ONLY
# and run the creator again to insert a single synthetic referral.
# Set REFLINK_STAGING_REFERRAL_ID from its output:
node scripts/staging-authenticated-referral-access.mjs
```

The scripts require a real staging administrator account and private passwords. They have **not** been run with credentials in this verification session. Never put passwords in command-line arguments or commit them.

**Release decision: NO-GO.** This is a safety gate, not a failure of the overall REFLINK transformation. Continue nonproduction engineering and evidence collection without changing production.

## Dependency audit — confirmed in CI #486
The new blocking `npm audit --audit-level=high` gate correctly failed on two vulnerable locked dependencies:
- `source-map-js@1.2.1`, high severity, indexed source-map offsets event-loop DoS, [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- `vite@8.2.1`, high severity, advisories [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw), [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw), [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22), [GHSA-vfpm-58rq-9qcg](https://github.com/advisories/GHSA-vfpm-58rq-9qcg).
GitHub Actions #486: migration integrity and Edge Function checks **passed**; frontend job **failed intentionally at npm audit**, so downstream lint/build were skipped. Run `npm audit fix` in a controlled dependency-update branch, inspect package and lockfile diffs, then require the entire quality gate to pass. Do not disable the audit gate or treat previous green CI as current release clearance.

## Controlled dependency remediation — 2026-11-12
The branch-scoped lockfile repair workflow generated a lockfile-only commit `b035a82a4bac3827cc94d75b488f2234551215a4` after its internal `npm ci`, `npm audit --audit-level=high`, lint and build checks passed. Locked versions advanced from `vite@8.2.1` to `vite@8.3.8` and `source-map-js@1.2.1` to `source-map-js@1.2.2`. GitHub classified the bot-authored PR quality-gate run #491 as `action_required`, not success. A separate normal CI run is necessary before claiming full quality-gate success. No production deployment.
