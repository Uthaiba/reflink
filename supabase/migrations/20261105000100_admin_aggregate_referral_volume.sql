-- REFLINK Phase 1: transactional counter-referral completion and aggregate reporting.
-- Review and apply only after the migration baseline is reconciled and tested in staging.
-- This migration does not add administrator row-level SELECT access to referrals.

create or replace function public.submit_counter_referral(
  p_referral_id uuid,
  p_final_diagnosis text,
  p_treatment_provided text,
  p_outcome text,
  p_follow_up_instructions text default null,
  p_referred_further_to text default null,
  p_additional_notes text default null
)
returns table (
  counter_referral_id uuid,
  referral_status text,
  already_recorded boolean,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_facility_id uuid;
  v_receiving_facility_id uuid;
  v_status text;
  v_existing_id uuid;
  v_existing_user_id uuid;
  v_counter_referral_id uuid;
  v_already_recorded boolean := false;
  v_completed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.role, p.facility_id
    into v_role, v_facility_id
    from public.profiles p
   where p.id = v_user_id;

  if v_role is distinct from 'receiving_staff' or v_facility_id is null then
    raise exception 'Receiving-facility staff access required.' using errcode = '42501';
  end if;

  if p_referral_id is null
     or p_final_diagnosis is null
     or p_outcome is null
     or nullif(pg_catalog.btrim(p_final_diagnosis), '') is null
     or p_outcome not in ('recovered', 'improved', 'referred_further', 'died', 'other')
     or (p_outcome = 'referred_further' and nullif(pg_catalog.btrim(p_referred_further_to), '') is null)
     or pg_catalog.char_length(p_final_diagnosis) > 4000
     or pg_catalog.char_length(coalesce(p_treatment_provided, '')) > 6000
     or pg_catalog.char_length(coalesce(p_follow_up_instructions, '')) > 4000
     or pg_catalog.char_length(coalesce(p_referred_further_to, '')) > 500
     or pg_catalog.char_length(coalesce(p_additional_notes, '')) > 4000 then
    raise exception 'Counter-referral details are invalid or incomplete.' using errcode = '22023';
  end if;

  -- Lock the referral to serialise concurrent submissions for the same episode.
  select r.receiving_facility_id, r.status
    into v_receiving_facility_id, v_status
    from public.referrals r
   where r.id = p_referral_id
   for update;

  if not found then
    raise exception 'Referral not found.' using errcode = 'P0002';
  end if;

  if v_receiving_facility_id is distinct from v_facility_id then
    raise exception 'This referral is not assigned to your facility.' using errcode = '42501';
  end if;

  select c.id, c.receiving_user_id
    into v_existing_id, v_existing_user_id
    from public.counter_referrals c
   where c.referral_id = p_referral_id;

  if v_status = 'completed' then
    if v_existing_id is not null and v_existing_user_id = v_user_id then
      select r.completed_at into v_completed_at
        from public.referrals r
       where r.id = p_referral_id;
      return query select v_existing_id, 'completed'::text, true, v_completed_at;
      return;
    end if;
    raise exception 'This referral has already been completed.' using errcode = '55000';
  end if;

  if v_status <> 'discharged' then
    raise exception 'Only discharged referrals can receive final counter-referral feedback.' using errcode = '55000';
  end if;

  if v_existing_id is not null then
    raise exception 'A counter-referral already exists for this discharged episode. Reconcile it through the authorised clinical workflow before completion.' using errcode = '23505';
  else
    insert into public.counter_referrals (
      referral_id,
      receiving_user_id,
      final_diagnosis,
      treatment_provided,
      outcome,
      follow_up_instructions,
      referred_further_to,
      additional_notes
    ) values (
      p_referral_id,
      v_user_id,
      pg_catalog.btrim(p_final_diagnosis),
      nullif(pg_catalog.btrim(coalesce(p_treatment_provided, '')), ''),
      p_outcome,
      nullif(pg_catalog.btrim(coalesce(p_follow_up_instructions, '')), ''),
      case when p_outcome = 'referred_further'
        then nullif(pg_catalog.btrim(coalesce(p_referred_further_to, '')), '')
        else null end,
      nullif(pg_catalog.btrim(coalesce(p_additional_notes, '')), '')
    )
    returning id into v_counter_referral_id;
  end if;

  -- The existing database trigger also enforces the counter-referral guard.
  update public.referrals
     set status = 'completed',
         completed_at = coalesce(completed_at, pg_catalog.now())
   where id = p_referral_id
   returning completed_at into v_completed_at;

  return query select v_counter_referral_id, 'completed'::text, v_already_recorded, v_completed_at;
end;
$function$;

revoke all on function public.submit_counter_referral(uuid, text, text, text, text, text, text) from public;
revoke all on function public.submit_counter_referral(uuid, text, text, text, text, text, text) from anon;
grant execute on function public.submit_counter_referral(uuid, text, text, text, text, text, text) to authenticated;

comment on function public.submit_counter_referral(uuid, text, text, text, text, text, text) is
'Atomically records receiving-facility counter-referral feedback and completes a discharged referral. Enforces authenticated receiving role, assigned facility, allowed outcome, idempotent retry and row-level serialization.';

-- This function's return contract is expanded with lifecycle event counts.
-- It remains a single aggregate row and never returns patient-level fields.
drop function if exists public.get_admin_referral_volume(date, date);

create function public.get_admin_referral_volume(
  p_start_date date,
  p_end_date date
)
returns table (
  period_start date,
  period_end date,
  referral_count bigint,
  small_cell_suppressed boolean,
  acknowledged_count bigint,
  acknowledged_count_suppressed boolean,
  arrival_confirmed_count bigint,
  arrival_count_suppressed boolean,
  assessment_completed_count bigint,
  assessment_count_suppressed boolean,
  referral_completed_count bigint,
  completion_count_suppressed boolean,
  chronology_anomaly_count bigint,
  chronology_anomaly_suppressed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_referral_count bigint;
  v_acknowledged_count bigint;
  v_arrival_count bigint;
  v_assessment_count bigint;
  v_completed_count bigint;
  v_chronology_anomaly_count bigint;
begin
  if auth.uid() is null or not public.is_administrator() then
    raise exception 'Administrator access required.'
      using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null
     or p_start_date > p_end_date
     or p_start_date <> pg_catalog.date_trunc('month', p_start_date)::date
     or p_end_date <> (p_start_date + interval '1 month - 1 day')::date then
    raise exception 'Referral-volume reporting requires one complete calendar month.'
      using errcode = '22023';
  end if;

  -- Use one created_at inception cohort for every event count.
  -- Event timestamps earlier than creation are excluded as invalid chronology.
  select
    count(*),
    count(*) filter (where r.acknowledged_at is not null and r.acknowledged_at >= r.created_at),
    count(*) filter (where r.patient_arrived_at is not null and r.patient_arrived_at >= r.created_at),
    count(*) filter (where r.assessment_completed_at is not null and r.assessment_completed_at >= r.created_at),
    count(*) filter (where r.completed_at is not null and r.completed_at >= r.created_at),
    count(*) filter (where
      (r.acknowledged_at is not null and r.acknowledged_at < r.created_at)
      or (r.patient_arrived_at is not null and r.patient_arrived_at < r.created_at)
      or (r.assessment_completed_at is not null and r.assessment_completed_at < r.created_at)
      or (r.completed_at is not null and r.completed_at < r.created_at)
    )
  into
    v_referral_count,
    v_acknowledged_count,
    v_arrival_count,
    v_assessment_count,
    v_completed_count,
    v_chronology_anomaly_count
  from public.referrals r
  where r.created_at >= (p_start_date::timestamp at time zone 'Africa/Lagos')
    and r.created_at < ((p_end_date + 1)::timestamp at time zone 'Africa/Lagos')
    and coalesce(r.is_test, false) = false;

  period_start := p_start_date;
  period_end := p_end_date;

  -- Suppress each small numerator independently. If the entire cohort is
  -- small, all subset counts are necessarily suppressed as well.
  small_cell_suppressed := v_referral_count between 1 and 4;
  referral_count := case when small_cell_suppressed then null else v_referral_count end;
  acknowledged_count_suppressed := small_cell_suppressed or v_acknowledged_count between 1 and 4;
  acknowledged_count := case when acknowledged_count_suppressed then null else v_acknowledged_count end;
  arrival_count_suppressed := small_cell_suppressed or v_arrival_count between 1 and 4;
  arrival_confirmed_count := case when arrival_count_suppressed then null else v_arrival_count end;
  assessment_count_suppressed := small_cell_suppressed or v_assessment_count between 1 and 4;
  assessment_completed_count := case when assessment_count_suppressed then null else v_assessment_count end;
  completion_count_suppressed := small_cell_suppressed or v_completed_count between 1 and 4;
  referral_completed_count := case when completion_count_suppressed then null else v_completed_count end;
  chronology_anomaly_suppressed := v_chronology_anomaly_count between 1 and 4;
  chronology_anomaly_count := case when chronology_anomaly_suppressed then null else v_chronology_anomaly_count end;

  return next;
end;
$function$;

revoke all on function public.get_admin_referral_volume(date, date) from public;
revoke all on function public.get_admin_referral_volume(date, date) from anon;
grant execute on function public.get_admin_referral_volume(date, date) to authenticated;

comment on function public.get_admin_referral_volume(date, date) is
'Administrator-only aggregate inception-cohort counts for exactly one complete calendar month in Africa/Lagos. Arbitrary and overlapping date windows are rejected to reduce small-cell differencing risk. Event timestamps earlier than creation are excluded. Each count from 1 to 4 is suppressed. A chronology anomaly counts a referral with at least one lifecycle timestamp earlier than creation. Counts are operational event observations, not validated outcome rates or population incidence/prevalence.';


-- Facility distribution is restricted to one complete calendar month.
-- This prevents arbitrary overlapping date windows from becoming a simple
-- differencing interface. Small-cell and complementary suppression are
-- applied independently to sending and receiving facility distributions.
create or replace function public.get_admin_facility_referral_summary(
  p_start_date date,
  p_end_date date
)
returns table (
  referral_direction text,
  facility_label text,
  facility_type text,
  lga text,
  state text,
  referral_count bigint,
  small_cell_suppressed boolean,
  complementary_suppressed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_administrator() then
    raise exception 'Administrator access required.'
      using errcode = '42501';
  end if;

  if p_start_date is null
     or p_end_date is null
     or p_start_date > p_end_date
     or p_start_date <> pg_catalog.date_trunc('month', p_start_date)::date
     or p_end_date <> (p_start_date + interval '1 month - 1 day')::date then
    raise exception 'Facility reporting requires one complete calendar month.'
      using errcode = '22023';
  end if;

  return query
  with facility_counts as (
    select
      'Sending'::text as direction,
      r.referring_facility_id as facility_id,
      count(*)::bigint as total
    from public.referrals r
    where r.created_at >= (p_start_date::timestamp at time zone 'Africa/Lagos')
      and r.created_at < ((p_end_date + 1)::timestamp at time zone 'Africa/Lagos')
      and coalesce(r.is_test, false) = false
    group by r.referring_facility_id

    union all

    select
      'Receiving'::text as direction,
      r.receiving_facility_id as facility_id,
      count(*)::bigint as total
    from public.referrals r
    where r.created_at >= (p_start_date::timestamp at time zone 'Africa/Lagos')
      and r.created_at < ((p_end_date + 1)::timestamp at time zone 'Africa/Lagos')
      and coalesce(r.is_test, false) = false
    group by r.receiving_facility_id
  ),
  labelled as (
    select
      fc.direction,
      fc.facility_id,
      coalesce(f.name, 'Unassigned facility') as facility_name,
      f.facility_type,
      f.lga,
      f.state,
      fc.total
    from facility_counts fc
    left join public.facilities f on f.id = fc.facility_id
  ),
  ranked as (
    select
      labelled.*,
      count(*) filter (where total between 1 and 4)
        over (partition by direction) as small_group_count,
      row_number() over (
        partition by direction
        order by
          case when total between 1 and 4 then 0 else 1 end,
          total asc,
          coalesce(facility_id::text, '')
      ) as suppression_rank
    from labelled
  ),
  protected as (
    select
      ranked.*,
      (total between 1 and 4) as primary_suppression,
      (small_group_count = 1 and total >= 5 and suppression_rank = 2)
        as complementary_suppression
    from ranked
  )
  select
    direction,
    case
      when primary_suppression or complementary_suppression
        then 'Suppressed facility'
      else facility_name
    end,
    case when primary_suppression or complementary_suppression then null else facility_type end,
    case when primary_suppression or complementary_suppression then null else lga end,
    case when primary_suppression or complementary_suppression then null else state end,
    case when primary_suppression or complementary_suppression then null else total end,
    primary_suppression,
    complementary_suppression
  from protected
  order by direction, primary_suppression desc, complementary_suppression desc, facility_name;
end;
$function$;

revoke all on function public.get_admin_facility_referral_summary(date, date) from public;
revoke all on function public.get_admin_facility_referral_summary(date, date) from anon;
grant execute on function public.get_admin_facility_referral_summary(date, date) to authenticated;

comment on function public.get_admin_facility_referral_summary(date, date) is
'Administrator-only sending and receiving facility referral counts for exactly one complete calendar month. Suppresses facility groups with 1–4 referrals and applies complementary suppression when exactly one small group exists per direction. Returns no facility identifiers, patient fields or row-level records.';
