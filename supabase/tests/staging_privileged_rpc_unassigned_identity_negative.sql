-- Synthetic staging only. Negative RPC authorization for an unassigned JWT identity.
-- Uses deliberately nonexistent referral/facility IDs. No production use.
-- Entire session is rolled back. These checks are not substitutes for real Auth E2E.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $test$
BEGIN
 IF auth.uid() IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid
 OR EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN
  RAISE EXCEPTION 'Preflight failed: expected unassigned synthetic identity';
 END IF;
 BEGIN
  PERFORM public.get_facility_user_counts();
  RAISE EXCEPTION 'FAIL: all facility user counts exposed';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'Administrator access is required to view all facility user counts.' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.get_facility_user_count('00000000-0000-0000-0000-000000000000'::uuid);
  RAISE EXCEPTION 'FAIL: facility user count exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.log_referral_read('00000000-0000-0000-0000-000000000000'::uuid);
  RAISE EXCEPTION 'FAIL: unauthorized referral read audit accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.submit_counter_referral(
   '00000000-0000-0000-0000-000000000000'::uuid,
   'synthetic','synthetic','improved');
  RAISE EXCEPTION 'FAIL: unauthorized counter-referral accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RAISE NOTICE 'PASS: four privileged RPCs reject an unassigned identity';
END $test$;
ROLLBACK;
