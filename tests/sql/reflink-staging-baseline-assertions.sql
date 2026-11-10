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
BEGIN
  IF public.is_administrator() THEN RAISE EXCEPTION 'Synthetic non-admin identity resolved as administrator'; END IF;
  BEGIN
    PERFORM public.get_facility_user_count(NULL);
    RAISE EXCEPTION 'Non-admin facility count request unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.get_facility_user_counts();
    RAISE EXCEPTION 'Non-admin all-facility count request unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END
$runtime$;
ROLLBACK;
