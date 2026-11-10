-- Run only against the isolated synthetic staging project.
BEGIN;

-- Owner-context structural assertions (before switching to the client role).
DO $baseline$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');
  IF v_count <> 14 THEN RAISE EXCEPTION 'Expected 14 public tables, got %',v_count; END IF;
  SELECT count(*) INTO v_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v';
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected 2 public views, got %',v_count; END IF;
  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f';
  IF v_count <> 16 THEN RAISE EXCEPTION 'Expected 16 public functions, got %',v_count; END IF;
  SELECT count(*) INTO v_count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public';
  IF v_count <> 9 THEN RAISE EXCEPTION 'Expected 9 application triggers, got %',v_count; END IF;
  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname='public';
  IF v_count <> 28 THEN RAISE EXCEPTION 'Expected 28 public policies, got %',v_count; END IF;
  IF has_table_privilege('authenticated','public.audit_log','TRUNCATE') THEN RAISE EXCEPTION 'Authenticated role can TRUNCATE audit_log'; END IF;
  IF has_table_privilege('authenticated','public.referral_events','SELECT') THEN RAISE EXCEPTION 'Authenticated role can read internal referral_events'; END IF;
  IF has_table_privilege('authenticated','public.referral_feedback','SELECT') THEN RAISE EXCEPTION 'Authenticated role can read internal referral_feedback'; END IF;
  IF has_table_privilege('anon','public.referrals','SELECT') THEN RAISE EXCEPTION 'Anonymous role can read referrals'; END IF;
  IF NOT has_table_privilege('service_role','public.referral_analytics','SELECT') THEN RAISE EXCEPTION 'Service role cannot read analytics'; END IF;
  IF to_regclass('public.referral_print_events_referral_print_number_uidx') IS NULL THEN RAISE EXCEPTION 'Referral print numbering unique index is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.log_referral_print(uuid,text)'::regprocedure AND prosecdef AND proconfig @> ARRAY['search_path=""']) THEN RAISE EXCEPTION 'Referral print function lost SECURITY DEFINER or empty search_path'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='guard_profile_security_fields' AND NOT tgisinternal) THEN RAISE EXCEPTION 'Profile security-field guard trigger is missing'; END IF;
  IF position('NEW.must_change_password IS DISTINCT FROM OLD.must_change_password' in pg_get_functiondef('public.guard_profile_security_fields()'::regprocedure)) = 0 THEN RAISE EXCEPTION 'Profile guard does not protect must_change_password'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='referral-investigation-results' AND public=false AND file_size_limit=10485760) THEN RAISE EXCEPTION 'Private attachment bucket missing or misconfigured'; END IF;
  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE '%investigation%';
  IF v_count <> 5 THEN RAISE EXCEPTION 'Expected 5 storage policies, got %',v_count; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='referrals') THEN RAISE EXCEPTION 'Referrals missing from Realtime'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.referral_analytics'::regclass AND reloptions @> ARRAY['security_invoker=true']) THEN RAISE EXCEPTION 'Analytics view is not security_invoker'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.referral_analytics_summary'::regclass AND reloptions @> ARRAY['security_invoker=true']) THEN RAISE EXCEPTION 'Analytics summary view is not security_invoker'; END IF;
END
$baseline$;

-- Runtime authorization assertions under a synthetic, non-admin JWT.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $runtime$
DECLARE
  all_facility_counts_denied boolean := false;
BEGIN
  IF public.is_administrator() THEN RAISE EXCEPTION 'Synthetic non-admin identity resolved as administrator'; END IF;

  -- The facility-specific RPC must reject a null facility for a non-admin.
  BEGIN
    PERFORM public.get_facility_user_count(NULL);
    RAISE EXCEPTION 'Non-admin facility count request unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  -- Capture only the function's expected P0001 denial. Keep the assertion
  -- outside the exception block so our own failure cannot be swallowed.
  BEGIN
    PERFORM * FROM public.get_facility_user_counts();
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    all_facility_counts_denied := true;
  END;

  IF NOT all_facility_counts_denied THEN
    RAISE EXCEPTION 'Non-admin all-facility count request unexpectedly succeeded';
  END IF;
END
$runtime$;
ROLLBACK;
