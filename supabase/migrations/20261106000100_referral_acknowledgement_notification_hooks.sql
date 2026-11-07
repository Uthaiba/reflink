-- REFLINK: cancel stale acknowledgement reminders when referral state changes.
-- Depends on 20261105000600_notification_outbox_foundation.sql.
--
-- IMPORTANT: this migration intentionally does not enqueue user-addressed
-- notifications. The live profile contract does not identify an authoritative
-- notification-duty/on-call recipient. Do not infer recipients from role and
-- facility membership. Referral workflows remain independent of notifications.

create or replace function private.cancel_referral_acknowledgement_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Close the matching in-flight attempt before releasing its outbox lease.
  update private.notification_attempts a
     set finished_at = pg_catalog.now(),
         outcome = 'cancelled',
         error_code = 'REFERRAL_STATE_CHANGED'
    from private.notification_outbox o
   where o.id = a.outbox_id
     and o.claim_token = a.claim_token
     and o.referral_id = new.id
     and o.event_type = 'referral_acknowledgement_due'
     and o.status = 'processing'
     and a.finished_at is null;

  -- A status, deadline, acknowledgement or destination change invalidates
  -- outstanding work for the previous referral state.
  update private.notification_outbox o
     set status = 'cancelled',
         claim_token = null,
         claimed_at = null,
         claimed_until = null,
         last_error_code = 'REFERRAL_STATE_CHANGED'
   where o.referral_id = new.id
     and o.event_type = 'referral_acknowledgement_due'
     and o.status in ('pending', 'retry_wait', 'processing');

  return new;
end;
$function$;

drop trigger if exists trg_referral_ack_due_after_insert on public.referrals;
drop trigger if exists trg_referral_ack_due_after_update on public.referrals;
create trigger trg_referral_ack_due_after_update
after update of status, ack_due_at, acknowledged_at, receiving_facility_id
on public.referrals
for each row
execute function private.cancel_referral_acknowledgement_reminders();

drop trigger if exists trg_profile_ack_due_after_insert on public.profiles;
drop trigger if exists trg_profile_ack_due_after_update on public.profiles;

revoke all on function private.cancel_referral_acknowledgement_reminders()
  from public, anon, authenticated;

comment on function private.cancel_referral_acknowledgement_reminders() is
'Internal trigger. Cancels stale acknowledgement reminder work and closes its in-flight attempt when referral lifecycle, deadline, acknowledgement or destination changes. Intentionally does not enqueue user notifications until an authoritative notification-duty assignment source and recipient policy are approved.';

comment on trigger trg_referral_ack_due_after_update on public.referrals is
'Cancels stale acknowledgement reminder work when referral status, acknowledgement deadline, acknowledgement timestamp or destination changes. Does not select or notify recipients.';
