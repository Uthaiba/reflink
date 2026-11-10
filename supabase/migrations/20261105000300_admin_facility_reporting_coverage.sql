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
