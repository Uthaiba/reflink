-- READ-ONLY verification of legacy referral analytics view/RPC boundaries.
-- Run manually against the intended project after confirming the project ID.
-- This reads PostgreSQL catalog metadata and function/view definitions only.
-- It does not read referral rows or modify schema, ACLs, data, or migration history.

select
  c.oid::regclass::text as view_name,
  c.relowner::regrole::text as owner,
  c.reloptions,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_role_select,
  pg_get_viewdef(c.oid, true) as view_definition
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('referral_analytics', 'referral_analytics_summary')
  and c.relkind = 'v'
order by c.relname;

select
  p.oid::regprocedure::text as function_name,
  p.proowner::regrole::text as owner,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_referral_analytics_summary'
order by p.oid::regprocedure::text;
