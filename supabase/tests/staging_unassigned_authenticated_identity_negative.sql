-- REFLINK synthetic staging: unassigned authenticated identity negative test.
-- This simulates the database JWT subject for an unassigned user; it is NOT
-- a real end-to-end Auth login test. Do not run against production.
-- All settings and test operations are rolled back.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $test$
BEGIN
 IF auth.uid() IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN
   RAISE EXCEPTION 'Synthetic identity not set';
 END IF;
 IF EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN
   RAISE EXCEPTION 'Synthetic identity unexpectedly has a profile';
 END IF;
 BEGIN
   PERFORM public.register_referral_investigation_files(
     '00000000-0000-0000-0000-000000000000'::uuid,'[]'::jsonb);
   RAISE EXCEPTION 'SECURITY TEST FAILED: unassigned identity registered files';
 EXCEPTION WHEN insufficient_privilege THEN
   RAISE NOTICE 'PASS: unassigned identity denied investigation registration';
 END;
 BEGIN
   PERFORM public.get_referral_analytics_summary();
   RAISE EXCEPTION 'SECURITY TEST FAILED: unassigned identity accessed analytics';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM <> 'Administrator access required to view referral analytics.' THEN RAISE; END IF;
   RAISE NOTICE 'PASS: unassigned identity denied administrator analytics';
 END;
END $test$;
ROLLBACK;
