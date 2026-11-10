import test from "node:test";
import assert from "node:assert/strict";
import {
  isEncryptedQueueRecord,
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

test("encrypted queue records contain an envelope and no plaintext payload field", () => {
  const encrypted = {
    client_id: "local-1",
    owner_user_id: "user-a",
    payload_storage: "encrypted",
    payload_envelope: { version: 1, algorithm: "AES-GCM", iv: "a".repeat(24), ciphertext: "b".repeat(64) },
  };
  assert.equal(isEncryptedQueueRecord(encrypted), true);
  assert.equal(isEncryptedQueueRecord({ ...encrypted, payload: { patient_name: "synthetic" } }), false);
  assert.equal(isEncryptedQueueRecord({ ...encrypted, payload_envelope: null }), false);
  assert.equal(isEncryptedQueueRecord({ ...encrypted, payload_storage: "plaintext" }), false);
});
