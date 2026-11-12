-- REFLINK synthetic staging read-only migration equivalence gate.
-- Run in staging SQL editor; never execute against production.
-- Returns PASS/FAIL per guard. Does not alter data, policies or migration history.
WITH checks AS (
 SELECT 'migration_ledger_current' AS control,
        EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261111201500') AS passed,
        'Latest source migration must be recorded only after controlled reconciliation' AS expectation
 UNION ALL SELECT 'offline_idempotency_index',
        EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
          AND indexname='referrals_referrer_offline_client_id_unique'
          AND indexdef LIKE '%(referring_user_id, offline_client_id)%'
          AND indexdef LIKE '%WHERE (offline_client_id IS NOT NULL)%'),
        'Unique referrer/client key with non-null partial predicate'
 UNION ALL SELECT 'offline_retry_constraint_validated',
        EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.referrals'::regclass
          AND conname='referrals_offline_submission_key_required' AND convalidated),
        'Offline retry key CHECK exists and is validated'
 UNION ALL SELECT 'investigation_bucket_private_and_bounded',
        EXISTS (SELECT 1 FROM storage.buckets WHERE id='referral-investigation-results'
          AND public IS FALSE AND file_size_limit = 10485760
          AND allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png']::text[]),
        'Investigation bucket must be private with 10 MiB file cap and supported clinical formats'
 UNION ALL SELECT 'investigation_storage_no_client_mutation_policy',
        NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
          AND cmd IN ('UPDATE','DELETE','ALL')),
        'No Storage UPDATE, DELETE or ALL policy grants client mutation'
 UNION ALL SELECT 'investigation_storage_participant_select',
        EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
          AND policyname='Authenticated users can view investigation result files'
          AND cmd='SELECT' AND roles::text LIKE '%authenticated%'
          AND qual LIKE '%referral-investigation-results%'
          AND qual LIKE '%referring_user_id%'
          AND qual LIKE '%receiving_facility_id%'),
        'Read policy checks referral author or receiving facility participant'
 UNION ALL SELECT 'investigation_storage_participant_insert',
        EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
          AND policyname='Authorized users can upload investigation result files'
          AND cmd='INSERT' AND roles::text LIKE '%authenticated%'
          AND with_check LIKE '%referral-investigation-results%'
          AND with_check LIKE '%referring_user_id%'
          AND with_check LIKE '%receiving_facility_id%'),
        'Upload policy checks referral author or receiving facility participant'
 UNION ALL SELECT 'sensitive_rpcs_authenticated_only',
        (SELECT count(*) = 2 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public'
          AND p.proname IN ('get_referral_analytics_summary','register_referral_investigation_files')
          AND p.prosecdef
          AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
          AND has_function_privilege('authenticated',p.oid,'EXECUTE')),
        'Clinical registration and administrator analytics RPCs must deny anonymous execution'
 UNION ALL SELECT 'clinical_tables_rls_enabled',
        (SELECT count(*) = 4 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.relrowsecurity AND
            ((n.nspname='public' AND c.relname IN ('referrals','profiles','referral_notifications'))
             OR (n.nspname='storage' AND c.relname='objects'))),
        'RLS remains enabled on referrals, profiles, notifications and storage objects'
 UNION ALL SELECT 'profile_role_escalation_trigger_guard',
        EXISTS (SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid='public.profiles'::regclass
          AND t.tgname='guard_profile_security_fields' AND NOT t.tgisinternal
          AND (t.tgtype & 16) = 16
          AND pg_get_functiondef(t.tgfoid) LIKE '%NEW.role IS DISTINCT FROM OLD.role%'
          AND pg_get_functiondef(t.tgfoid) LIKE '%NEW.facility_id IS DISTINCT FROM OLD.facility_id%'
          AND pg_get_functiondef(t.tgfoid) LIKE '%Only administrators can change protected profile fields%'),
        'Self-profile updates cannot alter role or facility without administrator authorization'
 UNION ALL SELECT 'referrals_authenticated_no_direct_update',
        NOT has_table_privilege('authenticated','public.referrals','UPDATE'),
        'Authenticated clients cannot bypass guarded referral mutation via direct UPDATE'
 UNION ALL SELECT 'referrals_anonymous_no_access',
        NOT has_table_privilege('anon','public.referrals','SELECT,INSERT,UPDATE,DELETE'),
        'Anonymous clients have no referral table privileges'
 UNION ALL SELECT 'notification_log_participant_policy',
        EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='referral_notifications'
          AND policyname='Referral participants can view notification log'
          AND cmd='SELECT' AND roles::text LIKE '%authenticated%'
          AND qual LIKE '%is_administrator()%'
          AND qual LIKE '%referring_user_id%'
          AND qual LIKE '%receiving_facility_id%'),
        'Notification log read policy checks administrator or referral participant'
 UNION ALL SELECT 'investigation_registration_function_guards',
        EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='register_referral_investigation_files'
            AND pg_get_function_identity_arguments(p.oid)='p_referral_id uuid, p_records jsonb'
            AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']::text[]
            AND pg_get_functiondef(p.oid) LIKE '%Incomplete investigation file descriptor%'
            AND pg_get_functiondef(p.oid) LIKE '%Registered investigation file metadata cannot be modified%'
            AND pg_get_functiondef(p.oid) LIKE '%IF jsonb_array_length(p_records) > 0 THEN%'
            AND pg_get_functiondef(p.oid) LIKE '%IS DISTINCT FROM ''array''%'),
        'Latest registration guards, SECURITY DEFINER and pinned search path'
 UNION ALL SELECT 'investigation_registration_anon_denied',
        NOT has_function_privilege('anon','public.register_referral_investigation_files(uuid,jsonb)','EXECUTE'),
        'Anonymous callers cannot register investigation metadata'
 UNION ALL SELECT 'admin_analytics_runtime_role_guard',
        position('IF NOT public.is_current_user_administrator() THEN' in
          pg_get_functiondef('public.get_referral_analytics_summary()'::regprocedure)) > 0,
        'Analytics function itself rejects non-administrator callers'
 UNION ALL SELECT 'admin_analytics_anon_denied',
        NOT has_function_privilege('anon','public.get_referral_analytics_summary()','EXECUTE'),
        'Anonymous callers cannot invoke analytics'
)
SELECT control, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status, expectation
FROM checks ORDER BY control;
