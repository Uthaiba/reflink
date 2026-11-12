-- REFLINK synthetic staging only: administrator analytics positive authorization.
-- Simulates a JWT subject at the database level; NOT a real Auth login.
-- Requires the known synthetic staging administrator. No production use.
-- The analytics RPC may return SQL NULL when no referrals exist; success means
-- the authorized invocation completes without an authorization exception.
BEGIN;
DO $preflight$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id='5c5953d2-ed05-4a27-ae48-b5a0691027a0'::uuid
     AND role='administrator'
 ) THEN RAISE EXCEPTION 'Expected synthetic staging administrator is missing'; END IF;
END $preflight$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','5c5953d2-ed05-4a27-ae48-b5a0691027a0',true);
DO $test$
DECLARE visible_count integer;
BEGIN
 SELECT count(*) INTO visible_count FROM public.profiles
 WHERE id=auth.uid() AND role='administrator';
 IF visible_count <> 1 THEN
   RAISE EXCEPTION 'SECURITY TEST FAILED: administrator cannot read own profile';
 END IF;
 PERFORM public.get_referral_analytics_summary();
 RAISE NOTICE 'PASS: staging administrator authorized to invoke analytics';
END $test$;
ROLLBACK;
