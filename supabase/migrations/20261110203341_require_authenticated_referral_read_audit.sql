-- Explicitly reject missing identity before referral-read audit authorization.
-- Applied only to the synthetic staging project.
CREATE OR REPLACE FUNCTION public.log_referral_read(p_referral_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_referral_id IS NULL OR NOT EXISTS (
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
    RAISE EXCEPTION 'Not authorized to audit this referral read.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_log(actor_user_id, action, table_name, record_id, client_ip)
  VALUES (auth.uid(), 'READ', 'referrals', p_referral_id, NULL);
END;
$function$;
