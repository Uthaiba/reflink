import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  compareIncomingReferralPriority,
  isAcknowledgementOverdue,
  isOpenIncomingReferral,
  sortIncomingReferralsByPriority,
} from "../src/lib/referralPriority.js";

const NOW = Date.parse("2026-11-07T12:00:00.000Z");

test("only sent referrals with a valid past acknowledgement deadline are overdue", () => {
  assert.equal(isAcknowledgementOverdue({
    status: "sent",
    ack_due_at: "2026-11-07T11:59:00.000Z",
  }, NOW), true);
  assert.equal(isAcknowledgementOverdue({
    status: "sent",
    ack_due_at: "2026-11-07T12:01:00.000Z",
  }, NOW), false);
  assert.equal(isAcknowledgementOverdue({
    status: "acknowledged",
    ack_due_at: "2026-11-07T11:00:00.000Z",
  }, NOW), false);
  assert.equal(isAcknowledgementOverdue({
    status: "sent",
    ack_due_at: "not-a-date",
  }, NOW), false);
  assert.equal(isAcknowledgementOverdue({ status: "sent" }, NOW), false);
});

test("receiving queue prioritises urgency, then overdue acknowledgements, then age", () => {
  const referrals = [
    { id: "routine-old", urgency: "routine", status: "sent", created_at: "2026-11-07T08:00:00Z" },
    { id: "urgent-current", urgency: "urgent", status: "sent", ack_due_at: "2026-11-07T12:30:00Z", created_at: "2026-11-07T09:00:00Z" },
    { id: "emergency", urgency: "emergency", status: "sent", created_at: "2026-11-07T11:00:00Z" },
    { id: "urgent-overdue", urgency: "urgent", status: "sent", ack_due_at: "2026-11-07T10:00:00Z", created_at: "2026-11-07T10:00:00Z" },
    { id: "routine-new", urgency: "routine", status: "sent", created_at: "2026-11-07T10:00:00Z" },
  ];
  assert.deepEqual(
    sortIncomingReferralsByPriority(referrals, NOW).map(({ id }) => id),
    ["emergency", "urgent-overdue", "urgent-current", "routine-old", "routine-new"],
  );
  assert.equal(compareIncomingReferralPriority(referrals[2], referrals[1], NOW) < 0, true);
});

test("active receiving queue excludes closed referrals but keeps discharged referrals awaiting counter-referral", () => {
  assert.equal(isOpenIncomingReferral({ status: "cancelled" }), false);
  assert.equal(isOpenIncomingReferral({ status: "completed" }), false);
  assert.equal(isOpenIncomingReferral({ status: "discharged", counter_referral: { id: "cr-1" } }), false);
  assert.equal(isOpenIncomingReferral({ status: "discharged", counter_referral: null }), true);
  assert.equal(isOpenIncomingReferral({ status: "under_assessment" }), true);
});

test("receiving referral query selects the acknowledgement deadline used by overdue indicators", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const dashboardStart = app.indexOf("function ReceivingDashboard()");
  assert.notEqual(dashboardStart, -1);
  const loadIncomingStart = app.indexOf("LOAD INCOMING REFERRALS", dashboardStart);
  const queryStart = app.indexOf('.from("referrals")', loadIncomingStart);
  const queryEnd = app.indexOf('          .eq(\n            "receiving_facility_id"', queryStart);
  assert.ok(loadIncomingStart > dashboardStart);
  assert.ok(queryStart > loadIncomingStart);
  assert.ok(queryEnd > queryStart);
  const projection = app.slice(queryStart, queryEnd);
  assert.match(projection, /urgency,\s*status,\s*ack_due_at,\s*created_at/i);
});
