-- REFLINK privileged RPC review: read-only production catalog verifier.
-- Run manually in the SQL editor. This script reads metadata and definitions only.

-- 1. Function ownership, security mode, volatility, settings and effective grants.
select p.oid::regprocedure as signature,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer,
       p.provolatile as volatility,
       p.proconfig as function_settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
       coalesce(array_to_string(p.proacl, ', '), '(default ACL)') as acl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_administrator',
    'is_current_user_administrator',
    'log_referral_read',
    'log_referral_print'
  )
order by p.proname, p.oid::regprocedure::text;

-- 2. Policies with direct dependencies on is_administrator().
select c.relname as table_name,
       pol.polname as policy_name,
       pol.polcmd as command,
       pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expression
from pg_depend d
join pg_proc f on f.oid = d.refobjid
join pg_namespace n on n.oid = f.pronamespace
join pg_policy pol on d.classid = 'pg_policy'::regclass and pol.oid = d.objid
join pg_class c on c.oid = pol.polrelid
where n.nspname = 'public'
  and f.proname = 'is_administrator'
order by c.relname, pol.polname;

-- 3. Audit-log schema metadata (no audit records read).
select ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'audit_log'
order by ordinal_position;

-- 4. Print-event constraints (no print events read).
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.referral_print_events'::regclass
order by contype, conname;
