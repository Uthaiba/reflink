import test from "node:test";
import assert from "node:assert/strict";
import {
  createOfflineVaultLockChannel,
  OFFLINE_VAULT_LOCK_CHANNEL,
} from "../src/lib/offlineVaultLockChannel.js";

function installFakeBroadcastChannel() {
  const instances = [];
  class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      this.closed = false;
      instances.push(this);
    }

    postMessage(data) {
      for (const peer of instances) {
        if (peer !== this && peer.name === this.name && !peer.closed) {
          peer.onmessage?.({ data: structuredClone(data) });
        }
      }
    }

    close() {
      this.closed = true;
    }
  }

  const original = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    writable: true,
    value: FakeBroadcastChannel,
  });
  return {
    instances,
    restore() {
      if (original) Object.defineProperty(globalThis, "BroadcastChannel", original);
      else delete globalThis.BroadcastChannel;
    },
  };
}

test("offline vault lock channel routes only valid lock messages to the matching owner", () => {
  const fake = installFakeBroadcastChannel();
  try {
    let accountALocks = 0;
    let accountBLocks = 0;
    const accountA = createOfflineVaultLockChannel("account-a", () => { accountALocks += 1; });
    const accountB = createOfflineVaultLockChannel("account-b", () => { accountBLocks += 1; });

    assert.equal(fake.instances[0].name, OFFLINE_VAULT_LOCK_CHANNEL);
    accountA.broadcastLock("account-b");
    assert.equal(accountALocks, 0);
    assert.equal(accountBLocks, 1);

    accountB.broadcastLock("account-a");
    assert.equal(accountALocks, 1);
    assert.equal(accountBLocks, 1);

    accountA.close();
    accountB.close();
  } finally {
    fake.restore();
  }
});

test("offline vault lock channel ignores malformed, non-lock and non-matching messages", () => {
  const fake = installFakeBroadcastChannel();
  try {
    let locks = 0;
    const subscriber = createOfflineVaultLockChannel("account-a", () => { locks += 1; });
    const sender = new BroadcastChannel(OFFLINE_VAULT_LOCK_CHANNEL);

    sender.postMessage(null);
    sender.postMessage("LOCK");
    sender.postMessage({ type: "UNLOCK", ownerUserId: "account-a" });
    sender.postMessage({ type: "LOCK", ownerUserId: "account-b" });
    sender.postMessage({ type: "LOCK", ownerUserId: 123 });
    assert.equal(locks, 0);

    sender.postMessage({ type: "LOCK", ownerUserId: "account-a", passphrase: "must-not-be-used" });
    assert.equal(locks, 1);

    subscriber.close();
    sender.close();
  } finally {
    fake.restore();
  }
});

test("offline vault lock channel degrades safely without BroadcastChannel and closes subscriptions", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  try {
    delete globalThis.BroadcastChannel;
    const unavailable = createOfflineVaultLockChannel("account-a", () => {
      assert.fail("No callback should run without a channel.");
    });
    assert.equal(unavailable.broadcastLock("account-a"), false);
    assert.doesNotThrow(() => unavailable.close());
  } finally {
    if (original) Object.defineProperty(globalThis, "BroadcastChannel", original);
  }

  const fake = installFakeBroadcastChannel();
  try {
    const subscriber = createOfflineVaultLockChannel("account-a", () => {});
    const channel = fake.instances[0];
    subscriber.close();
    assert.equal(channel.closed, true);
  } finally {
    fake.restore();
  }
});
