-- REFLINK Auth provisioning verification
-- READ-ONLY: catalog inspection only. Safe to run against production or staging.
-- Does not create, alter, or execute application functions.

WITH auth_user_triggers AS (
  SELECT t.tgname,
         c.relname AS table_name,
         pg_get_triggerdef(t.oid, true) AS trigger_definition,
         p.proname AS function_name
  FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE n.nspname='auth'
    AND c.relname='users'
    AND NOT t.tgisinternal
),
provisioner AS (
  SELECT p.oid, p.proname, pg_get_userbyid(p.proowner) AS owner,
         p.prosecdef AS security_definer,
         p.proconfig AS function_config,
         pg_get_functiondef(p.oid) AS definition,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'grantee', CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
             'privilege', a.privilege_type,
             'grantable', a.is_grantable
           ) ORDER BY a.grantee,a.privilege_type)
           FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
         ),'[]'::jsonb) AS execute_acl
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='handle_new_user'
)
SELECT jsonb_build_object(
  'database', current_database(),
  'server_version', current_setting('server_version'),
  'auth_users_triggers', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'trigger',tgname,'table',table_name,
      'function',function_name,'definition',trigger_definition
    ) ORDER BY tgname)
    FROM auth_user_triggers
  ),'[]'::jsonb),
  'handle_new_user', COALESCE((
    SELECT jsonb_build_object(
      'owner',owner,
      'security_definer',security_definer,
      'function_config',function_config,
      'execute_acl',execute_acl,
      'definition',definition
    ) FROM provisioner
  ),'null'::jsonb)
) AS auth_provisioning_review;
