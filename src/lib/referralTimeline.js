export function getReferralTimelineSteps(referral = {}) {
  const counterReferral = Array.isArray(referral.counter_referral)
    ? referral.counter_referral[0]
    : referral.counter_referral;

  return [
    {
      key: "created",
      label: "Referral Created",
      timestamp: referral.created_at,
    },
    {
      key: "acknowledged",
      label: "Referral Acknowledged",
      timestamp: referral.acknowledged_at,
    },
    {
      key: "patient-arrived",
      label: "Patient Arrived",
      timestamp: referral.patient_arrived_at,
    },
    {
      key: "assessment",
      label: referral.assessment_completed_at
        ? "Assessment Completed"
        : referral.status === "under_assessment"
          ? "Assessment in Progress"
          : "Assessment",
      timestamp: referral.assessment_completed_at,
    },
    {
      key: "admission",
      label: "Patient Admitted",
      timestamp: referral.admission_at,
    },
    {
      key: "discharge",
      label: "Patient Discharged",
      timestamp: referral.discharged_at,
    },
    {
      key: "counter-referral",
      label: "Counter-Referral Submitted",
      timestamp: counterReferral?.created_at,
    },
    {
      key: "completed",
      label: "Referral Completed",
      timestamp: referral.completed_at,
    },
  ];
}
