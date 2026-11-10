import {
  hasCounterReferral,
  isAcknowledgementOverdue,
  isOpenIncomingReferral,
} from "./referralPriority.js";

export function getReceivingReferralMetrics(referrals, now = Date.now()) {
  const records = Array.isArray(referrals) ? referrals : [];
  return {
    newReferrals: records.filter((item) => item?.status === "sent").length,
    awaitingPatientArrival: records.filter((item) => item?.status === "acknowledged").length,
    patientsReceived: records.filter((item) => item?.status === "patient_arrived").length,
    underAssessment: records.filter((item) => item?.status === "under_assessment").length,
    counterReferralPending: records.filter(
      (item) => item?.status === "discharged" && !hasCounterReferral(item),
    ).length,
    completed: records.filter((item) => item?.status === "completed").length,
    emergencyIncomingReferrals: records.filter(
      (item) =>
        String(item?.urgency || "").toLowerCase() === "emergency" &&
        isOpenIncomingReferral(item),
    ).length,
    overdueIncomingAcknowledgements: records.filter((item) => isAcknowledgementOverdue(item, now)).length,
  };
}
