-- REFLINK proposal migration — NOT APPROVED FOR EXECUTION.
-- Production catalog audit (2026-11-08) found authenticated has direct,
-- postgres-granted TRUNCATE, TRIGGER and REFERENCES privileges on core
-- application tables. RLS does not constrain TRUNCATE.
--
-- This narrow proposal removes only structural privileges not required by
-- browser workflows. It intentionally leaves SELECT/INSERT/UPDATE/DELETE
-- unchanged pending a complete call-site and column-write review.
-- Apply only after baseline reconstruction, external-consumer review,
-- synthetic staging validation and explicit release approval.

begin;

revoke truncate, trigger, references
  on table public.referrals,
            public.counter_referrals,
            public.profiles,
            public.facilities
  from authenticated;

do $verification$
begin
  if has_table_privilege('authenticated', 'public.referrals', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.counter_referrals', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.facilities', 'TRUNCATE') then
    raise exception 'Authenticated role still has TRUNCATE on a core REFLINK table';
  end if;

  if has_table_privilege('authenticated', 'public.referrals', 'TRIGGER')
     or has_table_privilege('authenticated', 'public.counter_referrals', 'TRIGGER')
     or has_table_privilege('authenticated', 'public.profiles', 'TRIGGER')
     or has_table_privilege('authenticated', 'public.facilities', 'TRIGGER') then
    raise exception 'Authenticated role still has TRIGGER on a core REFLINK table';
  end if;

  if has_table_privilege('authenticated', 'public.referrals', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.counter_referrals', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.profiles', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.facilities', 'REFERENCES') then
    raise exception 'Authenticated role still has REFERENCES on a core REFLINK table';
  end if;
end;
$verification$;

commit;
