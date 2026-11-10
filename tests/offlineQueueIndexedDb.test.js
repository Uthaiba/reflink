import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { createOfflineQueueCryptoKey } from "../src/lib/offlineQueueCrypto.js";
import {
  claimQueuedReferral,
  getOfflineKeyVaultEnvelope,
  getQueueCount,
  listQueuedReferrals,
  listDecryptedQueuedReferrals,
  migratePlaintextQueueToEncrypted,
  queueEncryptedReferral,
  releaseQueuedReferralClaim,
  removeQueuedReferral,
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

test("concurrent migration callers atomically replace a legacy record only once", async () => {
  await seedVersionTwoPlaintextQueue({
    client_id: "legacy-concurrent",
    owner_user_id: "user-a",
    created_at: "2026-11-06T10:00:00.000Z",
    payload: referral("user-a", "legacy-concurrent"),
    sync_status: "pending",
    queued_at: "2026-11-06T10:00:00.000Z",
  });

  const key = await createOfflineQueueCryptoKey();
  const results = await Promise.all([
    migratePlaintextQueueToEncrypted("user-a", key),
    migratePlaintextQueueToEncrypted("user-a", key),
  ]);

  assert.equal(results.reduce((total, result) => total + result.migrated, 0), 1);
  assert.equal(results.reduce((total, result) => total + result.failed, 0), 0);
  const stored = await readAllQueueRecords();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].payload_storage, "encrypted");
  assert.equal(Object.hasOwn(stored[0], "payload"), false);
  const [decrypted] = await listDecryptedQueuedReferrals("user-a", key);
  assert.equal(decrypted.payload.patient_name, "Synthetic Test Patient");
});

test("aborted migration transaction preserves the original plaintext referral for retry", async () => {
  await seedVersionTwoPlaintextQueue({
    client_id: "legacy-aborted-commit",
    owner_user_id: "user-a",
    created_at: "2026-11-06T10:00:00.000Z",
    payload: referral("user-a", "legacy-aborted-commit"),
    sync_status: "pending",
    queued_at: "2026-11-06T10:00:00.000Z",
  });

  const key = await createOfflineQueueCryptoKey();
  // Run the production opener first so the v2 fixture receives the v3 owner index.
  await listQueuedReferrals("user-a");
  const db = await openDatabase();
  const databasePrototype = Object.getPrototypeOf(db);
  const originalTransaction = databasePrototype.transaction;
  let abortNextQueueWrite = true;
  databasePrototype.transaction = function (storeNames, mode, ...options) {
    const tx = originalTransaction.call(this, storeNames, mode, ...options);
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    if (abortNextQueueWrite && mode === "readwrite" && names.includes(STORE_QUEUE)) {
      abortNextQueueWrite = false;
      queueMicrotask(() => {
        try { tx.abort(); } catch { /* transaction may already have completed */ }
      });
    }
    return tx;
  };
  db.close();

  try {
    const interrupted = await migratePlaintextQueueToEncrypted("user-a", key);
    assert.deepEqual(interrupted, { migrated: 0, skipped: 0, failed: 1 });

    const [preserved] = await readAllQueueRecords();
    assert.equal(preserved.client_id, "legacy-aborted-commit");
    assert.equal(preserved.payload.patient_name, "Synthetic Test Patient");
    assert.equal(preserved.payload_storage, undefined);

    const retried = await migratePlaintextQueueToEncrypted("user-a", key);
    assert.deepEqual(retried, { migrated: 1, skipped: 0, failed: 0 });
    const [decrypted] = await listDecryptedQueuedReferrals("user-a", key);
    assert.equal(decrypted.payload.patient_name, "Synthetic Test Patient");
  } finally {
    databasePrototype.transaction = originalTransaction;
  }
});

test("quota failure rejects encrypted queue save and preserves existing pending referrals", async () => {
  const key = await createOfflineQueueCryptoKey();
  await queueEncryptedReferral(referral("user-a", "existing-before-quota"), "user-a", key);

  const db = await openDatabase();
  const store = db.transaction(STORE_QUEUE, "readwrite").objectStore(STORE_QUEUE);
  const storePrototype = Object.getPrototypeOf(store);
  const originalAdd = storePrototype.add;
  let failNextQueueAdd = true;
  storePrototype.add = function (value, ...args) {
    if (failNextQueueAdd && this.name === STORE_QUEUE && value?.client_id === "quota-failure") {
      failNextQueueAdd = false;
      throw new DOMException("Synthetic storage quota exceeded.", "QuotaExceededError");
    }
    return originalAdd.call(this, value, ...args);
  };
  db.close();

  try {
    await assert.rejects(
      queueEncryptedReferral(referral("user-a", "quota-failure"), "user-a", key),
      (error) => error?.name === "QuotaExceededError",
    );
    const queued = await listDecryptedQueuedReferrals("user-a", key);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].client_id, "existing-before-quota");
    assert.equal(queued[0].payload.patient_name, "Synthetic Test Patient");
  } finally {
    storePrototype.add = originalAdd;
  }
});


test("concurrent tabs atomically claim a queue record for only one sync worker", async () => {
  const key = await createOfflineQueueCryptoKey();
  await queueEncryptedReferral(referral("user-a", "claim-race"), "user-a", key);

  const [claimA, claimB] = await Promise.all([
    claimQueuedReferral("claim-race", "user-a", { token: "worker-a", now: 1000 }),
    claimQueuedReferral("claim-race", "user-a", { token: "worker-b", now: 1000 }),
  ]);

  assert.deepEqual([claimA, claimB].filter(Boolean), [claimA || claimB]);
  assert.equal([claimA, claimB].filter(Boolean).length, 1);
  const winner = claimA || claimB;
  assert.ok(winner === "worker-a" || winner === "worker-b");
});

test("expired claims can be reclaimed and stale workers cannot release or delete the record", async () => {
  const key = await createOfflineQueueCryptoKey();
  await queueEncryptedReferral(referral("user-a", "claim-expiry"), "user-a", key);

  assert.equal(await claimQueuedReferral("claim-expiry", "user-a", {
    token: "old-worker", now: 1000, leaseMs: 100,
  }), "old-worker");
  assert.equal(await claimQueuedReferral("claim-expiry", "user-a", {
    token: "blocked-worker", now: 1050, leaseMs: 100,
  }), null);
  assert.equal(await claimQueuedReferral("claim-expiry", "user-a", {
    token: "new-worker", now: 1101, leaseMs: 100,
  }), "new-worker");

  assert.equal(await releaseQueuedReferralClaim("claim-expiry", "user-a", "old-worker"), false);
  assert.equal(await removeQueuedReferral("claim-expiry", "user-a", "old-worker"), false);
  assert.equal(await removeQueuedReferral("claim-expiry", "user-a", "new-worker"), true);
  assert.equal((await listQueuedReferrals("user-a")).length, 0);
});

test("queue claims are owner-scoped and cannot be used to claim another account's record", async () => {
  const key = await createOfflineQueueCryptoKey();
  await queueEncryptedReferral(referral("user-a", "claim-owner"), "user-a", key);

  assert.equal(await claimQueuedReferral("claim-owner", "user-b", { token: "wrong-owner" }), null);
  assert.equal(await claimQueuedReferral("claim-owner", "user-a", { token: "right-owner" }), "right-owner");
});
