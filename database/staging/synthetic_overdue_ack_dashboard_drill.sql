-- Synthetic staging only. Apply through the staging migration ledger.
create or replace function private.queue_synthetic_overdue_referrals()
returns bigint language sql security invoker set search_path = '' as $$
  with due as (
    select r.id from public.referrals r
    where r.is_test is true and r.status = 'sent' and r.acknowledged_at is null
      and r.ack_due_at <= now()
      and not exists (select 1 from public.referral_notifications n
        where n.idempotency_key = r.id::text || ':sla_escalation:dashboard')
    order by r.ack_due_at, r.id limit 100 for update of r skip locked
  ), queued as (
    insert into public.referral_notifications
      (referral_id,notification_type,channel,status,idempotency_key,attempt_count,next_attempt_at)
    select id,'sla_escalation','dashboard','queued',id::text || ':sla_escalation:dashboard',0,now()
    from due on conflict (idempotency_key) do nothing returning referral_id
  ), logged as (
    insert into public.referral_events(referral_id,event_type,event_description)
    select referral_id,'sla_escalation','Acknowledgement overdue. Dashboard notification queued.'
    from queued returning id
  ) select count(*) from logged
$$;
revoke all on function private.queue_synthetic_overdue_referrals() from public,anon,authenticated;
create extension if not exists pg_cron;
select cron.schedule('reflink-synthetic-overdue-ack','* * * * *','select private.queue_synthetic_overdue_referrals()');
