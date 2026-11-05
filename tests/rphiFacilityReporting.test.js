import test from "node:test";
import assert from "node:assert/strict";
import { isCompleteCalendarMonth } from "../src/lib/rphiFacilityReporting.js";

test("accepts complete calendar months including leap February", () => {
  assert.equal(isCompleteCalendarMonth("2026-11-01", "2026-11-30"), true);
  assert.equal(isCompleteCalendarMonth("2024-02-01", "2024-02-29"), true);
  assert.equal(isCompleteCalendarMonth("2025-02-01", "2025-02-28"), true);
});

test("rejects partial, cross-month and reversed periods", () => {
  assert.equal(isCompleteCalendarMonth("2026-11-01", "2026-11-05"), false);
  assert.equal(isCompleteCalendarMonth("2026-10-15", "2026-11-30"), false);
  assert.equal(isCompleteCalendarMonth("2026-11-30", "2026-11-01"), false);
});

test("rejects malformed and impossible dates", () => {
  assert.equal(isCompleteCalendarMonth("2026-13-01", "2026-13-31"), false);
  assert.equal(isCompleteCalendarMonth("2026-02-01", "2026-02-30"), false);
  assert.equal(isCompleteCalendarMonth("", ""), false);
});
