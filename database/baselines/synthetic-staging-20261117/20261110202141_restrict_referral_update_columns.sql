-- Restrict browser-side referral updates to fields used by the receiving-facility workflow.
-- RLS continues to enforce the assigned receiving facility. This is a column-level
-- least-privilege boundary; service_role and postgres privileges are unchanged.

REVOKE UPDATE ON TABLE public.referrals FROM authenticated;

GRANT UPDATE (
  status,
  acknowledged_at,
  patient_arrived_at,
  assessment_findings,
  final_diagnosis,
  diagnosis_category,
  diagnosis_status,
  treatment_provided,
  procedures_performed,
  clinical_feedback,
  disposition,
  assessment_completed_at,
  admission_at,
  ward_unit,
  admission_diagnosis,
  clinical_progress,
  inpatient_treatment,
  discharged_at,
  discharge_diagnosis,
  condition_at_discharge,
  discharge_medications,
  follow_up_plan,
  investigation_records
) ON TABLE public.referrals TO authenticated;

COMMENT ON TABLE public.referrals IS
  'Referral records. Authenticated UPDATE is restricted to the explicit receiving-workflow column allowlist; RLS remains authoritative for facility scope.';
