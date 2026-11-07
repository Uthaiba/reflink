import { decryptOfflineReferralPayload, encryptOfflineReferralPayload } from "./offlineQueueCrypto.js";

const DB_NAME = "reflink-offline";
const DB_VERSION = 3;
const STORE_QUEUE = "referral_queue";
const STORE_CACHE = "cache";
const STORE_KEY_VAULT = "offline_key_vault";
const activeSyncPromises = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported by this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      let queueStore;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: "client_id" });
        queueStore.createIndex("created_at", "created_at");
        queueStore.createIndex("owner_user_id", "owner_user_id");
      } else {
        queueStore = tx.objectStore(STORE_QUEUE);
        if (!queueStore.indexNames.contains("owner_user_id")) queueStore.createIndex("owner_user_id", "owner_user_id");
        const cursorRequest = queueStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const record = cursor.value;
          if (!record.owner_user_id && record.payload?.referring_user_id) {
            record.owner_user_id = String(record.payload.referring_user_id);
            cursor.update(record);
          }
          cursor.continue();
        };
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORE_KEY_VAULT)) {
        db.createObjectStore(STORE_KEY_VAULT, { keyPath: "owner_user_id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("REFLINK offline storage is busy in another tab. Close other REFLINK tabs and retry."));
  });
}

export function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isValidQueueOwner(payload, ownerUserId) {
  return Boolean(ownerUserId && payload?.referring_user_id && String(payload.referring_user_id) === String(ownerUserId));
}

export function isQueueRecordOwnedBy(record, userId) {
  return Boolean(userId && record?.owner_user_id && String(record.owner_user_id) === String(userId));
}

export function isEncryptedQueueRecord(record) {
  return Boolean(
    record
    && record.payload_storage === "encrypted"
    && record.payload_envelope
    && record.payload_envelope.version === 1
    && record.payload_envelope.algorithm === "AES-GCM"
    && typeof record.payload_envelope.iv === "string"
    && typeof record.payload_envelope.ciphertext === "string"
    && !Object.prototype.hasOwnProperty.call(record, "payload")
  );
}

/**
 * @deprecated Use queueEncryptedReferral. Kept as a compatibility alias, but
 * deliberately requires the vault key and never writes plaintext payloads.
 */
export async function queueReferral(payload, ownerUserId, key) {
  return queueEncryptedReferral(payload, ownerUserId, key);
}


export async function queueEncryptedReferral(payload, ownerUserId, key) {
  if (!isValidQueueOwner(payload, ownerUserId)) throw new Error("The offline referral must belong to the currently authenticated user.");
  const clientId = payload.offline_client_id || createClientId();
  const envelope = await encryptOfflineReferralPayload(payload, { key, ownerUserId, clientId });
  const record = {
    client_id: clientId, owner_user_id: String(ownerUserId),
    created_at: payload.created_at || new Date().toISOString(),
    payload_storage: "encrypted", payload_envelope: envelope,
    sync_status: "pending", queued_at: new Date().toISOString(),
  };
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      const request = tx.objectStore(STORE_QUEUE).add(record);
      request.onerror = () => reject(request.error || new Error("Unable to add the encrypted offline referral."));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("The encrypted offline referral transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Unable to save the encrypted offline referral."));
    });
  } finally { db.close(); }
  return { ...record };
}

export async function decryptQueuedReferralRecord(record, ownerUserId, key) {
  if (!isQueueRecordOwnedBy(record, ownerUserId) || record.payload_storage !== "encrypted" || !record.payload_envelope) {
    throw new Error("The encrypted offline referral is invalid or belongs to another account.");
  }
  const payload = await decryptOfflineReferralPayload(record.payload_envelope, {
    key, ownerUserId, clientId: record.client_id,
  });
  if (!isValidQueueOwner(payload, ownerUserId)) throw new Error("The decrypted referral owner does not match the authenticated account.");
  return { ...record, payload };
}

export async function migratePlaintextQueueToEncrypted(ownerUserId, key) {
  if (!ownerUserId) throw new Error("An authenticated account is required for queue migration.");
  const owner = String(ownerUserId);
  const records = await listQueuedReferrals(owner);
  let migrated = 0, skipped = 0, failed = 0;
  for (const record of records) {
    if (record.payload_storage === "encrypted") { skipped += 1; continue; }
    if (!isQueueRecordOwnedBy(record, owner) || !isValidQueueOwner(record.payload, owner)) { failed += 1; continue; }
    try {
      const originalPayload = JSON.stringify(record.payload);
      const envelope = await encryptOfflineReferralPayload(record.payload, { key, ownerUserId: owner, clientId: record.client_id });
      const db = await openDb();
      try {
        const replaced = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_QUEUE, "readwrite");
          const store = tx.objectStore(STORE_QUEUE);
          let didReplace = false;
          const request = store.get(record.client_id);
          request.onsuccess = () => {
            const current = request.result;
            if (isQueueRecordOwnedBy(current, owner)
              && current.payload_storage !== "encrypted"
              && JSON.stringify(current.payload) === originalPayload) {
              const next = { ...current, payload_storage: "encrypted", payload_envelope: envelope };
              delete next.payload;
              store.put(next);
              didReplace = true;
            }
          };
          request.onerror = () => reject(request.error);
          tx.oncomplete = () => resolve(didReplace);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error("Unable to commit offline referral encryption."));
        });
        if (replaced) migrated += 1; else skipped += 1;
      } finally { db.close(); }
    } catch { failed += 1; }
  }
  return { migrated, skipped, failed };
}

export async function listDecryptedQueuedReferrals(ownerUserId, key) {
  const records = await listQueuedReferrals(ownerUserId);
  const results = [];
  for (const record of records) {
    if (!isEncryptedQueueRecord(record)) {
      throw new Error("A legacy offline referral must be encrypted before it can be read through this API.");
    }
    results.push(await decryptQueuedReferralRecord(record, ownerUserId, key));
  }
  return results;
}

export async function listQueuedReferrals(ownerUserId) {
  if (!ownerUserId) return [];
  const db = await openDb();
  try {
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readonly");
      const request = tx.objectStore(STORE_QUEUE).index("owner_user_id").getAll(String(ownerUserId));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error || new Error("Unable to read the offline queue."));
    });
    return records.filter((record) => isQueueRecordOwnedBy(record, ownerUserId))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  } finally {
    db.close();
  }
}

/**
 * Atomically claim one owner-scoped queue record for sync. IndexedDB serializes
 * readwrite transactions for this object store across same-origin tabs.
 * Claims contain no referral payload or patient information.
 */
export async function claimQueuedReferral(clientId, ownerUserId, {
  leaseMs = 5 * 60 * 1000,
  now = Date.now(),
  token = createClientId(),
} = {}) {
  if (!clientId || !ownerUserId || !token || !Number.isFinite(leaseMs) || leaseMs <= 0) return null;
  const owner = String(ownerUserId);
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      const store = tx.objectStore(STORE_QUEUE);
      const request = store.get(clientId);
      let claimed = false;
      request.onsuccess = () => {
        const record = request.result;
        if (!isQueueRecordOwnedBy(record, owner)) return;
        const currentClaim = record.sync_claim;
        const claimIsActive = currentClaim
          && currentClaim.owner_user_id === owner
          && Number.isFinite(currentClaim.expires_at)
          && currentClaim.expires_at > now;
        if (claimIsActive) return;
        store.put({
          ...record,
          sync_claim: {
            owner_user_id: owner,
            token: String(token),
            expires_at: now + leaseMs,
          },
        });
        claimed = true;
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(claimed ? String(token) : null);
      tx.onerror = () => reject(tx.error || new Error("Unable to claim the offline referral."));
      tx.onabort = () => reject(tx.error || new Error("Unable to claim the offline referral."));
    });
  } finally {
    db.close();
  }
}

/** Clear a claim only when the caller still owns its fencing token. */
export async function releaseQueuedReferralClaim(clientId, ownerUserId, claimToken) {
  if (!clientId || !ownerUserId || !claimToken) return false;
  const owner = String(ownerUserId);
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      const store = tx.objectStore(STORE_QUEUE);
      const request = store.get(clientId);
      let released = false;
      request.onsuccess = () => {
        const record = request.result;
        if (isQueueRecordOwnedBy(record, owner)
          && record.sync_claim?.owner_user_id === owner
          && record.sync_claim?.token === String(claimToken)) {
          const next = { ...record };
          delete next.sync_claim;
          store.put(next);
          released = true;
        }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(released);
      tx.onerror = () => reject(tx.error || new Error("Unable to release the offline referral claim."));
      tx.onabort = () => reject(tx.error || new Error("Unable to release the offline referral claim."));
    });
  } finally {
    db.close();
  }
}

/**
 * Remove a synced record only if the caller still holds its current claim.
 * The token fences out stale workers after a lease expires and is reclaimed.
 */
export async function removeQueuedReferral(clientId, ownerUserId, claimToken) {
  if (!clientId || !ownerUserId || !claimToken) return false;
  const owner = String(ownerUserId);
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      const store = tx.objectStore(STORE_QUEUE);
      const request = store.get(clientId);
      let removed = false;
      request.onsuccess = () => {
        const record = request.result;
        if (isQueueRecordOwnedBy(record, owner)
          && record.sync_claim?.owner_user_id === owner
          && record.sync_claim?.token === String(claimToken)) {
          store.delete(clientId);
          removed = true;
        }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(removed);
      tx.onerror = () => reject(tx.error || new Error("Unable to update the offline queue."));
      tx.onabort = () => reject(tx.error || new Error("Unable to update the offline queue."));
    });
  } finally {
    db.close();
  }
}


/**
 * Validate the public envelope shape before it is persisted. This store must
 * contain only the passphrase-wrapped envelope, never a passphrase or raw key.
 */
export function isValidOfflineVaultEnvelope(envelope, ownerUserId) {
  const owner = String(ownerUserId ?? "").trim();
  const allowedFields = [
    "version", "owner_user_id", "kdf", "hash", "iterations",
    "algorithm", "key_length", "salt", "iv", "wrapped_key",
  ];
  const hasOnlyAllowedFields = envelope
    && typeof envelope === "object"
    && !Array.isArray(envelope)
    && Object.keys(envelope).every((field) => allowedFields.includes(field));
  return Boolean(
    owner
    && hasOnlyAllowedFields
    && envelope.version === 1
    && envelope.owner_user_id === owner
    && envelope.kdf === "PBKDF2"
    && envelope.hash === "SHA-256"
    && envelope.iterations === 600000
    && envelope.algorithm === "AES-GCM"
    && envelope.key_length === 256
    && typeof envelope.salt === "string"
    && /^[0-9a-f]{32}$/i.test(envelope.salt)
    && typeof envelope.iv === "string"
    && /^[0-9a-f]{24}$/i.test(envelope.iv)
    && typeof envelope.wrapped_key === "string"
    && /^[0-9a-f]{96}$/i.test(envelope.wrapped_key)
  );
}

/**
 * Persist only a passphrase-wrapped key envelope, scoped to its account.
 * This does not persist the active CryptoKey or enable encrypted queue use.
 */
export async function saveOfflineKeyVaultEnvelope(envelope, ownerUserId) {
  if (!isValidOfflineVaultEnvelope(envelope, ownerUserId)) {
    throw new Error("A valid offline key vault envelope for this account is required.");
  }
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEY_VAULT, "readwrite");
      tx.objectStore(STORE_KEY_VAULT).add({ ...envelope, owner_user_id: String(ownerUserId) });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Unable to save the offline key vault."));
    });
  } finally {
    db.close();
  }
}

/** Read the wrapped envelope for one authenticated account only. */
export async function getOfflineKeyVaultEnvelope(ownerUserId) {
  if (!ownerUserId) return null;
  const owner = String(ownerUserId);
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEY_VAULT, "readonly");
      const request = tx.objectStore(STORE_KEY_VAULT).get(owner);
      request.onsuccess = () => {
        const envelope = request.result ?? null;
        resolve(isValidOfflineVaultEnvelope(envelope, owner) ? envelope : null);
      };
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error || new Error("Unable to read the offline key vault."));
    });
  } finally {
    db.close();
  }
}

/**
 * Delete only the specified account's wrapped envelope. This deliberately
 * does not delete queued referrals; callers must never use it as logout cleanup.
 */
export async function deleteOfflineKeyVaultEnvelope(ownerUserId) {
  if (!ownerUserId) return false;
  const owner = String(ownerUserId);
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEY_VAULT, "readwrite");
      const store = tx.objectStore(STORE_KEY_VAULT);
      const request = store.get(owner);
      let existed = false;
      request.onsuccess = () => {
        if (request.result?.owner_user_id === owner) {
          store.delete(owner);
          existed = true;
        }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(existed);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Unable to delete the offline key vault."));
    });
  } finally {
    db.close();
  }
}

export async function cacheValue(key, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, "readwrite");
      tx.objectStore(STORE_CACHE).put({ key, value, cached_at: new Date().toISOString() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Unable to update the local cache."));
    });
  } finally {
    db.close();
  }
}

export async function getCachedValue(key, fallback = null) {
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, "readonly");
        const request = tx.objectStore(STORE_CACHE).get(key);
        request.onsuccess = () => resolve(request.result?.value ?? fallback);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return fallback;
  }
}

export async function getQueueCount(ownerUserId) {
  if (!ownerUserId) return 0;
  return (await listQueuedReferrals(ownerUserId)).length;
}

async function syncOwnedQueue(supabaseClient, userId, key) {
  if (!key) return { synced: 0, failed: 0, skipped: true, reason: "vault_locked" };
  await migratePlaintextQueueToEncrypted(userId, key);
  const queued = await listQueuedReferrals(userId);
  let synced = 0;
  let failed = 0;
  for (const storedItem of queued) {
    let claimToken = null;
    let item = storedItem;
    try {
      claimToken = await claimQueuedReferral(storedItem.client_id, userId);
      if (!claimToken) continue;
      if (!isEncryptedQueueRecord(storedItem)) { failed += 1; await releaseQueuedReferralClaim(storedItem.client_id, userId, claimToken); continue; }
      item = await decryptQueuedReferralRecord(storedItem, userId, key);
      if (!isQueueRecordOwnedBy(item, userId) || !isValidQueueOwner(item.payload, userId)) {
        failed += 1;
        await releaseQueuedReferralClaim(storedItem.client_id, userId, claimToken);
        continue;
      }
      const { data: existing, error: lookupError } = await supabaseClient
        .from("referrals")
        .select("id, urgency")
        .eq("offline_client_id", item.client_id)
        .eq("referring_user_id", userId)
        .maybeSingle();
      if (lookupError) throw lookupError;

      let referral = existing;
      let createdByThisAttempt = false;
      if (!referral) {
        const payload = {
          ...item.payload,
          created_at: item.created_at,
          offline_client_id: item.client_id,
          sync_source: "offline",
          referring_user_id: userId,
        };
        const { data: inserted, error: insertError } = await supabaseClient
          .from("referrals")
          .insert(payload)
          .select("id, urgency")
          .single();
        if (insertError) {
          if (insertError.code === "23505") {
            const { data: reconciled, error: reconcileError } = await supabaseClient
              .from("referrals")
              .select("id, urgency")
              .eq("offline_client_id", item.client_id)
              .eq("referring_user_id", userId)
              .maybeSingle();
            if (reconcileError || !reconciled) throw reconcileError || insertError;
            referral = reconciled;
          } else {
            throw insertError;
          }
        } else {
          referral = inserted;
          createdByThisAttempt = true;
        }
      }

      const { data: { user: currentUser }, error: currentUserError } = await supabaseClient.auth.getUser();
      if (currentUserError || !currentUser || String(currentUser.id) !== String(userId)) {
        throw new Error("The authenticated account changed during offline synchronization.");
      }

      if (createdByThisAttempt && referral?.id) {
        try {
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (session?.access_token) {
            await fetch("/api/referral-sms", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ referralId: referral.id, type: "referral_sent" }),
            });
          }
        } catch {
          // Notification delivery has a separate server-side reliability design.
        }
      }
      const removed = await removeQueuedReferral(item.client_id, userId, claimToken);
      if (removed) synced += 1;
      else failed += 1;
    } catch {
      failed += 1;
      try { if (claimToken) await releaseQueuedReferralClaim(storedItem.client_id, userId, claimToken); } catch {
        // An expired/replaced claim must not be cleared by this stale worker.
      }
    }
  }
  return { synced, failed, skipped: false };
}

export async function syncQueuedReferrals(supabaseClient, key = null) {
  if (!key) return { synced: 0, failed: 0, skipped: true, reason: "vault_locked" };
  if (typeof navigator === "undefined" || !navigator.onLine) return { synced: 0, failed: 0, skipped: true };

  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user?.id) return { synced: 0, failed: 0, skipped: true };

  // Serialize duplicate syncs for the same account without allowing one
  // account's in-flight work to suppress another account's queue sync.
  const owner = String(user.id);
  const existing = activeSyncPromises.get(owner);
  if (existing) return existing;

  const syncPromise = syncOwnedQueue(supabaseClient, owner, key);
  activeSyncPromises.set(owner, syncPromise);
  try {
    return await syncPromise;
  } finally {
    if (activeSyncPromises.get(owner) === syncPromise) {
      activeSyncPromises.delete(owner);
    }
  }
}
