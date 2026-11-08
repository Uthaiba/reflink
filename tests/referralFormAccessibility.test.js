import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readApp = () => readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("new-referral custom validation is field-associated and focuses the first invalid control", async () => {
  const app = await readApp();
  const start = app.indexOf("function NewReferralForm");
  const end = app.indexOf("function PHCStaffDashboard", start);
  assert.ok(start >= 0 && end > start);
  const source = app.slice(start, end);

  assert.match(source, /className="new-referral-form"[\s\S]*?onSubmit=\{handleSubmit\}[\s\S]*?noValidate/);
  assert.match(source, /fieldRefs\.current\[firstInvalidField\]\?\.focus\(\)/);
  assert.match(source, /Enter a whole-number age of zero or greater/);
  assert.match(source, /Describe the other chief complaint/);

  for (const [field, inputId, errorId] of [
    ["patient_identifier", "new-referral-patient-identifier", "new-referral-patient-identifier-error"],
    ["patient_age_months", "patient_age_months", "new-referral-patient-age-error"],
    ["patient_sex", "patient_sex", "new-referral-patient-sex-error"],
    ["chief_complaint_category", "new-referral-chief-complaint", "new-referral-chief-complaint-error"],
    ["urgency", "new-referral-urgency", "new-referral-urgency-error"],
    ["receiving_facility_id", "new-referral-receiving-facility", "new-referral-receiving-facility-error"],
    ["physical_findings_structured", null, "new-referral-physical-findings-error"],
    ["chief_complaint_other", "new-referral-chief-complaint-other", "new-referral-chief-complaint-other-error"],
  ]) {
    assert.match(source, new RegExp(`fieldErrors\\.${field}`));
    if (inputId) assert.match(source, new RegExp(`id="${inputId}"`));
    assert.match(source, new RegExp(`id="${errorId}"`));
  }
});

test("investigation classification errors are announced, associated and focus the relevant measurement", async () => {
  const app = await readApp();
  const start = app.indexOf("function InvestigationResultEditor");
  const end = app.indexOf("function NewReferralForm", start);
  assert.ok(start >= 0 && end > start);
  const source = app.slice(start, end);

  assert.match(source, /getInvestigationValidationMessage\(candidate\)/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-invalid=\{Boolean\(validationError\)\}/);
  assert.match(source, /aria-describedby=\{validationError \? validationErrorId : undefined\}/);
  assert.match(source, /systolicRef : diastolicRef/);
  assert.match(source, /resultValueRef : referenceRangeRef/);
  assert.match(source, /setValidationError\("\\"\)/);
});
