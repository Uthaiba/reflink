-- Enforce idempotency for a future encrypted offline referral submission flow.
-- Null client IDs (normal online referrals) remain unrestricted.
-- Scoped to the referring Auth user, avoiding collisions across users.
-- Before applying to a nonempty environment, check duplicates and resolve them
-- with clinical audit review; never delete referrals automatically.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referrer_offline_client_id_unique
ON public.referrals (referring_user_id, offline_client_id)
WHERE offline_client_id IS NOT NULL;
