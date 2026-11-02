const DB_NAME = "reflink-offline";
const DB_VERSION = 1;
const STORE_QUEUE = "referral_queue";
const STORE_CACHE = "cache";

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported by this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: "client_id" });
        store.createIndex("created_at", "created_at");
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createClientId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function queueReferral(payload) {
  const db = await openDb();
  const record = {
    client_id: payload.offline_client_id || createClientId(),
    created_at: payload.created_at || new Date().toISOString(),
    payload: { ...payload },
    sync_status: "pending",
    queued_at: new Date().toISOString(),
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    tx.objectStore(STORE_QUEUE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function listQueuedReferrals() {
  const db = await openDb();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readonly");
    const request = tx.objectStore(STORE_QUEUE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export async function removeQueuedReferral(clientId) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    tx.objectStore(STORE_QUEUE).delete(clientId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function cacheValue(key, value) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    tx.objectStore(STORE_CACHE).put({ key, value, cached_at: new Date().toISOString() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getCachedValue(key, fallback = null) {
  try {
    const db = await openDb();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, "readonly");
      const request = tx.objectStore(STORE_CACHE).get(key);
      request.onsuccess = () => resolve(request.result?.value ?? fallback);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  } catch {
    return fallback;
  }
}

export async function getQueueCount() {
  const records = await listQueuedReferrals();
  return records.length;
}

export async function syncQueuedReferrals(supabaseClient) {
  if (!navigator.onLine) return { synced: 0, failed: 0, skipped: true };
  const queued = await listQueuedReferrals();
  let synced = 0;
  let failed = 0;

  for (const item of queued) {
    try {
      const payload = {
        ...item.payload,
        created_at: item.created_at,
        offline_client_id: item.client_id,
        sync_source: "offline",
      };
      const { data: inserted, error } = await supabaseClient.from("referrals").insert(payload).select("id, urgency").single();
      if (error) throw error;
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.access_token && inserted?.id) {
          await fetch("/api/referral-sms", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ referralId: inserted.id, type: "referral_sent" }),
          });
        }
      } catch (smsError) {
        console.warn("REFLINK offline-sync SMS skipped", smsError);
      }
      await removeQueuedReferral(item.client_id);
      synced += 1;
    } catch (error) {
      console.warn("REFLINK OFFLINE SYNC FAILED", item.client_id, error);
      failed += 1;
    }
  }

  return { synced, failed, skipped: false };
}
