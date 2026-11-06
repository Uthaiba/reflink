import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  createOfflineQueueCryptoKey,
  decryptOfflineReferralPayload,
  encryptOfflineReferralPayload,
} from "../src/lib/offlineQueueCrypto.js";

const cryptoProvider = webcrypto;

test("offline referral encryption uses a non-extractable AES-256-GCM key", async () => {
  const key = await createOfflineQueueCryptoKey(cryptoProvider);

  assert.equal(key.type, "secret");
  assert.equal(key.algorithm.name, "AES-GCM");
  assert.equal(key.algorithm.length, 256);
  assert.equal(key.extractable, false);
  assert.deepEqual([...key.usages].sort(), ["decrypt", "encrypt"]);
});

test("offline referral payload round-trips with its owner and record context", async () => {
  const key = await createOfflineQueueCryptoKey(cryptoProvider);
  const payload = {
    referring_user_id: "user-123",
    urgency: "urgent",
    clinical_summary: "Patient reports fever and difficulty breathing.",
    patient_name: "Amina Musa",
    metadata: { locale: "en-NG", attempt: 2 },
  };

  const envelope = await encryptOfflineReferralPayload(payload, {
    key,
    ownerUserId: "user-123",
    clientId: "offline-abc",
    cryptoProvider,
  });

  assert.equal(envelope.version, 1);
  assert.equal(envelope.algorithm, "AES-GCM");
  assert.equal(typeof envelope.iv, "string");
  assert.equal(typeof envelope.ciphertext, "string");
  assert.equal(JSON.stringify(envelope).includes("Amina Musa"), false);

  const decrypted = await decryptOfflineReferralPayload(envelope, {
    key,
    ownerUserId: "user-123",
    clientId: "offline-abc",
    cryptoProvider,
  });

  assert.deepEqual(decrypted, payload);
});

test("each encryption operation generates a fresh IV", async () => {
  const key = await createOfflineQueueCryptoKey(cryptoProvider);
  const options = {
    key,
    ownerUserId: "user-123",
    clientId: "offline-abc",
    cryptoProvider,
  };

  const first = await encryptOfflineReferralPayload({ referring_user_id: "user-123", value: "same" }, options);
  const second = await encryptOfflineReferralPayload({ value: "same" }, options);

  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test("ciphertext cannot be decrypted under a different owner or queue record ID", async () => {
  const key = await createOfflineQueueCryptoKey(cryptoProvider);
  const envelope = await encryptOfflineReferralPayload(
    { referring_user_id: "user-123", urgency: "routine" },
    {
      key,
      ownerUserId: "user-123",
      clientId: "offline-abc",
      cryptoProvider,
    },
  );

  await assert.rejects(
    decryptOfflineReferralPayload(envelope, {
      key,
      ownerUserId: "user-456",
      clientId: "offline-abc",
      cryptoProvider,
    }),
    /Unable to decrypt the offline referral/,
  );

  await assert.rejects(
    decryptOfflineReferralPayload(envelope, {
      key,
      ownerUserId: "user-123",
      clientId: "offline-other",
      cryptoProvider,
    }),
    /Unable to decrypt the offline referral/,
  );
});

test("tampered ciphertext and a different key are rejected", async () => {
  const key = await createOfflineQueueCryptoKey(cryptoProvider);
  const otherKey = await createOfflineQueueCryptoKey(cryptoProvider);
  const envelope = await encryptOfflineReferralPayload(
    { referring_user_id: "user-123", urgency: "emergency" },
    {
      key,
      ownerUserId: "user-123",
      clientId: "offline-abc",
      cryptoProvider,
    },
  );
  const lastByte = envelope.ciphertext.slice(-2);
  const tampered = {
    ...envelope,
    ciphertext: `${envelope.ciphertext.slice(0, -2)}${lastByte === "00" ? "01" : "00"}`,
  };

  await assert.rejects(
    decryptOfflineReferralPayload(tampered, {
      key,
      ownerUserId: "user-123",
      clientId: "offline-abc",
      cryptoProvider,
    }),
    /Unable to decrypt the offline referral/,
  );

  await assert.rejects(
    decryptOfflineReferralPayload(envelope, {
      key: otherKey,
      ownerUserId: "user-123",
      clientId: "offline-abc",
      cryptoProvider,
    }),
    /Unable to decrypt the offline referral/,
  );
});

test("malformed envelopes, unsupported versions and invalid payloads are rejected", async () => {
  const key = await createOfflineQueueCryptoKey(cryptoProvider);
  const options = {
    key,
    ownerUserId: "user-123",
    clientId: "offline-abc",
    cryptoProvider,
  };

  await assert.rejects(
    encryptOfflineReferralPayload([], options),
    /payload must be an object/,
  );
  await assert.rejects(
    encryptOfflineReferralPayload({ referring_user_id: "user-123", value: true }, { ...options, ownerUserId: "" }),
    /valid owner and offline referral ID/,
  );
  await assert.rejects(
    decryptOfflineReferralPayload({ version: 2, algorithm: "AES-GCM" }, options),
    /unsupported format/,
  );
  await assert.rejects(
    decryptOfflineReferralPayload({
      version: 1,
      algorithm: "AES-GCM",
      iv: "not-hex",
      ciphertext: "00",
    }, options),
    /invalid binary data/,
  );
});

test("extractable AES keys are rejected by the offline queue encryption API", async () => {
  const extractableKey = await cryptoProvider.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  await assert.rejects(
    encryptOfflineReferralPayload(
      { referring_user_id: "user-123", urgency: "routine" },
      {
        key: extractableKey,
        ownerUserId: "user-123",
        clientId: "offline-abc",
        cryptoProvider,
      },
    ),
    /non-extractable AES-256-GCM key/,
  );
});

test("payload owner must match the encryption owner", async () => {
  const key = await createOfflineQueueCryptoKey(cryptoProvider);
  const options = {
    key,
    ownerUserId: "user-123",
    clientId: "offline-abc",
    cryptoProvider,
  };

  await assert.rejects(
    encryptOfflineReferralPayload({ referring_user_id: "user-456", urgency: "routine" }, options),
    /payload owner must match/,
  );
});
