import { createOfflineKeyVault, unlockOfflineKeyVault } from "../../src/lib/offlineQueueKeyVault.js";
import {
  getOfflineKeyVaultEnvelope,
  getQueueCount,
  listDecryptedQueuedReferrals,
  migratePlaintextQueueToEncrypted,
  queueEncryptedReferral,
  saveOfflineKeyVaultEnvelope,
} from "../../src/lib/offlineReferralQueue.js";

const TEST_OWNER = "browser-test-account";
const TEST_PASSPHRASE = "Synthetic-browser-test-passphrase-2026";
const DB_NAME = "reflink-offline";

function syntheticReferral(id = "browser-reload-test") {
  return {
    offline_client_id: id,
    referring_user_id: TEST_OWNER,
    patient_name: "Synthetic Browser Test Patient",
    urgency: "routine",
    created_at: new Date().toISOString(),
  };
}

function openLegacyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const queue = db.createObjectStore("referral_queue", { keyPath: "client_id" });
      queue.createIndex("created_at", "created_at");
      queue.put({
        client_id: "browser-legacy-test",
        owner_user_id: TEST_OWNER,
        created_at: new Date().toISOString(),
        payload: syntheticReferral("browser-legacy-test"),
        sync_status: "pending",
        queued_at: new Date().toISOString(),
      });
      db.createObjectStore("cache", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

window.offlineQueueBrowserTests = {
  async createVaultAndQueue() {
    const { envelope, key } = await createOfflineKeyVault({
      ownerUserId: TEST_OWNER,
      passphrase: TEST_PASSPHRASE,
    });
    await saveOfflineKeyVaultEnvelope(envelope, TEST_OWNER);
    await queueEncryptedReferral(syntheticReferral(), TEST_OWNER, key);
    return { queued: await getQueueCount(TEST_OWNER), owner: TEST_OWNER };
  },

  async unlockAfterReload(passphrase = TEST_PASSPHRASE) {
    const envelope = await getOfflineKeyVaultEnvelope(TEST_OWNER);
    if (!envelope) throw new Error("Persisted vault envelope was not found after reload.");
    const key = await unlockOfflineKeyVault(envelope, {
      ownerUserId: TEST_OWNER,
      passphrase,
    });
    const records = await listDecryptedQueuedReferrals(TEST_OWNER, key);
    return {
      count: records.length,
      patientName: records[0]?.payload?.patient_name,
      clientId: records[0]?.client_id,
    };
  },

  async seedAndMigrateLegacyQueue() {
    const db = await openLegacyDatabase();
    db.close();
    await getQueueCount(TEST_OWNER);
    const { key } = await createOfflineKeyVault({
      ownerUserId: TEST_OWNER,
      passphrase: TEST_PASSPHRASE,
    });
    const migration = await migratePlaintextQueueToEncrypted(TEST_OWNER, key);
    const records = await listDecryptedQueuedReferrals(TEST_OWNER, key);
    return {
      migration,
      count: records.length,
      patientName: records[0]?.payload?.patient_name,
    };
  },

  async createSecondAccountQueueRecord() {
    const owner = "browser-test-account-b";
    const passphrase = "Second-synthetic-account-passphrase-2026";
    const { envelope, key } = await createOfflineKeyVault({ ownerUserId: owner, passphrase });
    await saveOfflineKeyVaultEnvelope(envelope, owner);
    await queueEncryptedReferral({
      offline_client_id: "account-b-record",
      referring_user_id: owner,
      patient_name: "Synthetic Account B Patient",
      urgency: "routine",
      created_at: new Date().toISOString(),
    }, owner, key);
    return {
      accountA: await getQueueCount(TEST_OWNER),
      accountB: await getQueueCount(owner),
    };
  },

  async queueSameIdAfterUnlock(id) {
    const envelope = await getOfflineKeyVaultEnvelope(TEST_OWNER);
    if (!envelope) throw new Error("Test vault is not available.");
    const key = await unlockOfflineKeyVault(envelope, {
      ownerUserId: TEST_OWNER,
      passphrase: TEST_PASSPHRASE,
    });
    return queueEncryptedReferral(syntheticReferral(id), TEST_OWNER, key);
  },

  async inspectStoredRecords() {
    const request = indexedDB.open(DB_NAME, 3);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("referral_queue", "readonly");
        const read = tx.objectStore("referral_queue").getAll();
        read.onsuccess = () => resolve(read.result.map((record) => ({
          clientId: record.client_id,
          owner: record.owner_user_id,
          hasPlaintextPayload: Object.hasOwn(record, "payload"),
          encrypted: record.payload_storage === "encrypted",
          hasCiphertext: typeof record.payload_envelope?.ciphertext === "string",
        })));
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  },
};

document.querySelector("#status").textContent = "Browser harness loaded";
