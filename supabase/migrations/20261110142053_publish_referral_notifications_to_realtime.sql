-- Publish dashboard notification inserts to authenticated Realtime subscribers.
-- Row-level visibility remains governed by the referral participant SELECT policy.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'referral_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_notifications;
  END IF;
END;
$migration$;
