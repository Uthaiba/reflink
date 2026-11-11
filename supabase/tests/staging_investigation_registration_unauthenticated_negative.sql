-- REFLINK synthetic staging: unauthenticated investigation registration negative test.
-- Execute only against staging, in a SQL editor session without an authenticated user JWT.
-- No clinical records are created or changed: the RPC must reject before any UPDATE.
-- Fails closed if the RPC unexpectedly accepts the call.
DO $test$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Test requires a session with no authenticated user';
  END IF;
  BEGIN
    PERFORM public.register_referral_investigation_files(
      '00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb);
    RAISE EXCEPTION 'SECURITY TEST FAILED: unauthenticated registration accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: unauthenticated investigation registration rejected';
  END;
END $test$;
