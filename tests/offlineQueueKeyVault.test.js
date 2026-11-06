import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  createOfflineKeyVault,
  rotateOfflineKeyVaultPassphrase,
  unlockOfflineKeyVault,
} from "../src/lib/offlineQueueKeyVault.js";

const cryptoProvider = webcrypto;
const ownerUserId = "user-123";
const passphrase = "Correct-Horse-Battery-9!";

test("offline key vault creates a non-extractable AES-256 key and wrapped envelope", async () => {
  const { envelope, key } = await createOfflineKeyVault({
    ownerUserId,
    passphrase,
    cryptoProvider,
  });

  assert.equal(key.type, "secret");
  assert.equal(key.algorithm.name, "AES-GCM");
  assert.equal(key.algorithm.length, 256);
  assert.equal(key.extractable, false);
  assert.equal(envelope.version, 1);
  assert.equal(envelope.owner_user_id, ownerUserId);
  assert.equal(envelope.kdf, "PBKDF2");
  assert.equal(envelope.hash, "SHA-256");
  assert.equal(envelope.iterations, 600000);
  assert.equal(envelope.algorithm, "AES-GCM");
  assert.equal(envelope.key_length, 256);
  assert.equal(envelope.salt.length, 32);
  assert.equal(envelope.iv.length, 24);
  assert.equal(envelope.wrapped_key.length, 96);
  assert.equal(JSON.stringify(envelope).includes(passphrase), false);
});

test("a stored vault can be unlocked with the correct passphrase", async () => {
  const created = await createOfflineKeyVault({
    ownerUserId,
    passphrase,
    cryptoProvider,
  });
  const unlocked = await unlockOfflineKeyVault(created.envelope, {
    ownerUserId,
    passphrase,
    cryptoProvider,
  });

  assert.equal(unlocked.type, "secret");
  assert.equal(unlocked.algorithm.length, 256);
  assert.equal(unlocked.extractable, false);

  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode("synthetic offline referral");
  const ciphertext = await cryptoProvider.subtle.encrypt(
    { name: "AES-GCM", iv },
    created.key,
    plaintext,
  );
  const recovered = await cryptoProvider.subtle.decrypt(
    { name: "AES-GCM", iv },
    unlocked,
    ciphertext,
  );
  assert.equal(new TextDecoder().decode(recovered), "synthetic offline referral");
});

test("wrong passphrase and cross-account unlock attempts fail closed", async () => {
  const { envelope } = await createOfflineKeyVault({
    ownerUserId,
    passphrase,
    cryptoProvider,
  });

  await assert.rejects(
    unlockOfflineKeyVault(envelope, {
      ownerUserId,
      passphrase: "Wrong-Passphrase-123!",
      cryptoProvider,
    }),
    /Unable to unlock/,
  );
  await assert.rejects(
    unlockOfflineKeyVault(envelope, {
      ownerUserId: "user-456",
      passphrase,
      cryptoProvider,
    }),
    /invalid or belongs to another account/,
  );
});

test("vault envelope tampering is rejected", async () => {
  const { envelope } = await createOfflineKeyVault({
    ownerUserId,
    passphrase,
    cryptoProvider,
  });
  const lastByte = envelope.wrapped_key.slice(-2);
  const tampered = {
    ...envelope,
    wrapped_key: envelope.wrapped_key.slice(0, -2) + (lastByte === "00" ? "01" : "00"),
  };

  await assert.rejects(
    unlockOfflineKeyVault(tampered, {
      ownerUserId,
      passphrase,
      cryptoProvider,
    }),
    /Unable to unlock/,
  );
});

test("passphrase rotation preserves the data key and rejects the old passphrase", async () => {
  const created = await createOfflineKeyVault({
    ownerUserId,
    passphrase,
    cryptoProvider,
  });
  const rotated = await rotateOfflineKeyVaultPassphrase(created.envelope, {
    ownerUserId,
    currentPassphrase: passphrase,
    newPassphrase: "Another-Strong-Phrase-2026!",
    cryptoProvider,
  });
  const unlocked = await unlockOfflineKeyVault(rotated.envelope, {
    ownerUserId,
    passphrase: "Another-Strong-Phrase-2026!",
    cryptoProvider,
  });

  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const ciphertext = await cryptoProvider.subtle.encrypt(
    { name: "AES-GCM", iv },
    created.key,
    new TextEncoder().encode("same data key"),
  );
  const plaintext = await cryptoProvider.subtle.decrypt(
    { name: "AES-GCM", iv },
    unlocked,
    ciphertext,
  );
  assert.equal(new TextDecoder().decode(plaintext), "same data key");

  await assert.rejects(
    unlockOfflineKeyVault(rotated.envelope, {
      ownerUserId,
      passphrase,
      cryptoProvider,
    }),
    /Unable to unlock/,
  );
});

test("short passphrases and malformed envelopes are rejected", async () => {
  await assert.rejects(
    createOfflineKeyVault({
      ownerUserId,
      passphrase: "short",
      cryptoProvider,
    }),
    /at least 12 characters/,
  );
  await assert.rejects(
    unlockOfflineKeyVault({}, {
      ownerUserId,
      passphrase,
      cryptoProvider,
    }),
    /invalid or belongs to another account/,
  );
});
