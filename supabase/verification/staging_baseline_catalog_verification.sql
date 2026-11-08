-- REFLINK staging baseline catalog verification
-- READ-ONLY: SELECT statements only. No DDL, DML, grants, revokes, or configuration changes.
WITH
public_relations AS (
  SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
),
public_functions AS (
  SELECT p.proname, pg_get_userbyid(p.proowner) AS owner,
         p.prosecdef AS security_definer, p.proconfig AS function_config,
         pg_get_function_identity_arguments(p.oid) AS identity_arguments
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
),
auth_triggers AS (
  SELECT t.tgname, c.relname AS table_name, t.tgenabled
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='auth' AND NOT t.tgisinternal
),
default_acls AS (
  SELECT pg_get_userbyid(d.defaclrole) AS grantor, n.nspname AS schema_name,
         d.defaclobjtype AS object_type, d.defaclacl::text AS acl
  FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
),
public_schema_privileges AS (
  SELECT r.rolname,
         has_schema_privilege(r.oid,'public','USAGE') AS has_usage,
         has_schema_privilege(r.oid,'public','CREATE') AS has_create
  FROM pg_roles r
  WHERE r.rolname IN ('anon','authenticated','service_role','postgres','supabase_admin')
)
SELECT jsonb_build_object(
  'database',current_database(),
  'server_version',current_setting('server_version'),
  'public_relation_counts',jsonb_build_object(
    'tables',(SELECT count(*) FROM public_relations WHERE relkind IN ('r','p')),
    'views',(SELECT count(*) FROM public_relations WHERE relkind='v'),
    'materialized_views',(SELECT count(*) FROM public_relations WHERE relkind='m'),
    'rls_enabled_tables',(SELECT count(*) FROM public_relations WHERE relkind IN ('r','p') AND relrowsecurity),
    'rls_forced_tables',(SELECT count(*) FROM public_relations WHERE relkind IN ('r','p') AND relforcerowsecurity)
  ),
  'public_relations',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'name',relname,'kind',relkind,'rls_enabled',relrowsecurity,'rls_forced',relforcerowsecurity
  ) ORDER BY relname) FROM public_relations),'[]'::jsonb),
  'public_function_count',(SELECT count(*) FROM public_functions),
  'public_functions',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'name',proname,'arguments',identity_arguments,'owner',owner,
    'security_definer',security_definer,'config',function_config
  ) ORDER BY proname,identity_arguments) FROM public_functions),'[]'::jsonb),
  'public_view_grants',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'view',c.relname,
      'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      'privilege',x.privilege_type,'grantable',x.is_grantable
    ) ORDER BY c.relname,x.grantee,x.privilege_type)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
    WHERE n.nspname='public' AND c.relkind='v'
  ),'[]'::jsonb),
  'auth_non_internal_triggers',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'trigger',tgname,'table',table_name,'enabled_state',tgenabled
  ) ORDER BY tgname) FROM auth_triggers),'[]'::jsonb),
  'default_privileges',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'grantor',grantor,'schema',schema_name,'object_type',object_type,'acl',acl
  ) ORDER BY grantor,schema_name,object_type) FROM default_acls),'[]'::jsonb),
  'public_schema_privileges',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'role',rolname,'usage',has_usage,'create',has_create
  ) ORDER BY rolname) FROM public_schema_privileges),'[]'::jsonb)
) AS staging_catalog_verification;
