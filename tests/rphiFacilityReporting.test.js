import test from "node:test";
import assert from "node:assert/strict";
import { getPreviousCompleteCalendarMonthRange, isCompleteCalendarMonth } from "../src/lib/rphiFacilityReporting.js";

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

test("selects the latest fully completed Lagos calendar month", () => {
  assert.deepEqual(
    getPreviousCompleteCalendarMonthRange(new Date("2026-11-08T08:00:00.000Z")),
    { startDate: "2026-10-01", endDate: "2026-10-31" },
  );
});

test("selects complete months across year boundaries and leap years", () => {
  assert.deepEqual(
    getPreviousCompleteCalendarMonthRange(new Date("2027-01-10T00:30:00.000Z")),
    { startDate: "2026-12-01", endDate: "2026-12-31" },
  );
  assert.deepEqual(
    getPreviousCompleteCalendarMonthRange(new Date("2024-03-08T08:00:00.000Z")),
    { startDate: "2024-02-01", endDate: "2024-02-29" },
  );
  assert.deepEqual(
    getPreviousCompleteCalendarMonthRange(new Date("2026-11-08T08:00:00.000Z"), 2),
    { startDate: "2026-09-01", endDate: "2026-09-30" },
  );
});

test("rejects invalid reference dates and non-positive month offsets", () => {
  assert.throws(() => getPreviousCompleteCalendarMonthRange(new Date("invalid")), TypeError);
  assert.throws(() => getPreviousCompleteCalendarMonthRange(new Date(), 0), TypeError);
  assert.throws(() => getPreviousCompleteCalendarMonthRange(new Date(), -1), TypeError);
  assert.throws(() => getPreviousCompleteCalendarMonthRange(new Date(), 1.5), TypeError);
});
