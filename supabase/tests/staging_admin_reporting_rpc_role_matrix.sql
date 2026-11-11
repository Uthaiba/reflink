-- REFLINK synthetic staging only: six administrator reporting RPCs.
-- Database-level JWT-subject simulation, NOT real Auth login.
-- All changes are transaction-local and rolled back. No production use.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $negative$
DECLARE fn text;
BEGIN
 IF EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN
  RAISE EXCEPTION 'Preflight: unassigned test identity has a profile';
 END IF;
 FOREACH fn IN ARRAY ARRAY[
  'get_admin_acknowledgement_delay_alerts',
  'get_admin_facility_referral_summary',
  'get_admin_facility_reporting_coverage',
  'get_admin_lga_referral_summary',
  'get_admin_referral_pathway_summary',
  'get_admin_referral_volume'
 ] LOOP
  BEGIN
   IF fn='get_admin_acknowledgement_delay_alerts' THEN
    EXECUTE format('SELECT * FROM public.%I()',fn);
   ELSE
    EXECUTE format('SELECT * FROM public.%I($1,$2)',fn)
     USING '2026-10-01'::date,'2026-10-31'::date;
   END IF;
   RAISE EXCEPTION 'SECURITY TEST FAILED: % allowed unassigned identity',fn;
  EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM <> 'Administrator access required.' THEN RAISE; END IF;
  END;
 END LOOP;
 RAISE NOTICE 'PASS: all six reporting RPCs deny unassigned identity';
END $negative$;
ROLLBACK;

BEGIN;
DO $preflight$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles
  WHERE id='5c5953d2-ed05-4a27-ae48-b5a0691027a0'::uuid
    AND role='administrator') THEN
  RAISE EXCEPTION 'Preflight: expected synthetic staging administrator absent';
 END IF;
END $preflight$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','5c5953d2-ed05-4a27-ae48-b5a0691027a0',true);
DO $positive$
DECLARE fn text; result_count bigint;
BEGIN
 FOREACH fn IN ARRAY ARRAY[
  'get_admin_acknowledgement_delay_alerts',
  'get_admin_facility_referral_summary',
  'get_admin_facility_reporting_coverage',
  'get_admin_lga_referral_summary',
  'get_admin_referral_pathway_summary',
  'get_admin_referral_volume'
 ] LOOP
  IF fn='get_admin_acknowledgement_delay_alerts' THEN
   EXECUTE format('SELECT count(*) FROM public.%I()',fn) INTO result_count;
  ELSE
   EXECUTE format('SELECT count(*) FROM public.%I($1,$2)',fn)
     INTO result_count USING '2026-10-01'::date,'2026-10-31'::date;
  END IF;
 END LOOP;
 RAISE NOTICE 'PASS: all six reporting RPCs execute for staging administrator';
END $positive$;
ROLLBACK;
