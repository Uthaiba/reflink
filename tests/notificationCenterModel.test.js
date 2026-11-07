import test from "node:test";
import assert from "node:assert/strict";
import {
  countUnreadNotifications,
  filterNotifications,
  formatNotificationTimestamp,
  getNotificationPresentation,
} from "../src/components/notifications/notificationCenterModel.js";

test("notification filters return all records or only unread records", () => {
  const notifications = [
    { id: "n1", read_at: null },
    { id: "n2", read_at: "2026-11-06T08:00:00Z" },
    { id: "n3" },
  ];
  assert.equal(filterNotifications(notifications, "all").length, 3);
  assert.deepEqual(filterNotifications(notifications, "unread").map((item) => item.id), ["n1", "n3"]);
});

test("unread count handles absent and malformed collections safely", () => {
  assert.equal(countUnreadNotifications(undefined), 0);
  assert.equal(countUnreadNotifications({}), 0);
  assert.equal(countUnreadNotifications([{ read_at: null }, { read_at: "2026-11-06" }]), 1);
});

test("notification presentation uses allowlisted generic wording", () => {
  const known = getNotificationPresentation("referral_acknowledgement_due");
  assert.equal(known.category, "Workflow");
  assert.match(known.description, /facility's escalation procedure/);
  const unknown = getNotificationPresentation("unexpected_event");
  assert.equal(unknown.title, "REFLINK notification");
  assert.doesNotMatch(unknown.description, /patient|diagnosis|clinical/i);
});

test("notification timestamps handle valid and invalid values", () => {
  assert.notEqual(formatNotificationTimestamp("2026-11-06T08:00:00Z"), "Date unavailable");
  assert.equal(formatNotificationTimestamp("not-a-date"), "Date unavailable");
  assert.equal(formatNotificationTimestamp(null), "Date unavailable");
});
