-- REFLINK Phase 1: private durable notification outbox foundation.
-- Source-only proposal. Do not apply until migration history, roles and staging tests are verified.
-- This migration does not dispatch messages or configure a provider.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null check (event_type in (
    'referral_acknowledgement_due',
    'referral_acknowledged',
    'referral_arrival_confirmed',
    'referral_assessment_completed',
    'counter_referral_completed'
  )),
  channel text not null check (channel in ('in_app', 'sms')),
  recipient_user_id uuid not null,
  referral_id uuid not null,
  template_key text not null check (template_key ~ '^[a-z0-9_]+\\.v[0-9]+$'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry_wait', 'sent', 'dead_letter', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_until timestamptz,
  claim_token uuid,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  expires_at timestamptz,
  constraint notification_outbox_claim_state_check check (
    (status = 'processing' and claim_token is not null and claimed_until is not null)
    or
    (status <> 'processing' and claim_token is null and claimed_until is null)
  ),
  constraint notification_outbox_sent_state_check check (
    (status = 'sent' and sent_at is not null)
    or
    (status <> 'sent' and sent_at is null)
  ),
  constraint notification_outbox_expiry_check check (
    expires_at is null or expires_at > created_at
  )
);

create index if not exists notification_outbox_ready_idx
  on private.notification_outbox (next_attempt_at, created_at)
  where status in ('pending', 'retry_wait');

create index if not exists notification_outbox_lease_idx
  on private.notification_outbox (claimed_until)
  where status = 'processing';

create index if not exists notification_outbox_recipient_idx
  on private.notification_outbox (recipient_user_id, created_at desc);

create table if not exists private.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references private.notification_outbox(id) on delete restrict,
  attempt_number integer not null check (attempt_number between 1 and 8),
  claim_token uuid not null unique,
  claimed_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text check (outcome in ('sent', 'retry_wait', 'dead_letter', 'cancelled')),
  provider_message_id text,
  error_code text,
  unique (outbox_id, attempt_number),
  constraint notification_attempts_completion_check check (
    (finished_at is null and outcome is null)
    or
    (finished_at is not null and outcome is not null)
  )
);

create index if not exists notification_attempts_outbox_idx
  on private.notification_attempts (outbox_id, attempt_number);

alter table private.notification_outbox enable row level security;
alter table private.notification_attempts enable row level security;

revoke all on private.notification_outbox from public, anon, authenticated;
revoke all on private.notification_attempts from public, anon, authenticated;
grant select, insert, update on private.notification_outbox to service_role;
grant select, insert, update on private.notification_attempts to service_role;

-- Enqueue metadata only. No phone number, message body, clinical text or arbitrary payload
-- is accepted. The caller must be a trusted server-side producer.
create or replace function private.enqueue_notification(
  p_event_key text,
  p_event_type text,
  p_channel text,
  p_recipient_user_id uuid,
  p_referral_id uuid,
  p_template_key text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_id uuid;
  v_existing private.notification_outbox%rowtype;
begin
  if nullif(pg_catalog.btrim(p_event_key), '') is null
     or pg_catalog.char_length(p_event_key) > 200
     or p_event_type is null
     or p_event_type not in (
       'referral_acknowledgement_due',
       'referral_acknowledged',
       'referral_arrival_confirmed',
       'referral_assessment_completed',
       'counter_referral_completed'
     )
     or p_channel is null
     or p_channel not in ('in_app', 'sms')
     or p_recipient_user_id is null
     or p_referral_id is null
     or p_template_key is null
     or p_template_key !~ '^[a-z0-9_]+\\.v[0-9]+$'
     or (p_expires_at is not null and p_expires_at <= pg_catalog.now()) then
    raise exception 'Notification event metadata is invalid.' using errcode = '22023';
  end if;

  insert into private.notification_outbox (
    event_key, event_type, channel, recipient_user_id,
    referral_id, template_key, expires_at
  ) values (
    p_event_key, p_event_type, p_channel, p_recipient_user_id,
    p_referral_id, p_template_key, p_expires_at
  )
  on conflict (event_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select * into v_existing
    from private.notification_outbox o
   where o.event_key = p_event_key;

  if not found
     or v_existing.event_type is distinct from p_event_type
     or v_existing.channel is distinct from p_channel
     or v_existing.recipient_user_id is distinct from p_recipient_user_id
     or v_existing.referral_id is distinct from p_referral_id
     or v_existing.template_key is distinct from p_template_key then
    raise exception 'Notification idempotency key conflicts with different event metadata.'
      using errcode = '23505';
  end if;

  return v_existing.id;
end;
$function$;

-- Claim work in a short transaction. Network calls must happen after this function returns.
-- SKIP LOCKED allows multiple workers without double-claiming a live row.
create or replace function private.claim_notification_batch(p_batch_size integer default 10)
returns table (
  outbox_id uuid,
  event_key text,
  event_type text,
  channel text,
  recipient_user_id uuid,
  referral_id uuid,
  template_key text,
  attempt_number integer,
  claim_token uuid,
  expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 50 then
    raise exception 'Batch size must be between 1 and 50.' using errcode = '22023';
  end if;

  -- Close the active attempt ledger row before changing or reclaiming its lease.
  update private.notification_attempts a
     set finished_at = pg_catalog.now(),
         outcome = 'cancelled',
         error_code = 'EXPIRED'
    from private.notification_outbox o
   where o.id = a.outbox_id
     and o.claim_token = a.claim_token
     and o.status = 'processing'
     and o.expires_at is not null
     and o.expires_at <= pg_catalog.now()
     and a.finished_at is null;

  update private.notification_attempts a
     set finished_at = pg_catalog.now(),
         outcome = 'dead_letter',
         error_code = 'ATTEMPTS_EXHAUSTED'
    from private.notification_outbox o
   where o.id = a.outbox_id
     and o.claim_token = a.claim_token
     and o.status = 'processing'
     and o.attempt_count >= 8
     and o.claimed_until <= pg_catalog.now()
     and a.finished_at is null;

  update private.notification_attempts a
     set finished_at = pg_catalog.now(),
         outcome = 'retry_wait',
         error_code = 'LEASE_EXPIRED'
    from private.notification_outbox o
   where o.id = a.outbox_id
     and o.claim_token = a.claim_token
     and o.status = 'processing'
     and o.attempt_count < 8
     and o.claimed_until <= pg_catalog.now()
     and (o.expires_at is null or o.expires_at > pg_catalog.now())
     and a.finished_at is null;

  -- Expired items and exhausted leases are terminally closed, not silently stranded.
  update private.notification_outbox o
     set status = 'cancelled',
         claim_token = null,
         claimed_at = null,
         claimed_until = null,
         last_error_code = 'EXPIRED'
   where o.expires_at is not null
     and o.expires_at <= pg_catalog.now()
     and o.status in ('pending', 'retry_wait', 'processing');

  update private.notification_outbox o
     set status = 'dead_letter',
         claim_token = null,
         claimed_at = null,
         claimed_until = null,
         last_error_code = 'ATTEMPTS_EXHAUSTED'
   where o.attempt_count >= 8
     and (
       o.status in ('pending', 'retry_wait')
       or (o.status = 'processing' and o.claimed_until <= pg_catalog.now())
     );

  return query
  with candidates as (
    select o.id
      from private.notification_outbox o
     where o.attempt_count < 8
       and (
         (o.status in ('pending', 'retry_wait') and o.next_attempt_at <= pg_catalog.now())
         or (o.status = 'processing' and o.claimed_until <= pg_catalog.now())
       )
     order by o.next_attempt_at, o.created_at
     for update skip locked
     limit p_batch_size
  ),
  claimed as (
    update private.notification_outbox o
       set status = 'processing',
           attempt_count = o.attempt_count + 1,
           claimed_at = pg_catalog.now(),
           claimed_until = pg_catalog.now() + interval '5 minutes',
           claim_token = gen_random_uuid()
      from candidates c
     where o.id = c.id
    returning o.id, o.event_key, o.event_type, o.channel,
              o.recipient_user_id, o.referral_id, o.template_key,
              o.attempt_count, o.claim_token, o.expires_at
  ),
  attempts as (
    insert into private.notification_attempts (
      outbox_id, attempt_number, claim_token, claimed_at
    )
    select c.id, c.attempt_count, c.claim_token, pg_catalog.now()
      from claimed c
    returning outbox_id
  )
  select c.id, c.event_key, c.event_type, c.channel,
         c.recipient_user_id, c.referral_id, c.template_key,
         c.attempt_count, c.claim_token, c.expires_at
    from claimed c;
end;
$function$;

-- A worker can settle only the exact lease it claimed. Raw provider responses are never stored.
create or replace function private.finish_notification_attempt(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_error_code text default null,
  p_retry_after_seconds integer default 60
)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_attempt_number integer;
  v_status text;
  v_finished_at timestamptz := pg_catalog.now();
begin
  if p_outbox_id is null
     or p_claim_token is null
     or p_outcome is null
     or p_outcome not in ('sent', 'retryable_failure', 'permanent_failure')
     or (p_provider_message_id is not null and pg_catalog.char_length(p_provider_message_id) > 200)
     or (p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,64}$')
     or p_retry_after_seconds is null
     or p_retry_after_seconds < 1
     or p_retry_after_seconds > 3600 then
    raise exception 'Notification attempt result is invalid.' using errcode = '22023';
  end if;

  select o.attempt_count into v_attempt_number
    from private.notification_outbox o
   where o.id = p_outbox_id
     and o.status = 'processing'
     and o.claim_token = p_claim_token
     and o.claimed_until > v_finished_at
   for update;

  if not found then
    raise exception 'Notification claim is no longer valid.' using errcode = '55000';
  end if;

  if p_outcome = 'sent' then
    v_status := 'sent';
    update private.notification_outbox
       set status = 'sent',
           sent_at = v_finished_at,
           provider_message_id = p_provider_message_id,
           last_error_code = null,
           claim_token = null,
           claimed_at = null,
           claimed_until = null
     where id = p_outbox_id;
  elsif p_outcome = 'permanent_failure' or v_attempt_number >= 8 then
    v_status := 'dead_letter';
    update private.notification_outbox
       set status = 'dead_letter',
           last_error_code = coalesce(p_error_code, 'PERMANENT_FAILURE'),
           claim_token = null,
           claimed_at = null,
           claimed_until = null
     where id = p_outbox_id;
  else
    v_status := 'retry_wait';
    update private.notification_outbox
       set status = 'retry_wait',
           next_attempt_at = v_finished_at + pg_catalog.make_interval(secs => p_retry_after_seconds),
           last_error_code = coalesce(p_error_code, 'TRANSIENT_FAILURE'),
           claim_token = null,
           claimed_at = null,
           claimed_until = null
     where id = p_outbox_id;
  end if;

  update private.notification_attempts
     set finished_at = v_finished_at,
         outcome = v_status,
         provider_message_id = case when v_status = 'sent' then p_provider_message_id else null end,
         error_code = case when v_status = 'sent' then null else coalesce(p_error_code, v_status::text) end
   where outbox_id = p_outbox_id
     and claim_token = p_claim_token
     and finished_at is null;

  return v_status;
end;
$function$;

revoke all on function private.enqueue_notification(text, text, text, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.claim_notification_batch(integer) from public, anon, authenticated;
revoke all on function private.finish_notification_attempt(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function private.enqueue_notification(text, text, text, uuid, uuid, text, timestamptz) to service_role;
grant execute on function private.claim_notification_batch(integer) to service_role;
grant execute on function private.finish_notification_attempt(uuid, uuid, text, text, text, integer) to service_role;

-- PostgREST-facing wrappers. The private schema stays unexposed; only service_role
-- can execute these SECURITY INVOKER functions through the exposed public schema.
create or replace function public.enqueue_notification(
  p_event_key text,
  p_event_type text,
  p_channel text,
  p_recipient_user_id uuid,
  p_referral_id uuid,
  p_template_key text,
  p_expires_at timestamptz default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.enqueue_notification(
    p_event_key, p_event_type, p_channel, p_recipient_user_id,
    p_referral_id, p_template_key, p_expires_at
  );
$function$;

create or replace function public.claim_notification_batch(p_batch_size integer default 10)
returns table (
  outbox_id uuid,
  event_key text,
  event_type text,
  channel text,
  recipient_user_id uuid,
  referral_id uuid,
  template_key text,
  attempt_number integer,
  claim_token uuid,
  expires_at timestamptz
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.claim_notification_batch(p_batch_size);
$function$;

create or replace function public.finish_notification_attempt(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_error_code text default null,
  p_retry_after_seconds integer default 60
)
returns text
language sql
security invoker
set search_path = ''
as $function$
  select private.finish_notification_attempt(
    p_outbox_id, p_claim_token, p_outcome,
    p_provider_message_id, p_error_code, p_retry_after_seconds
  );
$function$;

revoke all on function public.enqueue_notification(text, text, text, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_notification_batch(integer) from public, anon, authenticated;
revoke all on function public.finish_notification_attempt(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.enqueue_notification(text, text, text, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.claim_notification_batch(integer) to service_role;
grant execute on function public.finish_notification_attempt(uuid, uuid, text, text, text, integer) to service_role;

comment on schema private is
'Non-exposed internal schema for server-operated REFLINK workflows. Do not add to PostgREST exposed schemas.';
comment on table private.notification_outbox is
'Service-only notification metadata queue. Contains internal user/referral references but no phone numbers, message body, clinical narrative or arbitrary payload. No browser-role access.';
comment on table private.notification_attempts is
'Per-attempt operational audit metadata. No provider response body, phone number, token or clinical content is stored.';
comment on function private.enqueue_notification(text, text, text, uuid, uuid, text, timestamptz) is
'Service-role-only idempotent enqueue operation. Accepts allowlisted event metadata only; does not send a notification.';
comment on function private.claim_notification_batch(integer) is
'Service-role-only bounded queue claim with SKIP LOCKED and five-minute leases. Returns only the metadata required by a trusted worker; provider calls occur outside the database transaction.';
comment on function private.finish_notification_attempt(uuid, uuid, text, text, text, integer) is
'Service-role-only lease-checked attempt settlement with bounded retry delay and dead-letter handling. Never stores raw provider errors.';
