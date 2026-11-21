// A discharge is a clinical outcome; formal referral closure has its own timestamp.
export function referralJourney(referral = {}) {
  return [
    { key: "created", label: "Referral Created", timestamp: referral.created_at },
    { key: "acknowledged", label: "Referral Acknowledged", timestamp: referral.acknowledged_at },
    { key: "arrived", label: "Patient Arrived", timestamp: referral.patient_arrived_at },
    { key: "assessment", label: "Assessment Completed", timestamp: referral.assessment_completed_at },
    ...(referral.admission_at ? [{ key: "admitted", label: "Patient Admitted", timestamp: referral.admission_at }] : []),
    ...(referral.discharged_at || referral.status === "discharged" ? [{ key: "discharged", label: "Patient Discharged", timestamp: referral.discharged_at }] : []),
    { key: "completed", label: "Referral Completed", timestamp: referral.completed_at },
  ];
}

export function filterReceivingReferrals(referrals, view = "active") {
  return referrals.filter((referral) => {
    const closed = ["discharged", "completed"].includes(referral.status);
    return view === "all" || (view === "closed" ? closed : !closed);
  });
}
