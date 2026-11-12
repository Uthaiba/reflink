# REFLINK staging exact-definition verification — 2026-11-11

Read-only catalog checks against synthetic staging project `rcskuzmvyugbanygizri`, compared with the 13 post-baseline migration sources on `reflink/staging-baseline-reconstruction-20261110`.

## Verified
- Storage `objects` investigation SELECT and INSERT policies: `authenticated` only; bucket `referral-investigation-results`; access by referral's referring user or `receiving_staff` with matching receiving facility. No investigation-specific DELETE or UPDATE policy appears in the enumerated storage policy catalog.
- `public.referral_notifications` participant SELECT policy: authenticated, administrator OR referral's author OR receiving staff at assigned facility.
- Unique index `referrals_referrer_offline_client_id_unique`: exactly btree `(referring_user_id, offline_client_id) WHERE offline_client_id IS NOT NULL`.
- `referrals_offline_submission_key_required`: matches offline-only UUID-formatted retry-key check and is validated.
- `public.register_referral_investigation_files(uuid,jsonb)`: live function definition contains complete descriptor guard, immutable registered metadata guard, empty-array guard and null-payload guard; earlier checks confirmed SECURITY DEFINER, empty search_path, anon denied and authenticated granted.
- `public.get_referral_analytics_summary()`: authenticated EXECUTE allowed; anon denied.

## Limits
These are live catalog/guard-presence checks, not a byte-for-byte function diff, policy behavioral proof, or Auth-issued browser test. The Supabase migration ledger still contains 22 versions through `20261110203341` and omits 13 subsequent source versions. Do not assume all 13 migration side effects are proven equivalent or mark them applied without final review.

## Next release gates
1. Independent review of remaining permissions and cross-policy interactions.
2. Exact function definition comparison and controlled migration ledger repair.
3. CI and authenticated synthetic PHC/receiving/admin browser acceptance.
4. Explicit production release approval. No production writes performed.
