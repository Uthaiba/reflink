import test from "node:test";
import assert from "node:assert/strict";
import { applySmallCellSuppression } from "../src/lib/rphiDisclosure.js";

test("preserves zero as a valid zero count", () => {
  assert.deepEqual(applySmallCellSuppression(0), {
    value: 0,
    suppressed: false,
    reason: null,
  });
});

test("suppresses counts from one through four", () => {
  for (const count of [1, 2, 3, 4]) {
    assert.deepEqual(applySmallCellSuppression(count), {
      value: null,
      suppressed: true,
      reason: "SMALL_CELL",
    });
  }
});

test("publishes counts at the threshold and above", () => {
  for (const count of [5, 6, 25, 1000]) {
    assert.deepEqual(applySmallCellSuppression(count), {
      value: count,
      suppressed: false,
      reason: null,
    });
  }
});

test("supports a configured minimum visible count", () => {
  assert.equal(applySmallCellSuppression(5, 10).value, null);
  assert.equal(applySmallCellSuppression(10, 10).value, 10);
});

test("rejects negative, fractional, unsafe and non-numeric counts", () => {
  for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "5", null]) {
    assert.throws(() => applySmallCellSuppression(count), TypeError);
  }
});

test("rejects invalid suppression thresholds", () => {
  for (const threshold of [0, 1, 1.5, Number.MAX_SAFE_INTEGER + 1, "5"]) {
    assert.throws(() => applySmallCellSuppression(5, threshold), TypeError);
  }
});
