-- REFLINK: restrict direct notification-log access to non-sensitive columns.
-- Apply only after migration-baseline reconciliation and synthetic staging validation.
-- The SMS endpoint uses service_role; this migration preserves its access.
-- Authenticated participants retain RLS-scoped access only to delivery status metadata.
begin;

revoke all privileges on table public.referral_notifications
  from anon, authenticated;

grant select (
  id,
  referral_id,
  notification_type,
  channel,
  status,
  created_at,
  sent_at
)
on table public.referral_notifications
to authenticated;

comment on table public.referral_notifications is
'Notification delivery log. Authenticated users may select only RLS-scoped non-sensitive status metadata; recipient phone numbers, provider identifiers and raw provider errors are service-role-only.';

commit;
