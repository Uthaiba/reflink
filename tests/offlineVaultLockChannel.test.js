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
      this.sentMessages.push(structuredClone(data));
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

test("offline vault lock channel routes lock messages only to matching account tabs", () => {
  const fake = installFakeBroadcastChannel();
  try {
    let accountASecondTabLocks = 0;
    let accountBSecondTabLocks = 0;
    const accountAFirstTab = createOfflineVaultLockChannel("account-a", () => {});
    const accountASecondTab = createOfflineVaultLockChannel("account-a", () => { accountASecondTabLocks += 1; });
    const accountBFirstTab = createOfflineVaultLockChannel("account-b", () => {});
    const accountBSecondTab = createOfflineVaultLockChannel("account-b", () => { accountBSecondTabLocks += 1; });

    assert.equal(fake.instances[0].name, OFFLINE_VAULT_LOCK_CHANNEL);
    accountAFirstTab.broadcastLock();
    assert.equal(accountASecondTabLocks, 1);
    assert.equal(accountBSecondTabLocks, 0);
    assert.deepEqual(fake.instances[0].sentMessages[0], {
      type: "LOCK",
      ownerUserId: "account-a",
    });

    accountBFirstTab.broadcastLock();
    assert.equal(accountASecondTabLocks, 1);
    assert.equal(accountBSecondTabLocks, 1);
    assert.deepEqual(fake.instances[2].sentMessages[0], {
      type: "LOCK",
      ownerUserId: "account-b",
    });

    for (const channel of [accountAFirstTab, accountASecondTab, accountBFirstTab, accountBSecondTab]) {
      channel.close();
    }
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
    assert.equal(unavailable.broadcastLock(), false);
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
