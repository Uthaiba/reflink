import test from "node:test";
import assert from "node:assert/strict";
import { isValidOfflineVaultEnvelope } from "../src/lib/offlineReferralQueue.js";

const ownerUserId = "user-123";
const validEnvelope = {
  version: 1,
  owner_user_id: ownerUserId,
  kdf: "PBKDF2",
  hash: "SHA-256",
  iterations: 600000,
  algorithm: "AES-GCM",
  key_length: 256,
  salt: "a".repeat(32),
  iv: "b".repeat(24),
  wrapped_key: "c".repeat(96),
};

test("offline vault storage accepts only a correctly scoped wrapped envelope", () => {
  assert.equal(isValidOfflineVaultEnvelope(validEnvelope, ownerUserId), true);
  assert.equal(isValidOfflineVaultEnvelope(validEnvelope, "another-user"), false);
});

test("offline vault storage rejects missing, malformed and unsupported envelope fields", () => {
  assert.equal(isValidOfflineVaultEnvelope(null, ownerUserId), false);
  assert.equal(isValidOfflineVaultEnvelope({ ...validEnvelope, version: 2 }, ownerUserId), false);
  assert.equal(isValidOfflineVaultEnvelope({ ...validEnvelope, iterations: 1 }, ownerUserId), false);
  assert.equal(isValidOfflineVaultEnvelope({ ...validEnvelope, salt: "bad" }, ownerUserId), false);
  assert.equal(isValidOfflineVaultEnvelope({ ...validEnvelope, iv: "g".repeat(24) }, ownerUserId), false);
  assert.equal(isValidOfflineVaultEnvelope({ ...validEnvelope, wrapped_key: "d".repeat(94) }, ownerUserId), false);
  assert.equal(isValidOfflineVaultEnvelope({ ...validEnvelope, passphrase: "must-not-be-stored" }, ownerUserId), false);
});
