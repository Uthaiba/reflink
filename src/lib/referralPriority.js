const URGENCY_PRIORITY = Object.freeze({
  emergency: 0,
  urgent: 1,
  routine: 2,
});

function timestampOrNull(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * An acknowledgement is overdue only while the referral remains unacknowledged.
 * Invalid or absent deadlines fail closed and are not labelled overdue.
 */
export function isAcknowledgementOverdue(referral, now = Date.now()) {
  if (referral?.status !== "sent") return false;
  const dueAt = timestampOrNull(referral.ack_due_at);
  return dueAt !== null && dueAt < now;
}

/**
 * Sorts work for operational visibility; it does not make clinical decisions.
 * Emergency urgency is first, then urgent, then routine/unknown. Within an
 * urgency tier, overdue acknowledgements precede those still within target;
 * older referrals precede newer referrals as the final tie-breaker.
 */
export function compareIncomingReferralPriority(a, b, now = Date.now()) {
  const rank = (value) => URGENCY_PRIORITY[String(value || "routine").toLowerCase()] ?? 2;
  const urgencyDifference = rank(a?.urgency) - rank(b?.urgency);
  if (urgencyDifference !== 0) return urgencyDifference;

  const overdueDifference =
    Number(isAcknowledgementOverdue(b, now)) -
    Number(isAcknowledgementOverdue(a, now));
  if (overdueDifference !== 0) return overdueDifference;

  const aCreatedAt = timestampOrNull(a?.created_at) ?? Number.MAX_SAFE_INTEGER;
  const bCreatedAt = timestampOrNull(b?.created_at) ?? Number.MAX_SAFE_INTEGER;
  return aCreatedAt - bCreatedAt;
}

export function sortIncomingReferralsByPriority(referrals, now = Date.now()) {
  return [...(Array.isArray(referrals) ? referrals : [])].sort(
    (a, b) => compareIncomingReferralPriority(a, b, now),
  );
}

/**
 * Cancelled and completed referrals are closed. A discharged referral remains
 * operationally open until its counter-referral has been recorded.
 */
export function hasCounterReferral(referral) {
  const relation = referral?.counter_referral;
  return Array.isArray(relation) ? relation.length > 0 : Boolean(relation);
}

/**
 * Cancelled and completed referrals are closed. A discharged referral remains
 * operationally open until its counter-referral relation contains a record.
 * PostgREST returns one-to-many relations as arrays, including [] when absent.
 */
export function isOpenIncomingReferral(referral) {
  const status = String(referral?.status || "").toLowerCase();
  if (!status || status === "completed" || status === "cancelled") return false;
  return status !== "discharged" || !hasCounterReferral(referral);
}
