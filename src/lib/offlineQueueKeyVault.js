const VAULT_VERSION = 1;
const KDF = "PBKDF2";
const HASH = "SHA-256";
const WRAP_ALGORITHM = "AES-GCM";
const WRAP_KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const DATA_KEY_LENGTH = 32;
const TAG_LENGTH_BITS = 128;
const MIN_PASSPHRASE_LENGTH = 12;
const MAX_CONTEXT_LENGTH = 256;

function cryptoProviderOrThrow(provider = globalThis.crypto) {
  if (!provider?.subtle || typeof provider.getRandomValues !== "function") {
    throw new Error("Web Crypto is unavailable in this environment.");
  }
  return provider;
}

function validateOwner(ownerUserId) {
  const owner = String(ownerUserId ?? "").trim();
  if (!owner || owner.length > MAX_CONTEXT_LENGTH) {
    throw new Error("A valid account owner is required for the offline key vault.");
  }
  return owner;
}

function validatePassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error("Use an offline vault passphrase with at least 12 characters.");
  }
  if (passphrase.length > 1024) {
    throw new Error("The offline vault passphrase is too long.");
  }
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value, expectedLength, label) {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(value)) {
    throw new Error("The offline key vault " + label + " is malformed.");
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  if (expectedLength && bytes.length !== expectedLength) {
    throw new Error("The offline key vault " + label + " has an invalid length.");
  }
  return bytes;
}

function vaultAdditionalData(owner) {
  return new TextEncoder().encode(JSON.stringify([
    "REFLINK",
    "offline-key-vault",
    VAULT_VERSION,
    owner,
  ]));
}

async function deriveWrappingKey(passphrase, salt, provider) {
  const material = await provider.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    KDF,
    false,
    ["deriveKey"],
  );
  return provider.subtle.deriveKey(
    {
      name: KDF,
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH,
    },
    material,
    { name: WRAP_ALGORITHM, length: WRAP_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

function validateVaultEnvelope(envelope, owner) {
  if (
    !envelope
    || typeof envelope !== "object"
    || envelope.version !== VAULT_VERSION
    || envelope.kdf !== KDF
    || envelope.hash !== HASH
    || envelope.iterations !== PBKDF2_ITERATIONS
    || envelope.algorithm !== WRAP_ALGORITHM
    || envelope.key_length !== DATA_KEY_LENGTH * 8
    || envelope.owner_user_id !== owner
  ) {
    throw new Error("The offline key vault is invalid or belongs to another account.");
  }
}

/**
 * Create a passphrase-wrapped offline data key.
 *
 * Persist only the returned envelope. Keep the returned non-extractable
 * CryptoKey in memory for the active unlocked session. The passphrase is
 * never returned or persisted by this module.
 */
export async function createOfflineKeyVault(
  { ownerUserId, passphrase, cryptoProvider = globalThis.crypto } = {},
) {
  const owner = validateOwner(ownerUserId);
  validatePassphrase(passphrase);
  const provider = cryptoProviderOrThrow(cryptoProvider);
  const salt = provider.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = provider.getRandomValues(new Uint8Array(IV_LENGTH));
  const rawDataKey = provider.getRandomValues(new Uint8Array(DATA_KEY_LENGTH));

  try {
    const wrappingKey = await deriveWrappingKey(passphrase, salt, provider);
    const dataKey = await provider.subtle.importKey(
      "raw",
      rawDataKey,
      { name: WRAP_ALGORITHM },
      false,
      ["encrypt", "decrypt"],
    );
    const wrapped = await provider.subtle.encrypt(
      {
        name: WRAP_ALGORITHM,
        iv,
        additionalData: vaultAdditionalData(owner),
        tagLength: TAG_LENGTH_BITS,
      },
      wrappingKey,
      rawDataKey,
    );

    return {
      envelope: {
        version: VAULT_VERSION,
        owner_user_id: owner,
        kdf: KDF,
        hash: HASH,
        iterations: PBKDF2_ITERATIONS,
        algorithm: WRAP_ALGORITHM,
        key_length: DATA_KEY_LENGTH * 8,
        salt: toHex(salt),
        iv: toHex(iv),
        wrapped_key: toHex(new Uint8Array(wrapped)),
      },
      key: dataKey,
    };
  } finally {
    rawDataKey.fill(0);
  }
}

/**
 * Unlock a stored vault envelope. Wrong passphrases and modified envelopes
 * fail closed. The returned data key is non-extractable and memory-only.
 */
export async function unlockOfflineKeyVault(
  envelope,
  { ownerUserId, passphrase, cryptoProvider = globalThis.crypto } = {},
) {
  const owner = validateOwner(ownerUserId);
  validatePassphrase(passphrase);
  validateVaultEnvelope(envelope, owner);
  const provider = cryptoProviderOrThrow(cryptoProvider);
  const salt = fromHex(envelope.salt, SALT_LENGTH, "salt");
  const iv = fromHex(envelope.iv, IV_LENGTH, "IV");
  const wrappedKey = fromHex(envelope.wrapped_key, DATA_KEY_LENGTH + TAG_LENGTH_BITS / 8, "wrapped key");
  const wrappingKey = await deriveWrappingKey(passphrase, salt, provider);

  let rawDataKey;
  try {
    rawDataKey = new Uint8Array(await provider.subtle.decrypt(
      {
        name: WRAP_ALGORITHM,
        iv,
        additionalData: vaultAdditionalData(owner),
        tagLength: TAG_LENGTH_BITS,
      },
      wrappingKey,
      wrappedKey,
    ));
    if (rawDataKey.length !== DATA_KEY_LENGTH) {
      throw new Error("Invalid data key length.");
    }
    const key = await provider.subtle.importKey(
      "raw",
      rawDataKey,
      { name: WRAP_ALGORITHM },
      false,
      ["encrypt", "decrypt"],
    );
    return key;
  } catch {
    throw new Error("Unable to unlock the offline key vault. Check the passphrase and account context.");
  } finally {
    rawDataKey?.fill(0);
  }
}

/**
 * Rewrap the same data key with a new passphrase. Existing encrypted referral
 * records remain decryptable with the returned unlocked key; no queue records
 * are modified by this operation.
 */
export async function rotateOfflineKeyVaultPassphrase(
  envelope,
  { ownerUserId, currentPassphrase, newPassphrase, cryptoProvider = globalThis.crypto } = {},
) {
  const owner = validateOwner(ownerUserId);
  validatePassphrase(currentPassphrase);
  validatePassphrase(newPassphrase);
  validateVaultEnvelope(envelope, owner);
  const provider = cryptoProviderOrThrow(cryptoProvider);
  const salt = fromHex(envelope.salt, SALT_LENGTH, "salt");
  const iv = fromHex(envelope.iv, IV_LENGTH, "IV");
  const wrappedKey = fromHex(envelope.wrapped_key, DATA_KEY_LENGTH + TAG_LENGTH_BITS / 8, "wrapped key");
  const currentWrappingKey = await deriveWrappingKey(currentPassphrase, salt, provider);

  let rawDataKey;
  try {
    rawDataKey = new Uint8Array(await provider.subtle.decrypt(
      {
        name: WRAP_ALGORITHM,
        iv,
        additionalData: vaultAdditionalData(owner),
        tagLength: TAG_LENGTH_BITS,
      },
      currentWrappingKey,
      wrappedKey,
    ));
    if (rawDataKey.length !== DATA_KEY_LENGTH) {
      throw new Error("Invalid data key length.");
    }

    const newSalt = provider.getRandomValues(new Uint8Array(SALT_LENGTH));
    const newIv = provider.getRandomValues(new Uint8Array(IV_LENGTH));
    const newWrappingKey = await deriveWrappingKey(newPassphrase, newSalt, provider);
    const newWrapped = await provider.subtle.encrypt(
      {
        name: WRAP_ALGORITHM,
        iv: newIv,
        additionalData: vaultAdditionalData(owner),
        tagLength: TAG_LENGTH_BITS,
      },
      newWrappingKey,
      rawDataKey,
    );
    const key = await provider.subtle.importKey(
      "raw",
      rawDataKey,
      { name: WRAP_ALGORITHM },
      false,
      ["encrypt", "decrypt"],
    );

    return {
      envelope: {
        ...envelope,
        salt: toHex(newSalt),
        iv: toHex(newIv),
        wrapped_key: toHex(new Uint8Array(newWrapped)),
      },
      key,
    };
  } catch {
    throw new Error("Unable to rotate the offline key vault. Check the current passphrase and account context.");
  } finally {
    rawDataKey?.fill(0);
  }
}
