-- REFLINK synthetic staging only: profile confidentiality with a synthetic JWT subject.
-- Requires at least one staging profile to make this a meaningful RLS test.
-- Uses no Auth account creation and rolls back all session settings.
BEGIN;
DO $preflight$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
   RAISE EXCEPTION 'Inconclusive: staging has no profiles to protect';
 END IF;
END $preflight$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $test$
DECLARE visible_count integer;
BEGIN
 IF auth.uid() IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN
   RAISE EXCEPTION 'Synthetic identity not applied';
 END IF;
 IF EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN
   RAISE EXCEPTION 'Inconclusive: synthetic user unexpectedly has a profile';
 END IF;
 SELECT count(*) INTO visible_count FROM public.profiles;
 IF visible_count <> 0 THEN
   RAISE EXCEPTION 'SECURITY TEST FAILED: unassigned user can read % profiles',visible_count;
 END IF;
 RAISE NOTICE 'PASS: unassigned identity cannot read existing user profiles';
END $test$;
ROLLBACK;
