-- Require an unambiguous retry key for referrals marked as offline submissions.
-- Existing online/legacy referrals are unaffected.
-- This complements the per-referrer unique partial index.
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_offline_submission_key_required
  CHECK (
    sync_source IS DISTINCT FROM 'offline'
    OR (
      referring_user_id IS NOT NULL
      AND offline_client_id IS NOT NULL
      AND offline_client_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ) NOT VALID;
-- Validate only after checking legacy rows in any populated environment.
