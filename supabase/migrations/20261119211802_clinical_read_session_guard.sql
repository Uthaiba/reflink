-- Preserve existing facility visibility rules and require a current clinical session.
create schema if not exists private;
create or replace function private.has_current_clinical_session()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    join public.profiles p on p.id = u.id
    join auth.sessions s on s.user_id = u.id
    where u.id = auth.uid()
      and s.id::text = (auth.jwt() ->> 'session_id')
      and (s.not_after is null or s.not_after > now())
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      and p.must_change_password = false
  );
$$;
revoke all on function private.has_current_clinical_session() from public, anon;
grant execute on function private.has_current_clinical_session() to authenticated;
create policy referral_read_requires_current_session on public.referrals
  as restrictive for select to authenticated using ((select private.has_current_clinical_session()));
create policy feedback_read_requires_current_session on public.counter_referrals
  as restrictive for select to authenticated using ((select private.has_current_clinical_session()));
