create table private.correction_reviewers (
  user_id uuid not null references public.profiles(id),
  facility_id uuid not null references public.facilities(id),
  primary key(user_id, facility_id)
);
create table private.clinical_addenda (
  id uuid primary key,
  referral_id uuid not null references public.referrals(id),
  facility_id uuid not null references public.facilities(id),
  requested_by uuid not null references public.profiles(id),
  reason text not null,
  amendment text not null,
  requested_at timestamptz not null default now()
);
create index clinical_addenda_referral on private.clinical_addenda(referral_id,requested_at);
create table private.addendum_decisions (
  request_id uuid primary key references private.clinical_addenda(id),
  reviewer uuid not null references public.profiles(id),
  decision text not null check(decision in ('approved','declined')),
  reviewed_at timestamptz not null default now()
);
revoke all on private.correction_reviewers,private.clinical_addenda,private.addendum_decisions from public,anon,authenticated;
alter table private.correction_reviewers enable row level security;
alter table private.clinical_addenda enable row level security;
alter table private.addendum_decisions enable row level security;

create function public.closed_record_addenda(p_referral uuid,p_action text default 'list',
  p_request uuid default null,p_reason text default null,p_amendment text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  facility uuid;
  reviewer boolean;
  item private.clinical_addenda;
begin
  if private.has_current_clinical_session() is not true then
    raise exception 'Current session required' using errcode='42501';
  end if;
  select p.facility_id into facility from public.profiles p join public.referrals r on r.id=p_referral
    where p.id=actor and r.status='completed' and (
      (p.role='phc_staff' and r.referring_facility_id=p.facility_id) or
      (p.role='receiving_staff' and r.receiving_facility_id=p.facility_id))
    for share of p,r;
  if facility is null then raise exception 'Access denied' using errcode='42501'; end if;
  select exists(select 1 from private.correction_reviewers g where g.user_id=actor and g.facility_id=facility)
    into reviewer;
  if p_action='request' then
    if p_request is null or length(trim(coalesce(p_reason,''))) not between 1 and 1000
      or length(trim(coalesce(p_amendment,''))) not between 1 and 4000 then
      raise exception 'Reason and addendum required' using errcode='22023';
    end if;
    insert into private.clinical_addenda(id,referral_id,facility_id,requested_by,reason,amendment)
      values(p_request,p_referral,facility,actor,trim(p_reason),trim(p_amendment)) on conflict do nothing;
    if not exists(select 1 from private.clinical_addenda a where a.id=p_request and a.requested_by=actor
      and a.referral_id=p_referral and a.facility_id=facility and a.reason=trim(p_reason) and a.amendment=trim(p_amendment))
      then raise exception 'Conflicting request' using errcode='22023'; end if;
  elsif p_action in ('approved','declined') then
    select * into item from private.clinical_addenda where id=p_request and referral_id=p_referral and facility_id=facility for update;
    if not reviewer or item.id is null or item.requested_by=actor then
      raise exception 'Independent facility reviewer required' using errcode='42501';
    end if;
    insert into private.addendum_decisions values(item.id,actor,p_action,now()) on conflict do nothing;
    if not exists(select 1 from private.addendum_decisions d where d.request_id=item.id and d.reviewer=actor and d.decision=p_action)
      then raise exception 'Already reviewed' using errcode='55000'; end if;
  elsif p_action is distinct from 'list' then raise exception 'Invalid action' using errcode='22023';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'reason',a.reason,'amendment',a.amendment,
    'status',coalesce(d.decision,'pending'),'requested_at',a.requested_at,'reviewed_at',d.reviewed_at,
    'can_review',reviewer and a.facility_id=facility and a.requested_by<>actor and d.request_id is null)
    order by a.requested_at,a.id) from private.clinical_addenda a left join private.addendum_decisions d on d.request_id=a.id
    where a.referral_id=p_referral and (a.facility_id=facility or d.decision='approved')),'[]'::jsonb);
end $$;
revoke all on function public.closed_record_addenda(uuid,text,uuid,text,text) from public,anon;
grant execute on function public.closed_record_addenda(uuid,text,uuid,text,text) to authenticated;
