-- REFLINK synthetic staging only: authenticated database role with no JWT identity.
-- Runs negative authorization tests inside a rolled-back transaction.
-- Do not run against production. A successful execution returns no rows.
BEGIN;
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Test requires a null auth.uid';
  END IF;
  BEGIN
    PERFORM public.register_referral_investigation_files(
      '00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb);
    RAISE EXCEPTION 'SECURITY TEST FAILED: registration accepted missing identity';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: investigation registration requires identity';
  END;
  BEGIN
    PERFORM public.get_referral_analytics_summary();
    RAISE EXCEPTION 'SECURITY TEST FAILED: analytics accepted nonadministrator';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'Administrator access required to view referral analytics.' THEN
      RAISE;
    END IF;
    RAISE NOTICE 'PASS: analytics rejects nonadministrator';
  END;
END $test$;
ROLLBACK;
