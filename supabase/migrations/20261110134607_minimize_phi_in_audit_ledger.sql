-- Minimize PHI copied into the general-purpose audit ledger.
-- The clinical source-of-truth remains in referrals/counter_referrals.
-- The audit ledger retains actor, operation, record key and non-clinical
-- workflow metadata while excluding patient identifiers and clinical narrative.

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
    'patient_identifier',
    'patient_age_months',
    'patient_sex',
    'patient_phone',
    'patient_address',
    'relative_name',
    'relative_relationship',
    'relative_phone',
    'chief_complaint',
    'chief_complaint_other',
    'clinical_summary',
    'physical_findings',
    'physical_findings_structured',
    'provisional_diagnosis',
    'diagnosis_records',
    'diagnosis_category',
    'diagnosis_category_other',
    'diagnosis_status',
    'investigations',
    'investigation_records',
    'investigation_categories',
    'investigation_category',
    'treatment_given',
    'treatment_given_structured',
    'referral_reason',
    'assessment_findings',
    'final_diagnosis',
    'treatment_provided',
    'procedures_performed',
    'clinical_feedback',
    'ward_unit',
    'admission_diagnosis',
    'clinical_progress',
    'inpatient_treatment',
    'discharge_diagnosis',
    'condition_at_discharge',
    'discharge_medications',
    'follow_up_plan',
    'follow_up_instructions',
    'additional_notes',
    'referred_further_to'
  ];
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_snapshot := pg_catalog.to_jsonb(NEW) - sensitive_fields;
    INSERT INTO public.audit_log(
      actor_user_id, action, table_name, record_id, new_data, client_ip
    )
    VALUES (
      auth.uid(), 'CREATE', TG_TABLE_NAME, NEW.id, new_snapshot, NULL
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    old_snapshot := pg_catalog.to_jsonb(OLD) - sensitive_fields;
    new_snapshot := pg_catalog.to_jsonb(NEW) - sensitive_fields;
    INSERT INTO public.audit_log(
      actor_user_id, action, table_name, record_id, old_data, new_data, client_ip
    )
    VALUES (
      auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id,
      old_snapshot, new_snapshot, NULL
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    old_snapshot := pg_catalog.to_jsonb(OLD) - sensitive_fields;
    INSERT INTO public.audit_log(
      actor_user_id, action, table_name, record_id, old_data, client_ip
    )
    VALUES (
      auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id, old_snapshot, NULL
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;

ALTER FUNCTION public.audit_referral_mutation() OWNER TO postgres;
