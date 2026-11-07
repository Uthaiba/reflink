import test from "node:test";
import assert from "node:assert/strict";
import { getReceivingReferralMetrics } from "../src/lib/receivingReferralMetrics.js";

const NOW = Date.parse("2026-11-07T12:00:00.000Z");

test("receiving metrics distinguish acknowledged, arrived, under-assessment, discharged and completed states", () => {
  const referrals = [
    { status: "sent", urgency: "emergency", ack_due_at: "2026-11-07T10:00:00Z" },
    { status: "acknowledged" },
    { status: "patient_arrived" },
    { status: "under_assessment" },
    { status: "discharged", counter_referral: null },
    { status: "discharged", counter_referral: { id: "counter-1" } },
    { status: "completed" },
    { status: "cancelled", urgency: "emergency" },
  ];
  const metrics = getReceivingReferralMetrics(referrals, NOW);
  assert.equal(metrics.newReferrals, 1);
  assert.equal(metrics.awaitingPatientArrival, 1);
  assert.equal(metrics.patientsReceived, 1);
  assert.equal(metrics.underAssessment, 1);
  assert.equal(metrics.counterReferralPending, 1);
  assert.equal(metrics.completed, 1);
  assert.equal(metrics.emergencyIncomingReferrals, 1);
  assert.equal(metrics.overdueIncomingAcknowledgements, 1);
});

test("receiving metrics handle missing collections and exclude cancelled referrals from emergency work", () => {
  assert.deepEqual(getReceivingReferralMetrics(undefined, NOW), {
    newReferrals: 0,
    awaitingPatientArrival: 0,
    patientsReceived: 0,
    underAssessment: 0,
    counterReferralPending: 0,
    completed: 0,
    emergencyIncomingReferrals: 0,
    overdueIncomingAcknowledgements: 0,
  });
  const metrics = getReceivingReferralMetrics([
    { status: "cancelled", urgency: "emergency" },
    { status: "completed", urgency: "emergency" },
  ]);
  assert.equal(metrics.emergencyIncomingReferrals, 0);
});
