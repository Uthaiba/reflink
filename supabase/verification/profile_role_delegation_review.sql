-- READ-ONLY: inspect whether profile role delegation is enforced at the database boundary.
-- Run against production only for inspection; never append DDL to this file.

-- 1. Profile triggers and their function bodies.
select
  t.tgname,
  pg_get_triggerdef(t.oid, true) as trigger_definition,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relname = 'profiles'
  and not t.tgisinternal
order by t.tgname;

-- 2. Row-level policies affecting profile inserts and updates.
select
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;

-- 3. Direct UPDATE column privileges for browser-authenticated callers.
select
  grantee,
  privilege_type,
  column_name
from information_schema.role_column_grants
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
order by column_name;

-- Interpretation:
-- RLS controls which rows can be updated, not which columns can be changed.
-- If authenticated administrators can UPDATE profiles.role, a dashboard-only
-- restriction is bypassable by direct Data API calls. A database-side policy,
-- trigger or constrained privileged RPC must enforce the delegation decision.
-- Do not apply a proposed fix until it has been tested on the reconstructed
-- synthetic staging baseline and reviewed for legitimate administrator recovery.
