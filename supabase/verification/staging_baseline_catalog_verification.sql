-- REFLINK staging baseline catalog verification
-- READ-ONLY: safe to execute against staging or production for inventory.
-- This script performs SELECTs only. It does not create, alter, grant, revoke, or delete.
WITH
objects AS (
  SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS functions,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v') AS views,
    (SELECT count(*) FROM pg_indexes WHERE schemaname='public') AS indexes,
    (SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype='f') AS foreign_keys,
    (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) AS triggers,
    (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) AS rls_enabled_tables
),
view_access AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'view', c.relname,
    'owner', pg_get_userbyid(c.relowner),
    'security_invoker', coalesce((SELECT option_value='true' FROM pg_options_to_table(c.reloptions) WHERE option_name='security_invoker'), false),
    'acl', coalesce(c.relacl::text,'(default)')
  ) ORDER BY c.relname),'[]'::jsonb) AS details
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v'
),
auth_triggers AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('trigger',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname),'[]'::jsonb) AS details
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='auth' AND c.relname='users' AND NOT t.tgisinternal
),
default_acls AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'owner',pg_get_userbyid(d.defaclrole),
    'schema',coalesce(n.nspname,'*'),
    'object_type',d.defaclobjtype,
    'acl',d.defaclacl
  ) ORDER BY pg_get_userbyid(d.defaclrole),d.defaclobjtype),'[]'::jsonb) AS details
  FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
  WHERE n.nspname='public' OR d.defaclnamespace=0
)
SELECT jsonb_build_object(
  'expected_snapshot_counts', jsonb_build_object('tables',14,'functions',16,'views',2,'indexes',10,'foreign_keys',23,'triggers',9,'policies',30),
  'actual_counts', to_jsonb(objects),
  'count_checks', jsonb_build_object(
    'tables_match', objects.tables=14,
    'functions_match', objects.functions=16,
    'views_match', objects.views=2,
    'foreign_keys_match', objects.foreign_keys=23,
    'triggers_match', objects.triggers=9,
    'policies_match', objects.policies=30,
    'all_tables_rls_enabled', objects.tables=objects.rls_enabled_tables
  ),
  'analytics_view_access', view_access.details,
  'auth_users_triggers', auth_triggers.details,
  'default_privileges', default_acls.details
) AS verification_report
FROM objects CROSS JOIN view_access CROSS JOIN auth_triggers CROSS JOIN default_acls;
