-- REFLINK staging only: version-by-version migration effect evidence.
-- This is a cumulative-state evidence map, NOT proof that every historical
-- intermediate definition was executed. Never use it alone to repair history.
WITH evidence(version, migration_effect, observed) AS (
 VALUES
 ('20261111160000','no investigation storage DELETE policy',NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd IN ('DELETE','ALL'))),
 ('20261111163000','no investigation storage UPDATE policy',NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd IN ('UPDATE','ALL'))),
 ('20261111170000','participant-scoped storage SELECT and INSERT',
  (SELECT count(*)=2 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND
   ((cmd='SELECT' AND qual LIKE '%referring_user_id%' AND qual LIKE '%receiving_facility_id%' AND qual LIKE '%referral-investigation-results%')
   OR (cmd='INSERT' AND with_check LIKE '%referring_user_id%' AND with_check LIKE '%receiving_facility_id%' AND with_check LIKE '%referral-investigation-results%')))),
 ('20261111173000','unique offline retry index',EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='referrals_referrer_offline_client_id_unique' AND indexdef LIKE '%UNIQUE INDEX%' AND indexdef LIKE '%(referring_user_id, offline_client_id)%')),
 ('20261111180000','participant-scoped notification SELECT policy',EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='referral_notifications' AND policyname='Referral participants can view notification log' AND qual LIKE '%referring_user_id%' AND qual LIKE '%receiving_facility_id%')),
 ('20261111183000','offline retry CHECK exists',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.referrals'::regclass AND conname='referrals_offline_submission_key_required' AND contype='c')),
 ('20261111184500','offline retry CHECK validated',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.referrals'::regclass AND conname='referrals_offline_submission_key_required' AND convalidated)),
 ('20261111190000','registration RPC present and PHC-restricted',EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.register_referral_investigation_files(uuid,jsonb)'::regprocedure AND prosecdef AND pg_get_functiondef(oid) LIKE '%PHC facility authorization required%')),
 ('20261111191500','empty investigation array guard',position('IF jsonb_array_length(p_records) > 0 THEN' IN pg_get_functiondef('public.register_referral_investigation_files(uuid,jsonb)'::regprocedure))>0),
 ('20261111193000','authenticated-only analytics execution',has_function_privilege('authenticated','public.get_referral_analytics_summary()','EXECUTE') AND NOT has_function_privilege('anon','public.get_referral_analytics_summary()','EXECUTE')),
 ('20261111194500','registered metadata immutable',position('Registered investigation file metadata cannot be modified' IN pg_get_functiondef('public.register_referral_investigation_files(uuid,jsonb)'::regprocedure))>0),
 ('20261111200000','SQL NULL payload rejected',position('jsonb_typeof(p_records) IS DISTINCT FROM' IN pg_get_functiondef('public.register_referral_investigation_files(uuid,jsonb)'::regprocedure))>0),
 ('20261111201500','complete file descriptors required',position('Incomplete investigation file descriptor' IN pg_get_functiondef('public.register_referral_investigation_files(uuid,jsonb)'::regprocedure))>0)
)
SELECT e.version,e.migration_effect,
 CASE WHEN e.observed THEN 'PASS' ELSE 'FAIL' END AS final_effect_check,
 CASE WHEN m.version IS NOT NULL THEN 'RECORDED' ELSE 'MISSING' END AS migration_ledger,
 'Final-state evidence only; source-to-catalog equivalence review and staging backup required before repair' AS limitation
FROM evidence e LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
ORDER BY e.version;
