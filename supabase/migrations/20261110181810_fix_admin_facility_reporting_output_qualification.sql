-- Qualify output expressions that share names with RETURNS TABLE output variables.
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
    case when primary_suppression or complementary_suppression then null else protected.facility_type end,
    case when primary_suppression or complementary_suppression then null else protected.lga end,
    case when primary_suppression or complementary_suppression then null else protected.state end,
    case when primary_suppression or complementary_suppression then null else protected.total end,
    primary_suppression,
    complementary_suppression
  from protected
  order by direction, primary_suppression desc, complementary_suppression desc, facility_name;
end;
$function$;


revoke all on function public.get_admin_facility_referral_summary(date, date) from public;
revoke all on function public.get_admin_facility_referral_summary(date, date) from anon;
grant execute on function public.get_admin_facility_referral_summary(date, date) to authenticated;
