import test from "node:test";
import assert from "node:assert/strict";
import {
  isQueueRecordOwnedBy,
  isValidQueueOwner,
} from "../src/lib/offlineReferralQueue.js";

test("offline queue accepts only a non-empty owner matching the referral author", () => {
  assert.equal(isValidQueueOwner({ referring_user_id: "user-a" }, "user-a"), true);
  assert.equal(isValidQueueOwner({ referring_user_id: "user-a" }, "user-b"), false);
  assert.equal(isValidQueueOwner({ referring_user_id: "user-a" }, ""), false);
  assert.equal(isValidQueueOwner({}, "user-a"), false);
});

test("offline queue records are visible only to their recorded owner", () => {
  const record = { client_id: "local-1", owner_user_id: "user-a" };
  assert.equal(isQueueRecordOwnedBy(record, "user-a"), true);
  assert.equal(isQueueRecordOwnedBy(record, "user-b"), false);
  assert.equal(isQueueRecordOwnedBy(record, null), false);
  assert.equal(isQueueRecordOwnedBy({ client_id: "legacy" }, "user-a"), false);
});

test("queue ownership comparison is type-normalized but rejects missing values", () => {
  assert.equal(isQueueRecordOwnedBy({ owner_user_id: 123 }, "123"), true);
  assert.equal(isQueueRecordOwnedBy({ owner_user_id: null }, "null"), false);
  assert.equal(isValidQueueOwner({ referring_user_id: 123 }, "123"), true);
});
