import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getReferralTimelineSteps } from "../src/lib/referralTimeline.js";

test("referral timeline separates discharge, counter-referral and formal completion", () => {
  const steps = getReferralTimelineSteps({
    status: "discharged",
    created_at: "2026-11-07T08:00:00Z",
    acknowledged_at: "2026-11-07T08:10:00Z",
    patient_arrived_at: "2026-11-07T08:30:00Z",
    assessment_completed_at: "2026-11-07T09:00:00Z",
    admission_at: "2026-11-07T09:10:00Z",
    discharged_at: "2026-11-07T12:00:00Z",
    completed_at: null,
    counter_referral: null,
  });

  const discharge = steps.find((step) => step.key === "discharge");
  const counterReferral = steps.find((step) => step.key === "counter-referral");
  const completed = steps.find((step) => step.key === "completed");

  assert.equal(discharge.timestamp, "2026-11-07T12:00:00Z");
  assert.equal(counterReferral.timestamp, undefined);
  assert.equal(completed.timestamp, null);
  assert.equal(discharge.label, "Patient Discharged");
  assert.equal(completed.label, "Referral Completed");
});

test("referral timeline records counter-referral and completion as separate milestones", () => {
  const steps = getReferralTimelineSteps({
    status: "completed",
    discharged_at: "2026-11-07T12:00:00Z",
    completed_at: "2026-11-07T12:15:00Z",
    counter_referral: {
      created_at: "2026-11-07T12:10:00Z",
      final_diagnosis: "Synthetic diagnosis",
    },
  });

  assert.equal(steps.find((step) => step.key === "counter-referral").timestamp, "2026-11-07T12:10:00Z");
  assert.equal(steps.find((step) => step.key === "completed").timestamp, "2026-11-07T12:15:00Z");
});

test("referral timeline accepts a one-to-many relationship result shape", () => {
  const steps = getReferralTimelineSteps({
    counter_referral: [{ created_at: "2026-11-07T12:10:00Z" }],
  });
  assert.equal(steps.find((step) => step.key === "counter-referral").timestamp, "2026-11-07T12:10:00Z");
});


test("current timeline milestone follows the actual referral status", () => {
  const admitted = getReferralTimelineSteps({
    status: "admitted",
    assessment_completed_at: "2026-11-07T09:00:00Z",
    admission_at: "2026-11-07T09:10:00Z",
  });
  assert.equal(admitted.find((step) => step.current)?.key, "discharge");

  const discharged = getReferralTimelineSteps({
    status: "discharged",
    assessment_completed_at: "2026-11-07T09:00:00Z",
    admission_at: "2026-11-07T09:10:00Z",
    discharged_at: "2026-11-07T12:00:00Z",
  });
  assert.equal(discharged.find((step) => step.current)?.key, "counter-referral");

  const completed = getReferralTimelineSteps({
    status: "completed",
    completed_at: "2026-11-07T12:15:00Z",
  });
  assert.equal(completed.some((step) => step.current), false);
});

test("PHC referral query selects formal completion timestamp and displays receiving feedback fields", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const phcStart = app.indexOf("function PHCStaffDashboard");
  const receivingStart = app.indexOf("function ReceivingDashboard", phcStart);
  assert.ok(phcStart >= 0 && receivingStart > phcStart);
  const phcSource = app.slice(phcStart, receivingStart);
  assert.match(phcSource, /completed_at/);
  assert.match(phcSource, /treatment_provided/);
  assert.match(phcSource, /referred_further_to/);
  assert.match(phcSource, /additional_notes/);
  assert.match(phcSource, /<ReferralTimeline referral=\{selectedReferral\} \/>/);
  assert.equal((phcSource.match(/<ReferralTimeline referral=\{selectedReferral\} \/>/g) || []).length, 1);
});
