-- Disposable fixture only; exact staging trigger bodies inspected 17 November 2026.
ALTER TABLE public.referrals
 ADD COLUMN patient_identifier text DEFAULT 'SYNTHETIC ONLY',
 ADD COLUMN patient_age_months integer DEFAULT 240,
 ADD COLUMN patient_sex text DEFAULT 'other',
 ADD COLUMN chief_complaint text DEFAULT 'Synthetic complaint',
 ADD COLUMN chief_complaint_category text,
 ADD COLUMN urgency text DEFAULT 'routine',
 ADD COLUMN physical_findings text,
 ADD COLUMN physical_findings_structured jsonb DEFAULT '[]',
 ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN ack_due_at timestamptz;
ALTER TABLE public.audit_log ADD COLUMN actor_user_id uuid,
 ADD COLUMN action text, ADD COLUMN table_name text, ADD COLUMN record_id uuid,
 ADD COLUMN old_data jsonb, ADD COLUMN new_data jsonb, ADD COLUMN client_ip inet;
CREATE TABLE public.referral_updates(referral_id uuid,updated_by uuid,status text,notes text);
CREATE TABLE public.counter_referrals(referral_id uuid);
CREATE TABLE public.referral_notifications(referral_id uuid,notification_type text,channel text,
 status text,idempotency_key text UNIQUE,attempt_count integer,next_attempt_at timestamptz);
CREATE OR REPLACE FUNCTION public.audit_referral_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  old_snapshot jsonb;
  new_snapshot jsonb;
  sensitive_fields text[] := ARRAY[
    'referral_number','offline_client_id',
    'patient_identifier','patient_age_months','patient_sex','patient_phone',
    'patient_address','relative_name','relative_relationship','relative_phone',
    'chief_complaint','chief_complaint_other','clinical_summary','physical_findings',
    'physical_findings_structured','provisional_diagnosis','diagnosis_records',
    'diagnosis_category','diagnosis_category_other','diagnosis_status',
    'investigations','investigation_records','investigation_categories',
    'investigation_category','treatment_given','treatment_given_structured',
    'referral_reason','assessment_findings','final_diagnosis','treatment_provided',
    'procedures_performed','clinical_feedback','ward_unit','admission_diagnosis',
    'clinical_progress','inpatient_treatment','discharge_diagnosis',
    'condition_at_discharge','discharge_medications','follow_up_plan',
    'follow_up_instructions','additional_notes','referred_further_to'
  ];
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_snapshot := pg_catalog.to_jsonb(NEW) - sensitive_fields;
    INSERT INTO public.audit_log(actor_user_id, action, table_name, record_id, new_data, client_ip)
    VALUES (auth.uid(), 'CREATE', TG_TABLE_NAME, NEW.id, new_snapshot, NULL);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    old_snapshot := pg_catalog.to_jsonb(OLD) - sensitive_fields;
    new_snapshot := pg_catalog.to_jsonb(NEW) - sensitive_fields;
    INSERT INTO public.audit_log(actor_user_id, action, table_name, record_id, old_data, new_data, client_ip)
    VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id, old_snapshot, new_snapshot, NULL);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    old_snapshot := pg_catalog.to_jsonb(OLD) - sensitive_fields;
    INSERT INTO public.audit_log(actor_user_id, action, table_name, record_id, old_data, client_ip)
    VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id, old_snapshot, NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.log_referral_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN

    INSERT INTO public.referral_updates (
      referral_id,
      updated_by,
      status,
      notes
    )
    VALUES (
      NEW.id,
      auth.uid(),
      NEW.status,
      CASE NEW.status
        WHEN 'sent'
          THEN 'Referral sent by referring facility.'
        WHEN 'acknowledged'
          THEN 'Referral acknowledged by receiving facility.'
        WHEN 'patient_arrived'
          THEN 'Patient arrival confirmed.'
        WHEN 'under_assessment'
          THEN 'Patient is under clinical assessment.'
        WHEN 'admitted'
          THEN 'Patient admitted for further management.'
        WHEN 'discharged'
          THEN 'Patient discharged from receiving facility.'
        WHEN 'referred_again'
          THEN 'Patient referred again to another facility.'
        WHEN 'completed'
          THEN 'Referral episode completed.'
        WHEN 'cancelled'
          THEN 'Referral cancelled.'
        ELSE
          'Referral status updated.'
      END
    );

  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.require_counter_referral_before_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    if not exists (select 1 from public.counter_referrals c where c.referral_id = new.id) then
      raise exception 'A structured counter-referral is required before completing this referral.';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_referral_ack_due_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  minutes_due integer;
begin
  minutes_due := case lower(coalesce(new.urgency, 'routine'))
    when 'emergency' then 15
    when 'urgent' then 120
    else 1440
  end;
  new.ack_due_at := coalesce(new.created_at, now()) + make_interval(mins => minutes_due);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_referral_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status <> 'draft' then
    if nullif(trim(coalesce(new.patient_identifier, '')), '') is null then raise exception 'Patient identifier is required.'; end if;
    if new.patient_age_months is null or new.patient_age_months < 0 then raise exception 'Patient age is required and must be valid.'; end if;
    if nullif(trim(coalesce(new.patient_sex, '')), '') is null then raise exception 'Patient sex is required.'; end if;
    if nullif(trim(coalesce(new.chief_complaint, '')), '') is null and nullif(trim(coalesce(new.chief_complaint_category, '')), '') is null then raise exception 'Chief complaint is required.'; end if;
    if nullif(trim(coalesce(new.urgency, '')), '') is null then raise exception 'Referral urgency is required.'; end if;
    if new.receiving_facility_id is null then raise exception 'Receiving facility is required.'; end if;
  end if;
  if lower(coalesce(new.urgency, 'routine')) = 'emergency'
     and nullif(trim(coalesce(new.physical_findings, '')), '') is null
     and coalesce(jsonb_array_length(new.physical_findings_structured), 0) = 0
  then raise exception 'Emergency referrals require clinical/physical findings.'; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_referral_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN

  -- No transition to validate if the status hasn't changed.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  /*
    Valid referral workflow:

    sent
      -> acknowledged
      -> patient_arrived
      -> under_assessment
      -> admitted
      -> discharged
      -> completed

    under_assessment
      -> discharged

    under_assessment
      -> referred_again

    Cancellation is allowed before the referral episode is completed.
  */

  IF OLD.status = 'draft'
     AND NEW.status IN ('sent', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status = 'sent'
     AND NEW.status IN ('acknowledged', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status = 'acknowledged'
     AND NEW.status IN ('patient_arrived', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status = 'patient_arrived'
     AND NEW.status IN ('under_assessment', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status = 'under_assessment'
     AND NEW.status IN (
       'admitted',
       'discharged',
       'referred_again',
       'cancelled'
     ) THEN
    RETURN NEW;

  ELSIF OLD.status = 'admitted'
     AND NEW.status IN ('discharged', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status = 'discharged'
     AND NEW.status = 'completed' THEN
    RETURN NEW;

  ELSIF OLD.status = 'referred_again'
     AND NEW.status IN ('completed', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status IN ('completed', 'cancelled') THEN

    RAISE EXCEPTION
      'Invalid referral status transition: % -> %. This referral is already closed.',
      OLD.status,
      NEW.status;

  ELSE

    RAISE EXCEPTION
      'Invalid referral status transition: % -> %.',
      OLD.status,
      NEW.status;

  END IF;

END;
$function$;

CREATE TRIGGER enqueue_referral_dashboard_notification AFTER INSERT OR UPDATE OF status ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.enqueue_referral_dashboard_notification();
CREATE TRIGGER referral_ack_due_at_trigger BEFORE INSERT OR UPDATE OF urgency, created_at ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.set_referral_ack_due_at();
CREATE TRIGGER referral_counter_referral_guard BEFORE UPDATE OF status ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.require_counter_referral_before_completion();
CREATE TRIGGER referral_entry_validation_trigger BEFORE INSERT OR UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.validate_referral_entry();
CREATE TRIGGER referral_status_audit_trigger AFTER UPDATE OF status ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.log_referral_status_change();
CREATE TRIGGER referral_status_transition_validation BEFORE UPDATE OF status ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.validate_referral_status_transition();
CREATE TRIGGER referrals_audit_mutation AFTER INSERT OR DELETE OR UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.audit_referral_mutation();

-- Simplified participant-table grant; hosted counter-referral RLS is a separate gate.
GRANT SELECT ON public.counter_referrals TO authenticated;
