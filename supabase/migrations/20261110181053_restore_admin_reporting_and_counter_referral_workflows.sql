-- REFLINK staging reconciliation: restore reviewed administrator aggregate reporting and transactional counter-referral completion.
-- Ported from the existing Phase 1 branch after confirming the staging schema contains the required fields and tables.
-- Administrator RPCs return aggregates only, enforce administrator authorization, require complete Lagos calendar months,
-- and apply primary/complementary small-cell suppression. No patient-level administrator SELECT access is added.

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


-- REFLINK LGA aggregate reporting.
-- Complete calendar month only; no patient or facility identifiers returned.
-- Referral activity is not population need, incidence or care quality.
create or replace function public.get_admin_lga_referral_summary(
  p_start_date date, p_end_date date
)
returns table (
  referral_direction text, lga_label text, state text, referral_count bigint,
  small_cell_suppressed boolean, complementary_suppressed boolean
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
    raise exception 'LGA reporting requires one complete calendar month.' using errcode = '22023';
  end if;
  return query
  with cohort as (
    select r.referring_facility_id, r.receiving_facility_id
    from public.referrals r
    where r.created_at >= (p_start_date::timestamp at time zone 'Africa/Lagos')
      and r.created_at < ((p_end_date + 1)::timestamp at time zone 'Africa/Lagos')
      and coalesce(r.is_test, false) = false
  ),
  grouped as (
    select 'Sending'::text direction,
      coalesce(nullif(pg_catalog.btrim(f.lga), ''), 'Unassigned geography') lga_name,
      nullif(pg_catalog.btrim(f.state), '') state_name, count(*)::bigint total
    from cohort c left join public.facilities f on f.id = c.referring_facility_id
    group by coalesce(nullif(pg_catalog.btrim(f.lga), ''), 'Unassigned geography'),
      nullif(pg_catalog.btrim(f.state), '')
    union all
    select 'Receiving'::text direction,
      coalesce(nullif(pg_catalog.btrim(f.lga), ''), 'Unassigned geography') lga_name,
      nullif(pg_catalog.btrim(f.state), '') state_name, count(*)::bigint total
    from cohort c left join public.facilities f on f.id = c.receiving_facility_id
    group by coalesce(nullif(pg_catalog.btrim(f.lga), ''), 'Unassigned geography'),
      nullif(pg_catalog.btrim(f.state), '')
  ),
  ranked as (
    select grouped.*,
      count(*) filter (where total between 1 and 4) over (partition by direction) small_group_count,
      row_number() over (partition by direction order by
        case when total between 1 and 4 then 0 else 1 end, total, lga_name,
        coalesce(state_name, '')) suppression_rank
    from grouped
  ),
  protected as (
    select ranked.*, (total between 1 and 4) primary_suppression,
      (small_group_count = 1 and total >= 5 and suppression_rank = 2) complementary_suppression
    from ranked
  )
  select direction,
    case when primary_suppression or complementary_suppression
      then 'Suppressed geography' else lga_name end,
    case when primary_suppression or complementary_suppression
      or lga_name = 'Unassigned geography' then null else state_name end,
    case when primary_suppression or complementary_suppression then null else total end,
    primary_suppression, complementary_suppression
  from protected
  order by direction, primary_suppression desc, complementary_suppression desc, lga_name, state_name;
end;
$function$;

revoke all on function public.get_admin_lga_referral_summary(date, date) from public;
revoke all on function public.get_admin_lga_referral_summary(date, date) from anon;
grant execute on function public.get_admin_lga_referral_summary(date, date) to authenticated;
comment on function public.get_admin_lga_referral_summary(date, date) is
'Administrator-only sending and receiving LGA referral activity for one complete calendar month. Suppresses groups with 1–4 referrals and applies complementary suppression when exactly one small group exists per direction. Returns no facility identifiers, patient fields or row-level records. Referral activity is not population incidence, unmet need or quality of care.';


-- REFLINK: aggregate facility registry and observed referral participation.
-- Uses current registry status plus a complete monthly referral creation cohort.
-- No facility identifiers, patient data or user-level metrics are returned.
create or replace function public.get_admin_facility_reporting_coverage(
  p_start_date date, p_end_date date
)
returns table (
  coverage_group text,
  facility_count bigint,
  small_cell_suppressed boolean,
  complementary_suppressed boolean
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
    raise exception 'Facility coverage reporting requires one complete calendar month.'
      using errcode = '22023';
  end if;

  return query
  with cohort as (
    select r.referring_facility_id, r.receiving_facility_id
    from public.referrals r
    where r.created_at >= (p_start_date::timestamp at time zone 'Africa/Lagos')
      and r.created_at < ((p_end_date + 1)::timestamp at time zone 'Africa/Lagos')
      and coalesce(r.is_test, false) = false
  ),
  facility_activity as (
    select f.id, f.is_active,
      (nullif(pg_catalog.btrim(f.lga), '') is not null
        and nullif(pg_catalog.btrim(f.state), '') is not null) as geography_complete,
      exists (
        select 1 from cohort c
        where c.referring_facility_id = f.id or c.receiving_facility_id = f.id
      ) as has_recorded_activity
    from public.facilities f
  ),
  classified as (
    select case
      when is_active is true and has_recorded_activity and geography_complete
        then 'Active · referral activity recorded · geography complete'
      when is_active is true and has_recorded_activity and not geography_complete
        then 'Active · referral activity recorded · geography incomplete'
      when is_active is true and not has_recorded_activity and geography_complete
        then 'Active · no recorded referral activity · geography complete'
      when is_active is true and not has_recorded_activity and not geography_complete
        then 'Active · no recorded referral activity · geography incomplete'
      when is_active is false and geography_complete
        then 'Inactive · geography complete'
      when is_active is false and not geography_complete
        then 'Inactive · geography incomplete'
      when is_active is null and geography_complete
        then 'Status not recorded · geography complete'
      else 'Status not recorded · geography incomplete'
    end as group_label
    from facility_activity
  ),
  grouped as (
    select group_label, count(*)::bigint total
    from classified
    group by group_label
  ),
  ranked as (
    select grouped.*,
      count(*) filter (where total between 1 and 4) over () small_group_count,
      row_number() over (order by
        case when total between 1 and 4 then 0 else 1 end,
        total, group_label) suppression_rank
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
      then 'Suppressed facility group' else group_label end,
    case when primary_suppression or complementary_suppression then null else total end,
    primary_suppression,
    complementary_suppression
  from protected
  order by primary_suppression desc, complementary_suppression desc, group_label;
end;
$function$;

revoke all on function public.get_admin_facility_reporting_coverage(date, date) from public;
revoke all on function public.get_admin_facility_reporting_coverage(date, date) from anon;
grant execute on function public.get_admin_facility_reporting_coverage(date, date) to authenticated;
comment on function public.get_admin_facility_reporting_coverage(date, date) is
'Administrator-only aggregate classification of the current facility registry by active status, geography completeness and whether the facility appears as a sending or receiving endpoint in the selected complete calendar month. No facility identifiers or patient/user data returned. Absence of recorded referral activity is not evidence of non-reporting or poor performance.';


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


-- REFLINK: administrator-only aggregate acknowledgement delay snapshot.
-- Uses the due timestamp already assigned by the clinical workflow.
-- No patient, facility, referral or user identifiers are returned.
create or replace function public.get_admin_acknowledgement_delay_alerts()
returns table (
  alert_label text,
  alert_count bigint,
  small_cell_suppressed boolean,
  complementary_suppressed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_administrator() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  with eligible as (
    select
      case
        when lower(coalesce(r.urgency, 'routine')) = 'emergency' then 'Emergency'
        when lower(coalesce(r.urgency, 'routine')) = 'urgent' then 'Urgent'
        else 'Routine'
      end as urgency_label,
      r.status,
      r.ack_due_at,
      r.acknowledged_at,
      r.created_at
    from public.referrals r
    where coalesce(r.is_test, false) = false
      and r.ack_due_at is not null
      and r.created_at is not null
      and r.ack_due_at >= r.created_at
  ),
  buckets as (
    select
      'Awaiting acknowledgement · ' || urgency_label as label,
      count(*)::bigint as total
    from eligible
    where status = 'sent'
      and ack_due_at < pg_catalog.now()
    group by urgency_label

    union all

    select
      'Acknowledged after target · ' || urgency_label as label,
      count(*)::bigint as total
    from eligible
    where acknowledged_at is not null
      and acknowledged_at >= created_at
      and acknowledged_at > ack_due_at
    group by urgency_label
  ),
  ranked as (
    select buckets.*,
      count(*) filter (where total between 1 and 4) over () as small_group_count,
      row_number() over (
        order by case when total between 1 and 4 then 0 else 1 end,
          total asc, label
      ) as suppression_rank
    from buckets
  ),
  protected as (
    select ranked.*,
      (total between 1 and 4) as primary_suppression,
      (small_group_count = 1 and total >= 5 and suppression_rank = 2)
        as complementary_suppression
    from ranked
  )
  select
    case when primary_suppression or complementary_suppression
      then 'Suppressed alert category' else label end,
    case when primary_suppression or complementary_suppression
      then null else total end,
    primary_suppression,
    complementary_suppression
  from protected
  order by primary_suppression desc, complementary_suppression desc, label;
end;
$function$;

revoke all on function public.get_admin_acknowledgement_delay_alerts() from public;
revoke all on function public.get_admin_acknowledgement_delay_alerts() from anon;
grant execute on function public.get_admin_acknowledgement_delay_alerts() to authenticated;
comment on function public.get_admin_acknowledgement_delay_alerts() is
'Administrator-only aggregate snapshot of referrals awaiting acknowledgement after their stored acknowledgement due time and referrals acknowledged after that due time. Uses existing urgency-derived ack_due_at; excludes test records and invalid due/creation chronology. Suppresses groups of 1–4 and applies complementary suppression. Returns no patient, referral, facility or user identifiers. Does not send alerts or replace clinical escalation.';
