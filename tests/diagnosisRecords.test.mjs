import test from "node:test";
import assert from "node:assert/strict";
import { getLegacyDiagnosisStatus } from "../src/lib/diagnosisRecords.js";

test("empty structured diagnoses have no legacy certainty", () => {
  assert.equal(getLegacyDiagnosisStatus([]), null);
});

test("single and matching diagnoses preserve their supported status", () => {
  for (const status of ["suspected", "provisional", "confirmed"]) {
    assert.equal(getLegacyDiagnosisStatus([{ status }]), status);
    assert.equal(getLegacyDiagnosisStatus([{ status }, { status }]), status);
  }
});

test("mixed certainty never becomes a comma-delimited or overstated scalar", () => {
  for (const statuses of [
    ["suspected", "confirmed"],
    ["provisional", "suspected"],
    ["confirmed", "provisional", "suspected"],
  ]) assert.equal(getLegacyDiagnosisStatus(statuses.map((status) => ({ status }))), null);
});

test("mixed diagnosis projection preserves original clinical entries", () => {
  const records = Object.freeze([
    Object.freeze({ status: "suspected", diagnosis: "Synthetic A", category: "A" }),
    Object.freeze({ status: "confirmed", diagnosis: "Synthetic B", category: "B" }),
  ]);
  const before = JSON.stringify(records);
  getLegacyDiagnosisStatus(records);
  assert.equal(JSON.stringify(records), before);
});

test("invalid diagnosis statuses are rejected before database submission", () => {
  for (const status of [null, undefined, "", "unknown", "suspected, confirmed", "CONFIRMED"]) {
    assert.throws(() => getLegacyDiagnosisStatus([{ status }]), /supported diagnosis status/);
  }
});

test("non-list diagnosis input is rejected", () => {
  for (const input of [null, undefined, {}, "confirmed"]) {
    assert.throws(() => getLegacyDiagnosisStatus(input), /must be a list/);
  }
});
