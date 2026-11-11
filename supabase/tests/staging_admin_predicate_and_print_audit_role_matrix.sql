-- REFLINK synthetic staging: administrator predicate and print audit authorization.
-- Tests simulate JWT subjects at database level, not real Auth sessions.
-- Rollback-only, no production use.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $negative$
BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN
  RAISE EXCEPTION 'Unexpected profile for unassigned identity';
 END IF;
 IF public.is_administrator() IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'SECURITY TEST FAILED: unassigned identity treated as admin';
 END IF;
 BEGIN
  PERFORM public.log_referral_print('00000000-0000-0000-0000-000000000000'::uuid,'SYNTHETIC');
  RAISE EXCEPTION 'SECURITY TEST FAILED: unauthorized print logging accepted';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'Not authorized to print this referral.' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'PASS: admin predicate false and unauthorized print logging rejected';
END $negative$;
ROLLBACK;
BEGIN;
DO $preflight$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles
  WHERE id='5c5953d2-ed05-4a27-ae48-b5a0691027a0'::uuid
    AND role='administrator') THEN
  RAISE EXCEPTION 'Staging administrator missing';
 END IF;
END $preflight$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','5c5953d2-ed05-4a27-ae48-b5a0691027a0',true);
DO $positive$
BEGIN
 IF public.is_administrator() IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'SECURITY TEST FAILED: administrator predicate returned false';
 END IF;
 RAISE NOTICE 'PASS: administrator predicate true for staging admin';
END $positive$;
ROLLBACK;
