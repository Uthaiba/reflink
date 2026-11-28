export function assessmentFormFor(referral) {
  return Object.fromEntries([
    "assessment_findings", "final_diagnosis", "diagnosis_category", "diagnosis_status",
    "treatment_provided", "procedures_performed", "clinical_feedback", "disposition",
  ].map((field) => [field, referral?.[field] ?? ""]));
}

export function inpatientFormFor(referral) {
  return {
    admission_at: referral?.admission_at ? referral.admission_at.slice(0, 16) : "",
    ward_unit: referral?.ward_unit ?? "",
    admission_diagnosis: referral?.admission_diagnosis || referral?.final_diagnosis || "",
    clinical_progress: referral?.clinical_progress ?? "",
    inpatient_treatment: referral?.inpatient_treatment ?? "",
    discharge_diagnosis: referral?.discharge_diagnosis ?? "",
    condition_at_discharge: referral?.condition_at_discharge ?? "",
    discharge_medications: referral?.discharge_medications ?? "",
    follow_up_plan: referral?.follow_up_plan ?? "",
  };
}

// Compare the form's displayed baseline, not raw timestamps or fallback fields.
// Whitespace is meaningful clinical input and is not silently trimmed.
export function hasClinicalFormChanges(form, baseline) {
  return Object.keys(baseline).some((field) => (form[field] ?? "") !== baseline[field]);
}
