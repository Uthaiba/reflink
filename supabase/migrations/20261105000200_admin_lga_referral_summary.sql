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
