import test from "node:test";
import assert from "node:assert/strict";
import { summarizeReferrals } from "../src/lib/referralAnalytics.js";

test("empty authorized dataset returns zero without dividing by zero", () => {
  assert.deepEqual(summarizeReferrals(), {
    total: 0, classified: 0, unclassified: 0, completed: 0, categories: [], diagnoses: [],
  });
});

test("synthetic rows are excluded and missing diagnoses are not counted as conditions", () => {
  const result = summarizeReferrals([
    { is_test: true, diagnosis_category: "Fake", final_diagnosis: "Fake", status: "completed" },
    { diagnosis_category: "Maternal", final_diagnosis: "Preeclampsia", status: "completed" },
    { diagnosis_category: "Maternal", final_diagnosis: "Preeclampsia", status: "discharged" },
    { diagnosis_category: " ", final_diagnosis: "Unknown", status: "sent" },
  ]);
  assert.equal(result.total, 3);
  assert.equal(result.classified, 2);
  assert.equal(result.unclassified, 1);
  assert.equal(result.completed, 2);
  assert.deepEqual(result.categories, [
    { name: "Maternal", count: 2, percentage: 66.7 },
    { name: "Unclassified", count: 1, percentage: 33.3 },
  ]);
  assert.deepEqual(result.diagnoses, [{ condition: "Preeclampsia", count: 2, percentage: 66.7 }]);
});

test("no patient identifiers are returned by the aggregator", () => {
  const result = summarizeReferrals([{ patient_identifier: "PRIVATE", diagnosis_category: "Other" }]);
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
});
