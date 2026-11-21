create or replace function public.receiving_escalation_seen_at(public.referrals)
returns timestamptz language sql stable security definer set search_path='' as $$
 select min(e.created_at) from public.referral_events e
 where e.referral_id=$1.id and e.event_type='sla_escalation_seen'
 and public.receiving_escalated_at($1) is not null
$$;
create or replace function public.confirm_escalation_seen(p_referral uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare target public.referrals; seen timestamptz;
begin
 select r.* into target from public.referrals r join public.profiles p on p.facility_id=r.receiving_facility_id
 join auth.users u on u.id=p.id join auth.sessions s on s.user_id=u.id and s.id::text=auth.jwt()->>'session_id'
 where r.id=p_referral and p.id=auth.uid() and p.role='receiving_staff' and p.must_change_password=false
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
 and (s.not_after is null or s.not_after>now()) for update of r for share of p,u,s;
 if not found or public.receiving_escalated_at(target) is null then
   raise exception 'Escalation unavailable' using errcode='42501';
 end if;
 select min(created_at) into seen from public.referral_events where referral_id=target.id and event_type='sla_escalation_seen';
 if seen is null then
   insert into public.referral_events(referral_id,event_type,event_description,performed_by)
   values(target.id,'sla_escalation_seen','Receiving staff confirmed seeing the escalation.',auth.uid()) returning created_at into seen;
 end if;
 return seen;
end $$;
revoke all on function public.receiving_escalation_seen_at(public.referrals),public.confirm_escalation_seen(uuid) from public,anon;
grant execute on function public.receiving_escalation_seen_at(public.referrals),public.confirm_escalation_seen(uuid) to authenticated;
notify pgrst,'reload schema';
