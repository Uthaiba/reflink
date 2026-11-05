# REFLINK Migration Governance

The live Supabase project currently reports a migration-history entry but the production repository does not contain a complete source-controlled migration baseline. Therefore:

1. Do not run `supabase db push` from this branch yet.
2. Export and review the existing remote schema and migration history in a non-production workspace.
3. Reconstruct or baseline the existing schema without replaying destructive DDL.
4. Validate each proposed migration against a disposable database.
5. Only then apply approved migrations through a reviewed deployment process.

The migration in `supabase/migrations/20261105000100_admin_aggregate_referral_volume.sql` is a proposed, additive RPC. It intentionally does not add administrator row-level SELECT access to referrals. It is not applied to the connected production database.
