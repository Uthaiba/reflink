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

create or replace function public.get_admin_referral_volume(
  p_start_date date,
  p_end_date date
)
returns table (
  period_start date,
  period_end date,
  referral_count bigint,
  small_cell_suppressed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count bigint;
begin
  if auth.uid() is null or not public.is_administrator() then
    raise exception 'Administrator access required.'
      using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null
     or p_start_date > p_end_date then
    raise exception 'A valid start date and end date are required.'
      using errcode = '22023';
  end if;

  if p_end_date - p_start_date > 365 then
    raise exception 'Reporting period cannot exceed 366 calendar days.'
      using errcode = '22023';
  end if;

  select count(*)
    into v_count
    from public.referrals r
   where r.created_at >= (p_start_date::timestamp at time zone 'Africa/Lagos')
     and r.created_at < ((p_end_date + 1)::timestamp at time zone 'Africa/Lagos')
     and coalesce(r.is_test, false) = false;

  period_start := p_start_date;
  period_end := p_end_date;
  small_cell_suppressed := v_count between 1 and 4;
  referral_count := case
    when small_cell_suppressed then null
    else v_count
  end;

  return next;
end;
$function$;

revoke all on function public.get_admin_referral_volume(date, date) from public;
revoke all on function public.get_admin_referral_volume(date, date) from anon;
grant execute on function public.get_admin_referral_volume(date, date) to authenticated;

comment on function public.get_admin_referral_volume(date, date) is
'Administrator-only aggregate referral volume by selected date range (Africa/Lagos). Returns no patient-level fields and suppresses counts from 1 to 4. This is not an incidence or prevalence estimate.';
