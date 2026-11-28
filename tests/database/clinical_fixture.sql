ALTER TABLE public.referrals
  ADD COLUMN referral_number text DEFAULT 'SYNTHETIC',
  ADD COLUMN assessment_findings text,
  ADD COLUMN final_diagnosis text,
  ADD COLUMN diagnosis_category text,
  ADD COLUMN diagnosis_status text,
  ADD COLUMN treatment_provided text,
  ADD COLUMN procedures_performed text,
  ADD COLUMN clinical_feedback text,
  ADD COLUMN disposition text,
  ADD COLUMN assessment_completed_at timestamptz,
  ADD COLUMN admission_at timestamptz,
  ADD COLUMN discharged_at timestamptz,
  ADD COLUMN ward_unit text,
  ADD COLUMN admission_diagnosis text,
  ADD COLUMN clinical_progress text,
  ADD COLUMN inpatient_treatment text,
  ADD COLUMN discharge_diagnosis text,
  ADD COLUMN condition_at_discharge text,
  ADD COLUMN discharge_medications text,
  ADD COLUMN follow_up_plan text;
CREATE OR REPLACE FUNCTION public.fixture_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.investigation_records->0->>'result_notes'='reject_fixture'
     OR NEW.final_diagnosis='reject_clinical_fixture'
  THEN RAISE EXCEPTION 'Synthetic audit rejection'; END IF;
  INSERT INTO public.audit_log(referral_id) VALUES(NEW.id);
  RETURN NEW;
END; $$;
