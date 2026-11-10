import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const STALE_MESSAGE =
  "This referral has changed since it was loaded. Refresh and review the current status before retrying.";

const handlers = [
  { name: "acknowledgement", start: "const handleAcknowledgeReferral", end: "PATIENT ARRIVAL", expectedStatus: "sent" },
  { name: "patient arrival", start: "const handlePatientArrived", end: "START ASSESSMENT", expectedStatus: "acknowledged" },
  { name: "assessment start", start: "const handleStartAssessment", end: "SAVE CLINICAL ASSESSMENT", expectedStatus: "patient_arrived" },
  { name: "clinical assessment save", start: "const handleSaveAssessment", end: "INITIAL LOAD", expectedStatus: "under_assessment" },
  { name: "admission save", start: "const handleSaveAdmission", end: "DISCHARGE PATIENT", expectedStatus: "admitted" },
  { name: "patient discharge", start: "const handleDischargePatient", end: "ACKNOWLEDGE REFERRAL", expectedStatus: "admitted" },
];

test("receiving lifecycle updates use compare-and-set status guards", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  for (const handler of handlers) {
    const start = app.indexOf(handler.start);
    assert.notEqual(start, -1, `missing ${handler.name} handler`);
    const end = app.indexOf(handler.end, start + handler.start.length);
    assert.ok(end > start, `could not isolate ${handler.name} handler`);
    const source = app.slice(start, end);

    assert.ok(
      source.includes(`.eq("status", "${handler.expectedStatus}")`),
      `${handler.name} must compare the expected previous status`,
    );
    assert.ok(source.includes(".maybeSingle()"), `${handler.name} must detect a no-match update`);
    assert.ok(
      source.includes("if (!data)") && source.includes(STALE_MESSAGE),
      `${handler.name} must report a stale referral without treating it as success`,
    );
  }
});
