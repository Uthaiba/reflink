const ENCRYPTION_VERSION = 1;
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH_BYTES = 12;
const TAG_LENGTH_BITS = 128;
const MAX_CONTEXT_LENGTH = 256;

function getCryptoProvider(cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.subtle || typeof cryptoProvider.getRandomValues !== "function") {
    throw new Error("Web Crypto is unavailable in this environment.");
  }
  return cryptoProvider;
}

function assertRecordContext(ownerUserId, clientId) {
  const owner = String(ownerUserId ?? "").trim();
  const recordId = String(clientId ?? "").trim();

  if (!owner || !recordId || owner.length > MAX_CONTEXT_LENGTH || recordId.length > MAX_CONTEXT_LENGTH) {
    throw new Error("A valid owner and offline referral ID are required for encryption.");
  }

  return { owner, recordId };
}

function assertAesGcmKey(key) {
  const valid = key
    && key.type === "secret"
    && key.algorithm?.name === ALGORITHM
    && key.algorithm?.length === KEY_LENGTH
    && key.extractable === false
    && Array.isArray(key.usages)
    && key.usages.includes("encrypt")
    && key.usages.includes("decrypt");

  if (!valid) {
    throw new Error("A non-extractable AES-256-GCM key with encrypt and decrypt usage is required.");
  }
}

function createAdditionalData(owner, recordId) {
  return new TextEncoder().encode(JSON.stringify([
    "REFLINK",
    "offline-referral",
    ENCRYPTION_VERSION,
    owner,
    recordId,
  ]));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value) {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(value)) {
    throw new Error("The encrypted offline referral contains invalid binary data.");
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Generate an in-memory AES-256-GCM key for the offline queue.
 *
 * The returned CryptoKey is intentionally non-extractable. This helper does
 * not persist or provision the key; an approved device-unlock and recovery
 * design is required before this key can support durable offline storage.
 */
export async function createOfflineQueueCryptoKey(cryptoProvider = globalThis.crypto) {
  const provider = getCryptoProvider(cryptoProvider);
  return provider.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt one referral payload. The owner and client ID are authenticated as
 * additional data so ciphertext cannot be moved to another queue record.
 */
export async function encryptOfflineReferralPayload(
  payload,
  { key, ownerUserId, clientId, cryptoProvider = globalThis.crypto } = {},
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The offline referral payload must be an object.");
  }

  const { owner, recordId } = assertRecordContext(ownerUserId, clientId);
  assertAesGcmKey(key);
  const provider = getCryptoProvider(cryptoProvider);

  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw new Error("The offline referral payload could not be serialized.");
  }
  if (typeof serialized !== "string") {
    throw new Error("The offline referral payload could not be serialized.");
  }

  const iv = provider.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const additionalData = createAdditionalData(owner, recordId);
  const plaintext = new TextEncoder().encode(serialized);
  const encrypted = await provider.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
      additionalData,
      tagLength: TAG_LENGTH_BITS,
    },
    key,
    plaintext,
  );

  return {
    version: ENCRYPTION_VERSION,
    algorithm: ALGORITHM,
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(encrypted)),
  };
}

/**
 * Decrypt a referral payload using the same owner and client ID supplied when
 * it was encrypted. Authentication failures are reported without exposing
 * low-level cryptographic details to the caller.
 */
export async function decryptOfflineReferralPayload(
  envelope,
  { key, ownerUserId, clientId, cryptoProvider = globalThis.crypto } = {},
) {
  if (
    !envelope
    || typeof envelope !== "object"
    || envelope.version !== ENCRYPTION_VERSION
    || envelope.algorithm !== ALGORITHM
  ) {
    throw new Error("The encrypted offline referral uses an unsupported format.");
  }

  const { owner, recordId } = assertRecordContext(ownerUserId, clientId);
  assertAesGcmKey(key);
  const provider = getCryptoProvider(cryptoProvider);
  const iv = hexToBytes(envelope.iv);
  const ciphertext = hexToBytes(envelope.ciphertext);

  if (iv.length !== IV_LENGTH_BYTES || ciphertext.length < TAG_LENGTH_BITS / 8) {
    throw new Error("The encrypted offline referral is incomplete or malformed.");
  }

  try {
    const plaintext = await provider.subtle.decrypt(
      {
        name: ALGORITHM,
        iv,
        additionalData: createAdditionalData(owner, recordId),
        tagLength: TAG_LENGTH_BITS,
      },
      key,
      ciphertext,
    );
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid decrypted payload shape.");
    }
    return payload;
  } catch {
    throw new Error("Unable to decrypt the offline referral. The key, record identity, or stored data may be invalid.");
  }
}
