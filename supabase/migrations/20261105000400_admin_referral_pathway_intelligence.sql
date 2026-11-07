-- REFLINK: aggregate referral pathways and workflow interval distributions.
-- Facility types only; no facility identifiers, names, patient data or user data.
create or replace function public.get_admin_referral_pathway_summary(
  p_start_date date, p_end_date date
)
returns table (
  sending_facility_type text,
  receiving_facility_type text,
  referral_count bigint,
  small_cell_suppressed boolean,
  complementary_suppressed boolean,
  median_acknowledgement_minutes double precision,
  p90_acknowledgement_minutes double precision,
  acknowledgement_interval_suppressed boolean,
  median_arrival_minutes double precision,
  p90_arrival_minutes double precision,
  arrival_interval_suppressed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_administrator() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date
     or p_start_date <> pg_catalog.date_trunc('month', p_start_date)::date
     or p_end_date <> (p_start_date + interval '1 month - 1 day')::date then
    raise exception 'Pathway reporting requires one complete calendar month.'
      using errcode = '22023';
  end if;

  return query
  with cohort as (
    select r.created_at, r.acknowledged_at, r.patient_arrived_at,
      r.referring_facility_id, r.receiving_facility_id
    from public.referrals r
    where r.created_at >= (p_start_date::timestamp at time zone 'Africa/Lagos')
      and r.created_at < ((p_end_date + 1)::timestamp at time zone 'Africa/Lagos')
      and coalesce(r.is_test, false) = false
  ),
  typed as (
    select c.*,
      coalesce(nullif(pg_catalog.btrim(sf.facility_type), ''), 'Unclassified facility type') sending_type,
      coalesce(nullif(pg_catalog.btrim(rf.facility_type), ''), 'Unclassified facility type') receiving_type
    from cohort c
    left join public.facilities sf on sf.id = c.referring_facility_id
    left join public.facilities rf on rf.id = c.receiving_facility_id
  ),
  grouped as (
    select sending_type, receiving_type,
      count(*)::bigint total,
      count(*) filter (where acknowledged_at is not null and acknowledged_at >= created_at) ack_samples,
      count(*) filter (where patient_arrived_at is not null and patient_arrived_at >= created_at) arrival_samples,
      percentile_cont(0.5) within group (
        order by extract(epoch from (acknowledged_at - created_at)) / 60.0
      ) filter (where acknowledged_at is not null and acknowledged_at >= created_at) median_ack,
      percentile_cont(0.9) within group (
        order by extract(epoch from (acknowledged_at - created_at)) / 60.0
      ) filter (where acknowledged_at is not null and acknowledged_at >= created_at) p90_ack,
      percentile_cont(0.5) within group (
        order by extract(epoch from (patient_arrived_at - created_at)) / 60.0
      ) filter (where patient_arrived_at is not null and patient_arrived_at >= created_at) median_arrival,
      percentile_cont(0.9) within group (
        order by extract(epoch from (patient_arrived_at - created_at)) / 60.0
      ) filter (where patient_arrived_at is not null and patient_arrived_at >= created_at) p90_arrival
    from typed
    group by sending_type, receiving_type
  ),
  ranked as (
    select grouped.*,
      count(*) filter (where total between 1 and 4) over () small_group_count,
      row_number() over (order by
        case when total between 1 and 4 then 0 else 1 end,
        total, sending_type, receiving_type) suppression_rank
    from grouped
  ),
  protected as (
    select ranked.*,
      (total between 1 and 4) primary_suppression,
      (small_group_count = 1 and total >= 5 and suppression_rank = 2)
        complementary_suppression
    from ranked
  )
  select
    case when primary_suppression or complementary_suppression
      then 'Suppressed pathway group' else sending_type end,
    case when primary_suppression or complementary_suppression
      then 'Suppressed pathway group' else receiving_type end,
    case when primary_suppression or complementary_suppression then null else total end,
    primary_suppression,
    complementary_suppression,
    case when primary_suppression or complementary_suppression or ack_samples < 5
      then null else median_ack end,
    case when primary_suppression or complementary_suppression or ack_samples < 5
      then null else p90_ack end,
    (primary_suppression or complementary_suppression or ack_samples < 5),
    case when primary_suppression or complementary_suppression or arrival_samples < 5
      then null else median_arrival end,
    case when primary_suppression or complementary_suppression or arrival_samples < 5
      then null else p90_arrival end,
    (primary_suppression or complementary_suppression or arrival_samples < 5)
  from protected
  order by primary_suppression desc, complementary_suppression desc,
    sending_type, receiving_type;
end;
$function$;

revoke all on function public.get_admin_referral_pathway_summary(date, date) from public;
revoke all on function public.get_admin_referral_pathway_summary(date, date) from anon;
grant execute on function public.get_admin_referral_pathway_summary(date, date) to authenticated;
comment on function public.get_admin_referral_pathway_summary(date, date) is
'Administrator-only aggregate pathway counts by sending and receiving facility type, with median and P90 creation-to-acknowledgement and creation-to-arrival intervals. Complete Africa/Lagos calendar month only. Suppresses pathway groups of 1–4 and complementary groups; interval statistics require at least five valid timestamps. No facility, patient or user identifiers returned.';
