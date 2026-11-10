-- Durable, idempotent dashboard notification queue for referral handoffs.
-- This migration queues dashboard events only. It does not send SMS or email.
ALTER TABLE public.referral_notifications
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

UPDATE public.referral_notifications
SET idempotency_key = referral_id::text || ':' || notification_type || ':' || channel || ':' || id::text
WHERE idempotency_key IS NULL;

ALTER TABLE public.referral_notifications
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS referral_notifications_idempotency_key_uidx
  ON public.referral_notifications (idempotency_key);

ALTER TABLE public.referral_notifications
  ADD CONSTRAINT referral_notifications_attempt_count_nonnegative
  CHECK (attempt_count >= 0);

CREATE INDEX IF NOT EXISTS referral_notifications_queue_due_idx
  ON public.referral_notifications (next_attempt_at, created_at)
  WHERE status = 'queued';

CREATE OR REPLACE FUNCTION public.enqueue_referral_dashboard_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  notification_kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'sent' THEN RETURN NEW; END IF;
    notification_kind := 'referral_sent';
  ELSE
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    IF NEW.status = 'sent' THEN
      notification_kind := 'referral_sent';
    ELSIF NEW.status = 'acknowledged' THEN
      notification_kind := 'referral_acknowledged';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.referral_notifications (
    referral_id,
    notification_type,
    channel,
    status,
    idempotency_key,
    attempt_count,
    next_attempt_at
  )
  VALUES (
    NEW.id,
    notification_kind,
    'dashboard',
    'queued',
    NEW.id::text || ':' || notification_kind || ':dashboard',
    0,
    now()
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.enqueue_referral_dashboard_notification() OWNER TO postgres;

DROP TRIGGER IF EXISTS enqueue_referral_dashboard_notification ON public.referrals;
CREATE TRIGGER enqueue_referral_dashboard_notification
AFTER INSERT OR UPDATE OF status ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_referral_dashboard_notification();
