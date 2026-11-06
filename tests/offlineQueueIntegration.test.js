import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const queueSource = await readFile(new URL("../src/lib/offlineReferralQueue.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const threatModel = await readFile(new URL("../docs/OFFLINE_PHI_THREAT_MODEL.md", import.meta.url), "utf8");

test("application offline submission uses encrypted queue writes without plaintext fallback", () => {
  assert.match(appSource, /queueEncryptedReferral\(offlinePayload, session\.user\.id, offlineVaultKey\)/);
  assert.doesNotMatch(appSource, /\bqueueReferral\s*,/);
});

test("background queue sync fails closed without an unlocked key", () => {
  assert.match(queueSource, /if \(!key\) return \{ synced: 0, failed: 0, skipped: true, reason: "vault_locked" \}/);
  assert.match(queueSource, /if \(!isEncryptedQueueRecord\(storedItem\)\) \{ failed \+= 1; continue; \}/);
});

test("plaintext migration compares the source record before atomic replacement", () => {
  assert.match(queueSource, /JSON\.stringify\(current\.payload\) === originalPayload/);
  assert.match(queueSource, /delete next\.payload/);
  assert.match(queueSource, /migratePlaintextQueueToEncrypted/);
});

test("vault is locked on sign-out and manual lock is broadcast to other tabs", () => {
  assert.match(appSource, /setOfflineVaultKey\(null\)/);
  assert.match(appSource, /postMessage\(\{ type: "LOCK", ownerUserId: offlineVaultOwner \}\)/);
  assert.match(appSource, /new BroadcastChannel\("reflink-offline-vault"\)/);
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
