-- Proposal only: enforce the referral-create trust boundary before INSERT.
-- Do not apply until the reviewed schema baseline is reconstructed and this
-- migration is executed against synthetic staging with role/RLS tests.

CREATE OR REPLACE FUNCTION public.enforce_referral_create_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid;
  v_profile_role text;
  v_sender_facility_id uuid;
  v_sender_facility_active boolean;
  v_destination_active boolean;
BEGIN
  -- Preserve explicitly privileged database/service operations. Ordinary
  -- authenticated browser requests must pass the checks below.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to create a referral.'
      USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(p.role)), p.facility_id
    INTO v_profile_role, v_sender_facility_id
  FROM public.profiles AS p
  WHERE p.id = v_actor_id;

  IF NOT FOUND
     OR v_profile_role IS DISTINCT FROM 'phc_staff'
     OR v_sender_facility_id IS NULL THEN
    RAISE EXCEPTION 'An assigned PHC staff profile is required to create a referral.'
      USING ERRCODE = '42501';
  END IF;

  -- The sender facility must still be active when the referral is created.
  SELECT f.is_active
    INTO v_sender_facility_active
  FROM public.facilities AS f
  WHERE f.id = v_sender_facility_id;

  IF NOT FOUND OR v_sender_facility_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'The referring facility must exist and be active.'
      USING ERRCODE = '42501';
  END IF;

  SELECT f.is_active
    INTO v_destination_active
  FROM public.facilities AS f
  WHERE f.id = NEW.receiving_facility_id;

  IF NOT FOUND OR v_destination_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'The receiving facility must exist and be active.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.sync_source IS NULL
     OR NEW.sync_source NOT IN ('online', 'offline') THEN
    RAISE EXCEPTION 'Referral sync source must be online or offline.'
      USING ERRCODE = '23514';
  END IF;

  IF nullif(btrim(NEW.offline_client_id), '') IS NULL THEN
    RAISE EXCEPTION 'A referral idempotency key is required.'
      USING ERRCODE = '23502';
  END IF;

  -- Caller-supplied authority and lifecycle values are never accepted.
  NEW.id := gen_random_uuid();
  NEW.referring_user_id := v_actor_id;
  NEW.referring_facility_id := v_sender_facility_id;
  NEW.status := 'sent';
  NEW.is_test := false;
  NEW.created_at := now();

  -- A new referral cannot arrive pre-acknowledged, assessed, admitted,
  -- discharged or completed. Lifecycle data is written by later workflows.
  NEW.acknowledged_at := NULL;
  NEW.patient_arrived_at := NULL;
  NEW.completed_at := NULL;
  NEW.assessment_findings := NULL;
  NEW.final_diagnosis := NULL;
  NEW.treatment_provided := NULL;
  NEW.procedures_performed := NULL;
  NEW.clinical_feedback := NULL;
  NEW.disposition := NULL;
  NEW.assessment_completed_at := NULL;
  NEW.discharged_at := NULL;
  NEW.admission_at := NULL;
  NEW.ward_unit := NULL;
  NEW.admission_diagnosis := NULL;
  NEW.clinical_progress := NULL;
  NEW.inpatient_treatment := NULL;
  NEW.discharge_diagnosis := NULL;
  NEW.condition_at_discharge := NULL;
  NEW.discharge_medications := NULL;
  NEW.follow_up_plan := NULL;
  NEW.investigation_category := NULL;
  NEW.ack_due_at := NULL;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_referral_create_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_referral_create_context() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_referral_create_context() FROM authenticated;
REVOKE ALL ON FUNCTION public.enforce_referral_create_context() FROM service_role;

DROP TRIGGER IF EXISTS a_referral_creation_context_guard ON public.referrals;
CREATE TRIGGER a_referral_creation_context_guard
BEFORE INSERT ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.enforce_referral_create_context();
