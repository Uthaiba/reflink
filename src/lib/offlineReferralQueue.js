const DB_NAME = "reflink-offline";
const DB_VERSION = 2;
const STORE_QUEUE = "referral_queue";
const STORE_CACHE = "cache";

let activeSyncPromise = null;

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

export async function queueReferral(payload, ownerUserId) {
  if (!isValidQueueOwner(payload, ownerUserId)) {
    throw new Error("The offline referral must belong to the currently authenticated user.");
  }
  const db = await openDb();
  const record = {
    client_id: payload.offline_client_id || createClientId(),
    owner_user_id: String(ownerUserId),
    created_at: payload.created_at || new Date().toISOString(),
    payload: { ...payload },
    sync_status: "pending",
    queued_at: new Date().toISOString(),
  };
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      tx.objectStore(STORE_QUEUE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Unable to save the offline referral."));
    });
  } finally {
    db.close();
  }
  return record;
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

export async function removeQueuedReferral(clientId, ownerUserId) {
  if (!clientId || !ownerUserId) return false;
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      const store = tx.objectStore(STORE_QUEUE);
      const request = store.get(clientId);
      let removed = false;
      request.onsuccess = () => {
        if (isQueueRecordOwnedBy(request.result, ownerUserId)) {
          store.delete(clientId);
          removed = true;
        }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(removed);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Unable to update the offline queue."));
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

async function syncOwnedQueue(supabaseClient, userId) {
  const queued = await listQueuedReferrals(userId);
  let synced = 0;
  let failed = 0;
  for (const item of queued) {
    if (!isQueueRecordOwnedBy(item, userId) || !isValidQueueOwner(item.payload, userId)) {
      failed += 1;
      continue;
    }
    try {
      const { data: existing, error: lookupError } = await supabaseClient
        .from("referrals")
        .select("id, urgency")
        .eq("offline_client_id", item.client_id)
        .eq("referring_user_id", userId)
        .maybeSingle();
      if (lookupError) throw lookupError;

      let referral = existing;
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
        }
      }

      const { data: { user: currentUser }, error: currentUserError } = await supabaseClient.auth.getUser();
      if (currentUserError || !currentUser || String(currentUser.id) !== String(userId)) {
        throw new Error("The authenticated account changed during offline synchronization.");
      }

      if (!existing && referral?.id) {
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
      await removeQueuedReferral(item.client_id, userId);
      synced += 1;
    } catch {
      failed += 1;
    }
  }
  return { synced, failed, skipped: false };
}

export async function syncQueuedReferrals(supabaseClient) {
  if (typeof navigator === "undefined" || !navigator.onLine) return { synced: 0, failed: 0, skipped: true };
  if (activeSyncPromise) return activeSyncPromise;
  activeSyncPromise = (async () => {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user?.id) return { synced: 0, failed: 0, skipped: true };
    return syncOwnedQueue(supabaseClient, user.id);
  })();
  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}
