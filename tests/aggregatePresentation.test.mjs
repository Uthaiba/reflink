import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSeries, createAggregateDraft } from "../src/lib/aggregatePresentation.js";
const dataset = { key: "geography", title: "LGA activity", rpc: "approved_aggregate", columns: ["lga_label", "referral_count"], rows: [{ lga_label: "Synthetic LGA", referral_count: 12 }, { lga_label: "Withheld LGA", referral_count: null }] };
const report = { period: { start: "2026-10-01", end: "2026-11-01" }, generatedAt: "2026-11-17T10:00:00Z", datasets: [dataset] };
test("chart series preserves withheld cells and original row identity", () => {
  assert.deepEqual(aggregateSeries(dataset, "referral_count"), [{ row: 1, label: "Synthetic LGA", value: 12 }, { row: 2, label: "Withheld LGA", value: null }]);
  assert.deepEqual(aggregateSeries(dataset, "unapproved_count"), []);
});
test("malformed counts cannot produce chart values", () => {
  for (const value of [-1, 1, 4, 1.5, "12", Infinity, undefined]) {
    assert.equal(aggregateSeries({ ...dataset, rows: [{ referral_count: value }] }, "referral_count")[0].value, null);
  }
});
test("report statements trace to RPC row field without inferring withheld counts", () => {
  const draft = createAggregateDraft(report);
  assert.match(draft, /referral count = 12/);
  assert.match(draft, /approved_aggregate; row 1; field referral_count/);
  assert.match(draft, /1 count cells withheld/);
  assert.doesNotMatch(draft, /Withheld LGA: referral count/);
  assert.match(draft, /not population incidence/);
  assert.match(draft, /Reviewer:/);
});
test("empty aggregate output is never described as zero activity", () => {
  assert.match(createAggregateDraft({ ...report, datasets: [{ ...dataset, rows: [] }] }), /does not establish zero/);
});
