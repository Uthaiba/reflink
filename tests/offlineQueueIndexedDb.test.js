import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { createOfflineQueueCryptoKey } from "../src/lib/offlineQueueCrypto.js";
import {
  getOfflineKeyVaultEnvelope,
  getQueueCount,
  listQueuedReferrals,
  listDecryptedQueuedReferrals,
  migratePlaintextQueueToEncrypted,
  queueEncryptedReferral,
  saveOfflineKeyVaultEnvelope,
} from "../src/lib/offlineReferralQueue.js";

const DB_NAME = "reflink-offline";
const STORE_QUEUE = "referral_queue";
const STORE_CACHE = "cache";
const STORE_VAULT = "offline_key_vault";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = globalThis;
});

function openDatabase(version = 3) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAllQueueRecords() {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readonly");
      const request = tx.objectStore(STORE_QUEUE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function seedVersionTwoPlaintextQueue(record) {
  const request = indexedDB.open(DB_NAME, 2);
  const db = await new Promise((resolve, reject) => {
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_QUEUE, { keyPath: "client_id" });
      store.createIndex("created_at", "created_at");
      store.put(record);
      request.result.createObjectStore(STORE_CACHE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
}

const referral = (owner, id = "offline-1") => ({
  offline_client_id: id,
  referring_user_id: owner,
  patient_name: "Synthetic Test Patient",
  urgency: "routine",
  created_at: "2026-11-06T10:00:00.000Z",
});

test("IndexedDB implementation persists only ciphertext for encrypted referrals", async () => {
  const key = await createOfflineQueueCryptoKey();
  await queueEncryptedReferral(referral("user-a"), "user-a", key);

  const stored = await readAllQueueRecords();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].payload_storage, "encrypted");
  assert.equal(Object.hasOwn(stored[0], "payload"), false);
  assert.ok(stored[0].payload_envelope.ciphertext);

  const decrypted = await listDecryptedQueuedReferrals("user-a", key);
  assert.equal(decrypted.length, 1);
  assert.equal(decrypted[0].payload.patient_name, "Synthetic Test Patient");
});

test("queue ownership isolates records between accounts", async () => {
  const keyA = await createOfflineQueueCryptoKey();
  const keyB = await createOfflineQueueCryptoKey();
  await queueEncryptedReferral(referral("user-a", "a-1"), "user-a", keyA);
  await queueEncryptedReferral(referral("user-b", "b-1"), "user-b", keyB);

  assert.equal((await listQueuedReferrals("user-a")).length, 1);
  assert.equal((await listQueuedReferrals("user-b")).length, 1);
  assert.equal(await getQueueCount("user-c"), 0);
  await assert.rejects(listDecryptedQueuedReferrals("user-a", keyB));
});

test("legacy version-two queue upgrades and migrates plaintext without losing the referral", async () => {
  const legacy = {
    client_id: "legacy-1",
    owner_user_id: "user-a",
    created_at: "2026-11-06T10:00:00.000Z",
    payload: referral("user-a", "legacy-1"),
    sync_status: "pending",
    queued_at: "2026-11-06T10:00:00.000Z",
  };
  await seedVersionTwoPlaintextQueue(legacy);

  const key = await createOfflineQueueCryptoKey();
  const before = await listQueuedReferrals("user-a");
  assert.equal(before.length, 1);
  assert.equal(before[0].payload.patient_name, "Synthetic Test Patient");

  const result = await migratePlaintextQueueToEncrypted("user-a", key);
  assert.deepEqual(result, { migrated: 1, skipped: 0, failed: 0 });

  const stored = await readAllQueueRecords();
  assert.equal(stored.length, 1);
  assert.equal(Object.hasOwn(stored[0], "payload"), false);
  const decrypted = await listDecryptedQueuedReferrals("user-a", key);
  assert.equal(decrypted[0].payload.offline_client_id, "legacy-1");
});

test("migration is idempotent and does not rewrite already encrypted records", async () => {
  const key = await createOfflineQueueCryptoKey();
  await queueEncryptedReferral(referral("user-a"), "user-a", key);

  const first = await migratePlaintextQueueToEncrypted("user-a", key);
  const second = await migratePlaintextQueueToEncrypted("user-a", key);
  assert.deepEqual(first, { migrated: 0, skipped: 1, failed: 0 });
  assert.deepEqual(second, { migrated: 0, skipped: 1, failed: 0 });
  assert.equal((await readAllQueueRecords()).length, 1);
});

test("duplicate offline client IDs fail without overwriting the original pending referral", async () => {
  const key = await createOfflineQueueCryptoKey();
  await queueEncryptedReferral(referral("user-a", "same-id"), "user-a", key);

  await assert.rejects(
    queueEncryptedReferral({ ...referral("user-a", "same-id"), patient_name: "Different Synthetic Patient" }, "user-a", key),
  );

  const decrypted = await listDecryptedQueuedReferrals("user-a", key);
  assert.equal(decrypted.length, 1);
  assert.equal(decrypted[0].payload.patient_name, "Synthetic Test Patient");
});

test("wrapped vault envelope remains available after reopening the database", async () => {
  const envelope = {
    version: 1,
    owner_user_id: "user-a",
    kdf: "PBKDF2",
    hash: "SHA-256",
    iterations: 600000,
    algorithm: "AES-GCM",
    key_length: 256,
    salt: "a".repeat(32),
    iv: "b".repeat(24),
    wrapped_key: "c".repeat(96),
  };
  await saveOfflineKeyVaultEnvelope(envelope, "user-a");

  const db = await openDatabase();
  db.close();

  assert.deepEqual(await getOfflineKeyVaultEnvelope("user-a"), envelope);
  assert.equal(await getOfflineKeyVaultEnvelope("user-b"), null);
});

test("vault and queue stores are created independently without dropping cache data", async () => {
  await getQueueCount("user-a");
  const db = await openDatabase();
  try {
    assert.equal(db.objectStoreNames.contains(STORE_QUEUE), true);
    assert.equal(db.objectStoreNames.contains(STORE_CACHE), true);
    assert.equal(db.objectStoreNames.contains(STORE_VAULT), true);
    assert.equal(db.version, 3);
  } finally {
    db.close();
  }
});

test("failed legacy encryption leaves the original queued record intact", async () => {
  await getQueueCount("user-a");
  const circular = referral("user-a", "bad-legacy");
  circular.self = circular;
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      tx.objectStore(STORE_QUEUE).put({
        client_id: "bad-legacy",
        owner_user_id: "user-a",
        created_at: "2026-11-06T10:00:00.000Z",
        payload: circular,
        sync_status: "pending",
        queued_at: "2026-11-06T10:00:00.000Z",
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }

  const key = await createOfflineQueueCryptoKey();
  const result = await migratePlaintextQueueToEncrypted("user-a", key);
  assert.deepEqual(result, { migrated: 0, skipped: 0, failed: 1 });

  const [stored] = await readAllQueueRecords();
  assert.equal(stored.client_id, "bad-legacy");
  assert.equal(stored.payload.patient_name, "Synthetic Test Patient");
  assert.equal(stored.payload_storage, undefined);
});
