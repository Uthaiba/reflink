create or replace function public.receiving_escalated_at(public.referrals)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select min(e.created_at)
  from public.referral_events e
  join public.referrals r on r.id=e.referral_id
  join public.profiles p on p.facility_id=r.receiving_facility_id
  join auth.users u on u.id=p.id
  join auth.sessions s on s.user_id=u.id and s.id::text=auth.jwt()->>'session_id'
  where r.id=$1.id and e.event_type='sla_escalation'
    and p.id=auth.uid() and p.role='receiving_staff' and p.must_change_password=false
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
    and (s.not_after is null or s.not_after>now())
$$;
revoke all on function public.receiving_escalated_at(public.referrals) from public,anon;
grant execute on function public.receiving_escalated_at(public.referrals) to authenticated;
notify pgrst,'reload schema';
