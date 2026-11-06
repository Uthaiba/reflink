-- REFLINK: transactionally enqueue acknowledgement-deadline notifications.
-- Depends on 20261105000600_notification_outbox_foundation.sql.
-- In-app queue only. No SMS, provider dispatch, clinical escalation or live sending.

create or replace function private.sync_referral_acknowledgement_due()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Any material lifecycle change invalidates outstanding reminder work.
  if tg_op = 'UPDATE' then
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

    update private.notification_outbox o
       set status = 'cancelled',
           claim_token = null,
           claimed_at = null,
           claimed_until = null,
           last_error_code = 'REFERRAL_STATE_CHANGED'
     where o.referral_id = new.id
       and o.event_type = 'referral_acknowledgement_due'
       and o.status in ('pending', 'retry_wait', 'processing');
  end if;

  -- Queue only a referral that is still awaiting acknowledgement.
  if new.status is distinct from 'sent'
     or new.ack_due_at is null
     or new.acknowledged_at is not null
     or new.receiving_facility_id is null then
    return new;
  end if;

  insert into private.notification_outbox (
    event_key,
    event_type,
    channel,
    recipient_user_id,
    referral_id,
    template_key,
    status,
    next_attempt_at
  )
  select
    'referral_ack_due:' || new.id::text || ':' || new.receiving_facility_id::text || ':' || p.id::text || ':' ||
      pg_catalog.to_char(new.ack_due_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
    'referral_acknowledgement_due',
    'in_app',
    p.id,
    new.id,
    'referral_ack_due.v1',
    'pending',
    new.ack_due_at
  from public.profiles p
  where p.role = 'receiving_staff'
    and p.facility_id = new.receiving_facility_id
  on conflict (event_key) do update
    set status = 'pending',
        next_attempt_at = excluded.next_attempt_at,
        claim_token = null,
        claimed_at = null,
        claimed_until = null,
        last_error_code = null
    where private.notification_outbox.status = 'cancelled'
      and private.notification_outbox.attempt_count < 8;

  return new;
end;
$function$;

-- Separate triggers keep event syntax portable and make lifecycle scope explicit.
drop trigger if exists trg_referral_ack_due_after_insert on public.referrals;
create trigger trg_referral_ack_due_after_insert
after insert on public.referrals
for each row
execute function private.sync_referral_acknowledgement_due();

drop trigger if exists trg_referral_ack_due_after_update on public.referrals;
create trigger trg_referral_ack_due_after_update
after update of status, ack_due_at, acknowledged_at, receiving_facility_id
on public.referrals
for each row
execute function private.sync_referral_acknowledgement_due();

create or replace function private.sync_profile_acknowledgement_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Stop pending reminders when a receiving-staff assignment is removed or changed.
  if tg_op = 'UPDATE'
     and (
       old.role is distinct from new.role
       or old.facility_id is distinct from new.facility_id
     ) then
    update private.notification_attempts a
       set finished_at = pg_catalog.now(),
           outcome = 'cancelled',
           error_code = 'RECIPIENT_ASSIGNMENT_CHANGED'
      from private.notification_outbox o
     where o.id = a.outbox_id
       and o.claim_token = a.claim_token
       and o.recipient_user_id = old.id
       and o.event_type = 'referral_acknowledgement_due'
       and o.status = 'processing'
       and a.finished_at is null;

    update private.notification_outbox o
       set status = 'cancelled',
           claim_token = null,
           claimed_at = null,
           claimed_until = null,
           last_error_code = 'RECIPIENT_ASSIGNMENT_CHANGED'
     where o.recipient_user_id = old.id
       and o.event_type = 'referral_acknowledgement_due'
       and o.status in ('pending', 'retry_wait', 'processing');
  end if;

  -- If a receiving staff profile is created or assigned to a facility,
  -- enqueue reminders for referrals currently awaiting acknowledgement.
  if new.role = 'receiving_staff' and new.facility_id is not null then
    insert into private.notification_outbox (
      event_key,
      event_type,
      channel,
      recipient_user_id,
      referral_id,
      template_key,
      status,
      next_attempt_at
    )
    select
      'referral_ack_due:' || r.id::text || ':' || r.receiving_facility_id::text || ':' || new.id::text || ':' ||
        pg_catalog.to_char(r.ack_due_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
      'referral_acknowledgement_due',
      'in_app',
      new.id,
      r.id,
      'referral_ack_due.v1',
      'pending',
      r.ack_due_at
    from public.referrals r
    where r.receiving_facility_id = new.facility_id
      and r.status = 'sent'
      and r.ack_due_at is not null
      and r.acknowledged_at is null
    on conflict (event_key) do update
      set status = 'pending',
          next_attempt_at = excluded.next_attempt_at,
          claim_token = null,
          claimed_at = null,
          claimed_until = null,
          last_error_code = null
      where private.notification_outbox.status = 'cancelled'
        and private.notification_outbox.attempt_count < 8;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_profile_ack_due_after_insert on public.profiles;
create trigger trg_profile_ack_due_after_insert
after insert on public.profiles
for each row
execute function private.sync_profile_acknowledgement_recipients();

drop trigger if exists trg_profile_ack_due_after_update on public.profiles;
create trigger trg_profile_ack_due_after_update
after update of role, facility_id on public.profiles
for each row
execute function private.sync_profile_acknowledgement_recipients();

revoke all on function private.sync_referral_acknowledgement_due() from public, anon, authenticated;
revoke all on function private.sync_profile_acknowledgement_recipients() from public, anon, authenticated;

comment on function private.sync_referral_acknowledgement_due() is
'Internal trigger. Atomically schedules an in-app acknowledgement-deadline reminder for receiving_staff profiles assigned to the referral destination. Cancels unsent reminders when referral lifecycle or assignment changes. Does not send messages.';
comment on function private.sync_profile_acknowledgement_recipients() is
'Internal trigger. Schedules due-time in-app reminders for current outstanding referrals when receiving staff are assigned; cancels pending reminders when their role/facility assignment changes. Does not send messages.';
comment on trigger trg_referral_ack_due_after_insert on public.referrals is
'Enqueues in-app acknowledgement reminder at stored ack_due_at for eligible receiving-facility staff.';
comment on trigger trg_referral_ack_due_after_update on public.referrals is
'Reconciles queued acknowledgement reminders when status, acknowledgement, deadline or destination changes.';
comment on trigger trg_profile_ack_due_after_insert on public.profiles is
'Backfills due-time reminders for outstanding referrals when a receiving staff profile is created.';
comment on trigger trg_profile_ack_due_after_update on public.profiles is
'Reconciles pending acknowledgement reminders when receiving staff role or facility assignment changes.';
