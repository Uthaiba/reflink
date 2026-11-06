export const OFFLINE_VAULT_LOCK_CHANNEL = "reflink-offline-vault";

/**
 * Coordinates account-scoped vault locks between same-origin tabs.
 * Only the lock event and account identifier are broadcast; keys, passphrases,
 * referral content, and patient information must never be sent through this channel.
 */
export function createOfflineVaultLockChannel(ownerUserId, onLock) {
  const owner = ownerUserId == null ? "" : String(ownerUserId);
  if (!owner || typeof BroadcastChannel === "undefined") {
    return {
      broadcastLock: () => false,
      close: () => {},
    };
  }

  const channel = new BroadcastChannel(OFFLINE_VAULT_LOCK_CHANNEL);
  channel.onmessage = (event) => {
    const message = event?.data;
    if (!message || typeof message !== "object" || Array.isArray(message)) return;
    if (message.type !== "LOCK" || typeof message.ownerUserId !== "string") return;
    if (message.ownerUserId !== owner) return;
    if (typeof onLock === "function") onLock();
  };

  return {
    broadcastLock(targetOwnerUserId = owner) {
      if (targetOwnerUserId == null || String(targetOwnerUserId).length === 0) return false;
      channel.postMessage({
        type: "LOCK",
        ownerUserId: String(targetOwnerUserId),
      });
      return true;
    },
    close() {
      channel.close();
    },
  };
}
