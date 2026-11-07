import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getReferralTimelineSteps } from "../src/lib/referralTimeline.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("synthetic referral lifecycle advances through every intended milestone", () => {
  const base = {
    created_at: "2026-11-07T08:00:00.000Z",
    acknowledged_at: "2026-11-07T08:05:00.000Z",
    patient_arrived_at: "2026-11-07T08:20:00.000Z",
    assessment_completed_at: "2026-11-07T09:00:00.000Z",
    admission_at: "2026-11-07T09:10:00.000Z",
    discharged_at: "2026-11-07T12:00:00.000Z",
    completed_at: "2026-11-07T12:15:00.000Z",
    counter_referral: { created_at: "2026-11-07T12:10:00.000Z" },
  };

  const expected = [
    ["sent", "acknowledged"],
    ["acknowledged", "patient-arrived"],
    ["patient_arrived", "assessment"],
    ["under_assessment", "assessment"],
    ["admitted", "discharge"],
    ["discharged", "counter-referral"],
    ["completed", undefined],
  ];

  for (const [status, currentStep] of expected) {
    const steps = getReferralTimelineSteps({
      ...base,
      status,
      // Keep future milestones absent until the relevant state is reached.
      assessment_completed_at: ["admitted", "discharged", "completed"].includes(status)
        ? base.assessment_completed_at
        : null,
      admission_at: ["admitted", "discharged", "completed"].includes(status) ? base.admission_at : null,
      discharged_at: ["discharged", "completed"].includes(status) ? base.discharged_at : null,
      counter_referral: status === "completed" ? base.counter_referral : null,
      completed_at: status === "completed" ? base.completed_at : null,
    });
    assert.equal(steps.find((step) => step.current)?.key, currentStep, `unexpected active milestone for ${status}`);
  }
});

test("receiving actions use expected prior statuses and persist their lifecycle timestamps", async () => {
  const app = await read("../src/App.jsx");
  const expectations = [
    ["const handleAcknowledgeReferral", "PATIENT ARRIVAL", '"acknowledged"', '"sent"', "acknowledged_at"],
    ["const handlePatientArrived", "START ASSESSMENT", '"patient_arrived"', '"acknowledged"', "patient_arrived_at"],
    ["const handleStartAssessment", "SAVE CLINICAL ASSESSMENT", '"under_assessment"', '"patient_arrived"', null],
    ["const handleSaveAssessment", "INITIAL LOAD", "assessment_completed_at", '"under_assessment"', "assessment_completed_at"],
    ["const handleSaveAdmission", "DISCHARGE PATIENT", '"admitted"', '"admitted"', "admission_diagnosis"],
    ["const handleDischargePatient", "ACKNOWLEDGE REFERRAL", '"discharged"', '"admitted"', "discharged_at"],
  ];

  for (const [startMarker, endMarker, updateMarker, expectedPrior, timestampOrField] of expectations) {
    const start = app.indexOf(startMarker);
    const end = app.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `could not isolate ${startMarker}`);
    const source = app.slice(start, end);
    assert.ok(source.includes(updateMarker), `${startMarker} missing expected update field/status`);
    assert.ok(source.includes(`.eq("status", ${expectedPrior})`), `${startMarker} missing expected prior status guard`);
    assert.ok(source.includes(".maybeSingle()"), `${startMarker} must detect stale/no-match updates`);
    if (timestampOrField) assert.ok(source.includes(timestampOrField), `${startMarker} missing ${timestampOrField}`);
  }
});

test("counter-referral UI confirms the transactional completion contract and validates required fields", async () => {
  const app = await read("../src/App.jsx");
  const start = app.indexOf("function CounterReferralForm");
  assert.ok(start >= 0);
  const source = app.slice(start);

  assert.ok(source.includes('supabase.rpc("submit_counter_referral"'));
  assert.ok(source.includes("!form.final_diagnosis.trim()"));
  assert.ok(source.includes("!form.outcome"));
  assert.ok(source.includes('form.outcome === "referred_further" && !form.referred_further_to.trim()'));
  assert.ok(source.includes('completion.referral_status !== "completed"'));
  assert.ok(source.includes("completed_at: completion.completed_at"));
  assert.ok(source.includes("onCompleted({"));
});

test("counter-referral database function enforces facility ownership, discharged-only submission and serialized retry", async () => {
  const sql = await read("../supabase/migrations/20261105000100_admin_aggregate_referral_volume.sql");
  const start = sql.indexOf("create or replace function public.submit_counter_referral");
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start);
  const source = sql.slice(start, end);

  assert.ok(source.includes("v_role is distinct from 'receiving_staff'"));
  assert.ok(source.includes("v_receiving_facility_id is distinct from v_facility_id"));
  assert.ok(source.includes("for update"));
  assert.ok(source.includes("if v_status <> 'discharged' then"));
  assert.ok(source.includes("if v_status = 'completed'"));
  assert.ok(source.includes("v_existing_user_id = v_user_id"));
  assert.ok(source.includes("set status = 'completed'"));
  assert.ok(source.includes("completed_at = coalesce(completed_at"));
});

test("both facility workspaces subscribe to referral changes within their own facility scope", async () => {
  const app = await read("../src/App.jsx");
  assert.ok(app.includes('filter:\n                `referring_facility_id=eq.${profile.facility_id}`'));
  assert.ok(app.includes('filter: `receiving_facility_id=eq.${profile.facility_id}`'));
  assert.ok(app.includes("void loadIncomingReferrals()"));
  assert.ok(app.includes("loadMyReferrals();"));
});
