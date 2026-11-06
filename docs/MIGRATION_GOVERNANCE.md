# REFLINK Migration Governance

The live Supabase project currently reports a migration-history entry but the production repository does not contain a complete source-controlled migration baseline. Therefore:

1. Do not run `supabase db push` from this branch yet.
2. Export and review the existing remote schema and migration history in a non-production workspace.
3. Reconstruct or baseline the existing schema without replaying destructive DDL.
4. Validate each proposed migration against a disposable database.
5. Only then apply approved migrations through a reviewed deployment process.

The migration in `supabase/migrations/20261105000100_admin_aggregate_referral_volume.sql` is a proposed, additive RPC. It intentionally does not add administrator row-level SELECT access to referrals. It is not applied to the connected production database.

## Read-only schema verification (5 November 2026)

The connected production database was inspected through metadata/catalog queries only; no patient-level rows were queried or changed.

Verified against the live schema:

- `public.referrals.is_test` exists and is non-null with a default of `false`.
- `public.counter_referrals` contains the columns used by the proposed RPC: `referral_id`, `receiving_user_id`, `final_diagnosis`, `treatment_provided`, `outcome`, `follow_up_instructions`, `referred_further_to`, and `additional_notes`.
- `counter_referrals.referral_id` is unique, and its outcome constraint permits `recovered`, `improved`, `referred_further`, `died`, and `other`.
- The existing referral status-transition trigger permits `discharged -> completed`; the counter-referral guard checks for a counter-referral row before completion.
- The existing status-audit trigger records status changes in `referral_updates`.
- The remote migration history currently contains one recorded migration: `20260928203447_reflink_v2_rural_first`.

These checks reduce schema-assumption risk but do not prove that the proposed migration compiles, that the function owner/privileges are correct, or that the transaction works under concurrent authenticated requests. Those tests still require a non-production database and synthetic accounts/referrals.

## Environment constraint

Supabase database branching was unavailable for the connected Free-plan organisation. No branch was created. A separate development project is the alternative under consideration; it must be created only after the project owner confirms the target organisation and the project-creation process confirms its cost. Do not use the production project as a test environment.

## Security advisor observations

The latest read-only Supabase security advisor reported:

- RLS-enabled tables `referral_events` and `referral_feedback` have no policies. Do not add broad policies without defining the intended least-privilege access model.
- Five callable `SECURITY DEFINER` functions are exposed to authenticated users: `get_facility_user_count`, `get_facility_user_counts`, `is_administrator`, `log_referral_print`, and `log_referral_read`. Review each function's authorization checks, search path, grants and data returned before changing privileges.
- Leaked-password protection is disabled. Treat this as an Auth configuration remediation item; do not change production Auth settings without a separately reviewed change and acceptance test.

The advisor findings are not proof of exploitation. Remediation must preserve required referral operations and be verified with synthetic users representing each role and facility.

## Follow-on development safeguards

- Disclosure-control unit tests are implemented in `tests/rphiDisclosure.test.js` and run through `npm test` in the quality workflow.
- `docs/OFFLINE_PHI_THREAT_MODEL.md` defines the threat model and acceptance criteria for application-layer encryption, key lifecycle, endpoint controls, queue retention and server-side re-authorisation. Current IndexedDB records remain unencrypted.
- `docs/NOTIFICATION_OUTBOX_DESIGN.md` defines a durable server-side notification architecture. The current browser SMS request remains best-effort; no outbox schema or worker has been deployed.
- The `is_administrator()` helper has 12 recorded policy dependency entries in the connected production catalog. Do not revoke authenticated execution until every policy and function dependency is mapped and tested.
- The proposed aggregate RPC uses `public.is_administrator()`; its own grants, SECURITY DEFINER owner, dependency and behavior must be tested in non-production before release.

## Reconciliation workstream

The detailed source migration inventory, dependency graph, read-only evidence, object-level review requirements and non-production acceptance gates are maintained in [MIGRATION_RECONCILIATION_PLAN.md](./MIGRATION_RECONCILIATION_PLAN.md). The current decision is **blocked pending baseline reconciliation and synthetic-data staging verification**. Do not apply any of the seven November 2026 source migrations to production or manually advance the remote migration ledger.
