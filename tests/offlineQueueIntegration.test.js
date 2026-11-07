import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const queueSource = await readFile(new URL("../src/lib/offlineReferralQueue.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const vaultLockSource = await readFile(new URL("../src/lib/offlineVaultLockChannel.js", import.meta.url), "utf8");
const threatModel = await readFile(new URL("../docs/OFFLINE_PHI_THREAT_MODEL.md", import.meta.url), "utf8");

test("application offline submission uses encrypted queue writes without plaintext fallback", () => {
  assert.match(appSource, /queueEncryptedReferral\(offlinePayload, session\.user\.id, offlineVaultKey\)/);
  assert.doesNotMatch(appSource, /\bqueueReferral\s*,/);
});

test("background queue sync fails closed without an unlocked key", () => {
  assert.match(queueSource, /if \(!key\) return \{ synced: 0, failed: 0, skipped: true, reason: "vault_locked" \}/);
  assert.match(queueSource, /if \(!isEncryptedQueueRecord\(storedItem\)\) \{ failed \+= 1; await releaseQueuedReferralClaim\(storedItem\.client_id, userId, claimToken\); continue; \}/);
});

test("plaintext migration compares the source record before atomic replacement", () => {
  assert.match(queueSource, /JSON\.stringify\(current\.payload\) === originalPayload/);
  assert.match(queueSource, /delete next\.payload/);
  assert.match(queueSource, /migratePlaintextQueueToEncrypted/);
});

test("vault is locked on sign-out and manual lock uses the account-scoped cross-tab channel", () => {
  assert.match(appSource, /setOfflineVaultKey\(null\)/);
  assert.match(appSource, /createOfflineVaultLockChannel\(offlineVaultOwner/);
  assert.match(appSource, /broadcastLock\(\)/);
  assert.match(vaultLockSource, /new BroadcastChannel\(OFFLINE_VAULT_LOCK_CHANNEL\)/);
  assert.match(vaultLockSource, /message\.ownerUserId !== owner/);
  assert.match(vaultLockSource, /type: "LOCK"/);
});

test("documentation does not claim full production readiness", () => {
  assert.match(threatModel, /no recovery\/reset workflow/i);
  assert.match(threatModel, /Browser-level IndexedDB tests .* not yet implemented/i);
});

test("the referral form owns the pending referral until its matching account vault unlocks", () => {
  assert.match(appSource, /function NewReferralForm\(\{ onBack, offlineVaultKey, offlineVaultOwner, onRequestVault \}\)/);
  assert.match(appSource, /setPendingOfflineReferral\(offlinePayload\)/);
  assert.match(appSource, /onRequestVault\?\.\(\)/);
  assert.match(appSource, /String\(pendingOfflineReferral\.referring_user_id\) !== String\(offlineVaultOwner\)/);
});

test("legacy queue API is encryption-only and cannot write plaintext", () => {
  const legacyApi = queueSource.match(/export async function queueReferral\([\s\S]*?\n\}/)?.[0] || "";
  assert.match(legacyApi, /return queueEncryptedReferral\(payload, ownerUserId, key\)/);
  assert.doesNotMatch(legacyApi, /openDb\(|payload:\s*\{\s*\.\.\.payload\s*\}/);
});

test("encrypted queue writes use insert semantics rather than overwriting an existing client ID", () => {
  const encryptedWriter = queueSource.match(/export async function queueEncryptedReferral\([\s\S]*?\n\}/)?.[0] || "";
  assert.match(encryptedWriter, /objectStore\(STORE_QUEUE\)\.add\(record\)/);
  assert.doesNotMatch(encryptedWriter, /objectStore\(STORE_QUEUE\)\.put\(record\)/);
});

test("decrypted listing refuses legacy plaintext records instead of returning them", () => {
  const listing = queueSource.match(/export async function listDecryptedQueuedReferrals\([\s\S]*?\n\}/)?.[0] || "";
  assert.match(listing, /if \(!isEncryptedQueueRecord\(record\)\)/);
  assert.match(listing, /must be encrypted before it can be read/);
  assert.doesNotMatch(listing, /results\.push\(record\)/);
});

test("auth changes use the latest vault owner and unlock revalidates after migration", () => {
  assert.match(appSource, /const offlineVaultOwnerRef = useRef\(null\)/);
  assert.match(appSource, /offlineVaultOwnerRef\.current = offlineVaultOwner/);
  assert.match(appSource, /const activeVaultOwner = offlineVaultOwnerRef\.current/);

  const migrationIndex = appSource.indexOf("const migration = await migratePlaintextQueueToEncrypted(ownerUserId, key)");
  const postMigrationCheckIndex = appSource.indexOf("const { data: { user: verifiedUser }, error: verificationError } = await supabase.auth.getUser()", migrationIndex);
  const keyActivationIndex = appSource.indexOf("setOfflineVaultKey(key)", migrationIndex);
  assert.ok(migrationIndex >= 0, "vault migration step must exist");
  assert.ok(postMigrationCheckIndex > migrationIndex, "auth must be rechecked after migration");
  assert.ok(keyActivationIndex > postMigrationCheckIndex, "key must not become active before post-migration auth verification");
  assert.match(appSource, /String\(verifiedUser\.id\) !== String\(ownerUserId\)/);
});

test("sign-out and account replacement broadcast a vault lock before clearing local key state", () => {
  const signedInStart = appSource.indexOf('if (event === "SIGNED_IN" && session?.user)');
  const signedOutStart = appSource.indexOf('if (event === "SIGNED_OUT")', signedInStart);
  assert.ok(signedInStart >= 0 && signedOutStart > signedInStart, "auth lifecycle handlers must exist");

  const signedInHandler = appSource.slice(signedInStart, signedOutStart);
  assert.match(signedInHandler, /if \(activeVaultOwner && String\(activeVaultOwner\) !== String\(session\.user\.id\)\) \{\s*offlineVaultChannelRef\.current\?\.broadcastLock\(\);\s*setOfflineVaultKey\(null\);/);

  const signedOutEnd = appSource.indexOf("\n      }", signedOutStart);
  const signedOutHandler = appSource.slice(signedOutStart, signedOutEnd > signedOutStart ? signedOutEnd : signedOutStart + 900);
  assert.match(signedOutHandler, /if \(offlineVaultOwnerRef\.current\) offlineVaultChannelRef\.current\?\.broadcastLock\(\);\s*setOfflineVaultKey\(null\);/);
});

test("concurrent referral sync sends the SMS only for the attempt that inserted the referral", () => {
  assert.match(queueSource, /let createdByThisAttempt = false/);
  assert.match(queueSource, /referral = inserted;\s*createdByThisAttempt = true;/);
  assert.match(queueSource, /if \(createdByThisAttempt && referral\?\.id\)/);
  assert.doesNotMatch(queueSource, /if \(!existing && referral\?\.id\)/);
});


test("cross-tab sync claims use owner-scoped atomic IndexedDB transactions and fencing tokens", () => {
  assert.match(queueSource, /export async function claimQueuedReferral\(/);
  assert.match(queueSource, /db\.transaction\(STORE_QUEUE, "readwrite"\)/);
  assert.match(queueSource, /sync_claim:\s*\{/);
  assert.match(queueSource, /expires_at:\s*now \+ leaseMs/);
  assert.match(queueSource, /export async function releaseQueuedReferralClaim\(/);
  assert.match(queueSource, /record\.sync_claim\?\.token === String\(claimToken\)/);
  assert.match(queueSource, /export async function removeQueuedReferral\(clientId, ownerUserId, claimToken\)/);
  assert.match(queueSource, /claimToken = await claimQueuedReferral\(storedItem\.client_id, userId\)/);
  assert.match(queueSource, /removeQueuedReferral\(item\.client_id, userId, claimToken\)/);
  assert.match(queueSource, /releaseQueuedReferralClaim\(storedItem\.client_id, userId, claimToken\)/);
});

test("invalid decrypted queue ownership releases its claim before continuing", () => {
  const validationIndex = queueSource.indexOf("if (!isQueueRecordOwnedBy(item, userId) || !isValidQueueOwner(item.payload, userId))");
  const releaseIndex = queueSource.indexOf("await releaseQueuedReferralClaim(storedItem.client_id, userId, claimToken)", validationIndex);
  const continueIndex = queueSource.indexOf("continue;", validationIndex);
  assert.ok(validationIndex >= 0, "decrypted record ownership must be checked");
  assert.ok(releaseIndex > validationIndex, "the active claim must be released after validation failure");
  assert.ok(continueIndex > releaseIndex, "the worker must release before continuing");
});


test("vault lock channel degrades safely when browser construction is unavailable", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  try {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: class { constructor() { throw new Error("blocked by browser policy"); } },
    });
    const { createOfflineVaultLockChannel } = await import("../src/lib/offlineVaultLockChannel.js");
    const channel = createOfflineVaultLockChannel("account-a", () => {});
    assert.equal(channel.broadcastLock(), false);
    assert.doesNotThrow(() => channel.close());
  } finally {
    if (original) Object.defineProperty(globalThis, "BroadcastChannel", original);
    else delete globalThis.BroadcastChannel;
  }
});

test("vault lock channel handles post failures and repeated close without throwing", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  let closeCount = 0;
  try {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: class {
        postMessage() { throw new Error("channel is unavailable"); }
        close() { closeCount += 1; }
      },
    });
    const { createOfflineVaultLockChannel } = await import("../src/lib/offlineVaultLockChannel.js");
    const channel = createOfflineVaultLockChannel("account-a", () => {});
    assert.equal(channel.broadcastLock(), false);
    channel.close();
    channel.close();
    assert.equal(closeCount, 1);
    assert.equal(channel.broadcastLock(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "BroadcastChannel", original);
    else delete globalThis.BroadcastChannel;
  }
});


test("vault lock messages are account-scoped and ignore malformed or unrelated events", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  const instances = [];
  let lockCount = 0;
  try {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: class {
        constructor(name) {
          this.name = name;
          this.sent = [];
          instances.push(this);
        }
        postMessage(message) { this.sent.push(message); }
        close() {}
      },
    });
    const { createOfflineVaultLockChannel } = await import("../src/lib/offlineVaultLockChannel.js");
    const accountA = createOfflineVaultLockChannel("account-a", () => { lockCount += 1; });
    const accountB = createOfflineVaultLockChannel("account-b", () => { lockCount += 1; });

    instances[0].onmessage({ data: { type: "LOCK", ownerUserId: "account-b" } });
    instances[0].onmessage({ data: { type: "UNLOCK", ownerUserId: "account-a" } });
    instances[0].onmessage({ data: ["LOCK", "account-a"] });
    assert.equal(lockCount, 0);

    instances[0].onmessage({ data: { type: "LOCK", ownerUserId: "account-a" } });
    assert.equal(lockCount, 1);

    assert.equal(accountA.broadcastLock(), true);
    assert.deepEqual(instances[0].sent, [{ type: "LOCK", ownerUserId: "account-a" }]);
    assert.equal(accountB.broadcastLock(), true);
    assert.deepEqual(instances[1].sent, [{ type: "LOCK", ownerUserId: "account-b" }]);
    accountA.close();
    accountB.close();
  } finally {
    if (original) Object.defineProperty(globalThis, "BroadcastChannel", original);
    else delete globalThis.BroadcastChannel;
  }
});


test("offline sync serialization is scoped per authenticated account", () => {
  assert.match(queueSource, /const activeSyncPromises = new Map\(\)/);
  assert.match(queueSource, /const owner = String\(user\.id\)/);
  assert.match(queueSource, /activeSyncPromises\.get\(owner\)/);
  assert.match(queueSource, /activeSyncPromises\.set\(owner, syncPromise\)/);
  assert.match(queueSource, /activeSyncPromises\.delete\(owner\)/);
  assert.doesNotMatch(queueSource, /let activeSyncPromise = null/);
});
