const DATABASE_NAME = "reflink-encrypted-offline-drafts";
const DATABASE_VERSION = 1;
const KEY_STORE = "vault";
const DRAFT_STORE = "drafts";
const KDF_ITERATIONS = 310000;
const VAULT_MARKER = "REFLINK_OFFLINE_DRAFT_VAULT_V1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function assertBrowserCrypto() {
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle || !globalThis.indexedDB) {
    throw new Error("Encrypted offline drafts require a secure HTTPS browser with Web Crypto and IndexedDB support.");
  }
}

function openDatabase() {
  assertBrowserCrypto();
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE)) {
        database.createObjectStore(KEY_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open encrypted local storage."));
    request.onblocked = () => reject(new Error("Encrypted local storage is busy in another browser tab. Close the other REFLINK tab and retry."));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Local storage request failed."));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Local storage transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Local storage transaction was aborted."));
  });
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function fromBase64(value) {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveEncryptionKey(passphrase, salt, iterations = KDF_ITERATIONS) {
  const material = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJson(key, id, value) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(`reflink-offline-draft:${id}`);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    encoder.encode(JSON.stringify(value))
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptJson(key, id, record) {
  const additionalData = encoder.encode(`reflink-offline-draft:${id}`);
  const plaintext = await globalThis.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(record.iv),
      additionalData,
    },
    key,
    fromBase64(record.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext));
}

export async function offlineVaultExists() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(KEY_STORE, "readonly");
    const result = await requestValue(transaction.objectStore(KEY_STORE).get("vault"));
    await transactionComplete(transaction);
    return Boolean(result);
  } finally {
    database.close();
  }
}

export async function createOrUnlockOfflineVault(passphrase) {
  assertBrowserCrypto();
  if (typeof passphrase !== "string" || passphrase.length < 12) {
    throw new Error("Use a local vault passphrase of at least 12 characters.");
  }

  const database = await openDatabase();
  try {
    const readTransaction = database.transaction(KEY_STORE, "readonly");
    const metadata = await requestValue(readTransaction.objectStore(KEY_STORE).get("vault"));
    await transactionComplete(readTransaction);

    if (!metadata) {
      const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveEncryptionKey(passphrase, salt);
      const verifier = await encryptJson(key, "vault-verifier", { marker: VAULT_MARKER });
      const writeTransaction = database.transaction(KEY_STORE, "readwrite");
      writeTransaction.objectStore(KEY_STORE).put({
        id: "vault",
        version: 1,
        salt: toBase64(salt),
        iterations: KDF_ITERATIONS,
        verifierIv: verifier.iv,
        verifierCiphertext: verifier.ciphertext,
        createdAt: new Date().toISOString(),
      });
      await transactionComplete(writeTransaction);
      return { key, created: true };
    }

    if (metadata.version !== 1 || !metadata.salt || !metadata.verifierIv || !metadata.verifierCiphertext) {
      throw new Error("This local vault version is not supported by this REFLINK build.");
    }

    const key = await deriveEncryptionKey(
      passphrase,
      fromBase64(metadata.salt),
      metadata.iterations || KDF_ITERATIONS
    );

    try {
      const verifier = await decryptJson(key, "vault-verifier", {
        iv: metadata.verifierIv,
        ciphertext: metadata.verifierCiphertext,
      });
      if (verifier?.marker !== VAULT_MARKER) throw new Error("Invalid vault marker.");
    } catch {
      throw new Error("The local vault passphrase is incorrect. Your encrypted drafts have not been changed.");
    }

    return { key, created: false };
  } finally {
    database.close();
  }
}

export async function saveEncryptedOfflineDraft(key, ownerUserId, draft) {
  if (!key || !ownerUserId || !draft) throw new Error("Unlock the local vault and sign in before saving a draft.");
  const database = await openDatabase();
  try {
    const id = globalThis.crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const encrypted = await encryptJson(key, id, {
      version: 1,
      ownerUserId,
      createdAt,
      draft,
    });
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).add({
      id,
      createdAt,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
    });
    await transactionComplete(transaction);
    return { id, createdAt };
  } finally {
    database.close();
  }
}

export async function listEncryptedOfflineDrafts(key, ownerUserId) {
  if (!key || !ownerUserId) return [];
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRAFT_STORE, "readonly");
    const records = await requestValue(transaction.objectStore(DRAFT_STORE).getAll());
    await transactionComplete(transaction);

    const drafts = [];
    for (const record of records) {
      const payload = await decryptJson(key, record.id, record);
      if (payload?.ownerUserId !== ownerUserId || payload?.version !== 1) continue;
      drafts.push({
        id: record.id,
        createdAt: record.createdAt,
        draft: payload.draft,
      });
    }
    return drafts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } finally {
    database.close();
  }
}

export async function deleteEncryptedOfflineDraft(id) {
  if (!id) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).delete(id);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
