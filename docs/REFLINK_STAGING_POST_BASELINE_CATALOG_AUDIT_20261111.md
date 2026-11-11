# REFLINK staging — thirteen-migration source and catalog audit (2026-11-11)

Target: synthetic staging `rcskuzmvyugbanygizri`; production untouched.

## Source review
Read all 13 SQL files `20261111160000` through `20261111201500` on branch `reflink/staging-baseline-reconstruction-20261110`. The first two remove ordinary-client Storage DELETE/UPDATE policies; 170000 replaces Storage SELECT/INSERT policies with referral-participant checks; 173000 adds partial unique offline idempotency index; 180000 replaces notification-log SELECT policy; 183000/184500 add and validate offline retry key CHECK; 190000/191500/194500/200000/201500 progressively replace the attachment-registration function; 193000 grants authenticated execution of guarded analytics.

## Live catalog evidence (read-only)
- `pg_policies`: Storage investigation policies have SELECT and INSERT only, under expected names. Notification log participant SELECT policy exists.
- `pg_indexes`: `referrals_referrer_offline_client_id_unique` exists.
- `pg_constraint`: `referrals_offline_submission_key_required` exists with `convalidated=true`.
- `has_function_privilege`: authenticated can execute `get_referral_analytics_summary()`; anon cannot.
- `register_referral_investigation_files(uuid,jsonb)`: SECURITY DEFINER, pinned empty search_path; authenticated execute granted, anon denied. Prior inspection found complete descriptor validation text in its live definition.
- Supabase migration ledger still records only 22 versions, ending `20261110203341`; none of the thirteen new versions is recorded.

## Outstanding exact-equivalence checks
1. Compare `pg_get_policydef` / `pg_policies.qual,with_check` for participant scope, not merely policy names.
2. Compare unique index `pg_get_indexdef` including columns and partial predicate.
3. Compare CHECK `pg_get_constraintdef` and current validation.
4. Compare live `pg_get_functiondef` to latest `20261111201500` source after normalizing whitespace and function owner/grants; confirm all intermediate changes are subsumed.
5. Check whether other policies permit DELETE/UPDATE to investigation bucket through broader policies; names alone are insufficient.
6. Check grants, object owners, triggers, and migration side effects before recording versions.

## Decision
Do **not** reapply all thirteen SQL migrations or directly insert migration rows. Most expected objects are present, but exact equivalence and all migration side effects are not yet proven. No clinical browser acceptance performed.
