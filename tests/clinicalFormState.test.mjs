import test from "node:test";
import assert from "node:assert/strict";
import { assessmentFormFor, inpatientFormFor, hasClinicalFormChanges } from "../src/lib/clinicalFormState.js";

test("opening an existing assessment is clean, including absent fields", () => {
  const referral = { assessment_findings: "Synthetic findings", clinical_feedback: null };
  const form = assessmentFormFor(referral);
  assert.equal(hasClinicalFormChanges(form, assessmentFormFor(referral)), false);
});

test("every assessment field change is detected and reverting clears dirty state", () => {
  const baseline = assessmentFormFor({});
  for (const field of Object.keys(baseline)) {
    assert.equal(hasClinicalFormChanges({ ...baseline, [field]: "Synthetic" }, baseline), true, field);
    assert.equal(hasClinicalFormChanges({ ...baseline }, baseline), false);
  }
});

test("inpatient defaults and displayed timestamp are a clean baseline", () => {
  const referral = { admission_at: "2026-11-17T10:45:32+00:00", final_diagnosis: "Synthetic diagnosis" };
  const form = inpatientFormFor(referral);
  assert.equal(form.admission_at, "2026-11-17T10:45");
  assert.equal(form.admission_diagnosis, "Synthetic diagnosis");
  assert.equal(hasClinicalFormChanges(form, inpatientFormFor(referral)), false);
});

test("every admission and discharge field change is detected", () => {
  const baseline = inpatientFormFor({});
  for (const field of Object.keys(baseline)) {
    assert.equal(hasClinicalFormChanges({ ...baseline, [field]: "Synthetic" }, baseline), true, field);
  }
});

test("clearing existing clinical text and whitespace edits remain unsaved changes", () => {
  const baseline = assessmentFormFor({ assessment_findings: "Synthetic findings" });
  assert.equal(hasClinicalFormChanges({ ...baseline, assessment_findings: "" }, baseline), true);
  assert.equal(hasClinicalFormChanges({ ...baseline, assessment_findings: "Synthetic findings " }, baseline), true);
});

test("null server fields and empty displayed controls do not cause false warnings", () => {
  const baseline = inpatientFormFor({ clinical_progress: null, discharge_medications: null });
  assert.equal(hasClinicalFormChanges({ ...baseline, clinical_progress: null }, baseline), false);
});

test("confirmed record data provides a new clean baseline without mutating server data", () => {
  const saved = Object.freeze({ clinical_progress: "Synthetic saved progress", discharge_diagnosis: "Synthetic outcome" });
  const form = inpatientFormFor(saved);
  assert.equal(hasClinicalFormChanges(form, inpatientFormFor(saved)), false);
  assert.equal(saved.clinical_progress, "Synthetic saved progress");
});

test("unrelated investigation updates do not mark a clean assessment dirty", () => {
  const initial = { assessment_findings: "Synthetic", investigation_records: [] };
  const refreshed = { ...initial, investigation_records: [{ result_status: "pending" }] };
  assert.equal(hasClinicalFormChanges(assessmentFormFor(initial), assessmentFormFor(refreshed)), false);
});
