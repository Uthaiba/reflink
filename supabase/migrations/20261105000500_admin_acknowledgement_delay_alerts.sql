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
