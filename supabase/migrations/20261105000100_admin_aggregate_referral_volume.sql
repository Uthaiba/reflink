-- REFLINK Phase 1: privacy-preserving administrator aggregate reporting
-- Review and apply only after the repository migration baseline has been reconciled.
-- This migration intentionally does NOT grant administrators row-level access to referrals.

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
   where r.created_at >= p_start_date::timestamptz
     and r.created_at < (p_end_date + 1)::timestamptz
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
'Administrator-only aggregate referral volume. Returns no patient-level fields and suppresses counts from 1 to 4. This is not an incidence or prevalence estimate.';
