export const OFFLINE_VAULT_LOCK_CHANNEL = "reflink-offline-vault";

/**
 * Coordinates account-scoped vault locks between same-origin tabs.
 * Only the lock event and account identifier are broadcast; keys, passphrases,
 * referral content, and patient information must never be sent through this channel.
 *
 * Browser privacy settings can disable BroadcastChannel or make construction and
 * messaging fail. In those environments this helper degrades to a no-op instead
 * of breaking authentication or vault lifecycle handling.
 */
export function createOfflineVaultLockChannel(ownerUserId, onLock) {
  const owner = ownerUserId == null ? "" : String(ownerUserId);
  if (!owner || typeof BroadcastChannel === "undefined") {
    return {
      broadcastLock: () => false,
      close: () => {},
    };
  }

  let channel;
  try {
    channel = new BroadcastChannel(OFFLINE_VAULT_LOCK_CHANNEL);
  } catch {
    return {
      broadcastLock: () => false,
      close: () => {},
    };
  }

  let closed = false;
  channel.onmessage = (event) => {
    const message = event?.data;
    if (!message || typeof message !== "object" || Array.isArray(message)) return;
    if (message.type !== "LOCK" || typeof message.ownerUserId !== "string") return;
    if (message.ownerUserId !== owner || typeof onLock !== "function") return;
    try {
      onLock();
    } catch {
      // A consumer callback must not destabilize the browser message event loop.
    }
  };

  return {
    broadcastLock() {
      if (closed) return false;
      try {
        channel.postMessage({ type: "LOCK", ownerUserId: owner });
        return true;
      } catch {
        return false;
      }
    },
    close() {
      if (closed) return;
      closed = true;
      channel.onmessage = null;
      try {
        channel.close();
      } catch {
        // Closing is best-effort; the channel is no longer used by this handle.
      }
    },
  };
}
