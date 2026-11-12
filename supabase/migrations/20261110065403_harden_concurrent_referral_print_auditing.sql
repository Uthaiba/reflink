-- Staging hardening: serialize print-number allocation per referral.
-- The unique index is the final integrity guard; the advisory transaction lock
-- makes normal concurrent requests wait and allocate the next available number.

CREATE UNIQUE INDEX IF NOT EXISTS referral_print_events_referral_print_number_uidx
  ON public.referral_print_events (referral_id, print_number);

CREATE OR REPLACE FUNCTION public.log_referral_print(
  p_referral_id uuid,
  p_copy_label text DEFAULT 'REFERRAL COPY'::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  next_number integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.referrals r
    WHERE r.id = p_referral_id
      AND (
        public.is_administrator()
        OR r.referring_user_id = auth.uid()
        OR r.receiving_facility_id = (
          SELECT p.facility_id
          FROM public.profiles p
          WHERE p.id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to print this referral.'
      USING ERRCODE = '42501';
  END IF;

  -- Hash collisions only serialize unrelated referrals; they cannot weaken
  -- correctness. The lock is held until this transaction commits or rolls back.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_referral_id::text),
    91731
  );

  SELECT COALESCE(MAX(print_number), 0) + 1
    INTO next_number
  FROM public.referral_print_events
  WHERE referral_id = p_referral_id;

  INSERT INTO public.referral_print_events (
    referral_id,
    printed_by,
    copy_label,
    print_number
  )
  VALUES (
    p_referral_id,
    auth.uid(),
    COALESCE(NULLIF(trim(p_copy_label), ''), 'REFERRAL COPY'),
    next_number
  );

  RETURN next_number;
END;
$function$;

ALTER FUNCTION public.log_referral_print(uuid, text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.log_referral_print(uuid, text) TO authenticated, service_role;
