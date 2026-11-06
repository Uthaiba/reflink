import { test, expect } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:4173/tests/browser/offline-queue.html";

test("encrypted offline referral survives a real browser reload and unlock", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));

  const queued = await page.evaluate(() => window.offlineQueueBrowserTests.createVaultAndQueue());
  expect(queued).toEqual({ queued: 1, owner: "browser-test-account" });

  const stored = await page.evaluate(() => window.offlineQueueBrowserTests.inspectStoredRecords());
  expect(stored).toEqual([{
    clientId: "browser-reload-test",
    owner: "browser-test-account",
    hasPlaintextPayload: false,
    encrypted: true,
    hasCiphertext: true,
  }]);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));
  const restored = await page.evaluate(() => window.offlineQueueBrowserTests.unlockAfterReload());
  expect(restored).toMatchObject({
    count: 1,
    patientName: "Synthetic Browser Test Patient",
    clientId: "browser-reload-test",
  });
});

test("vault rejects an incorrect passphrase after browser reload", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));
  await page.evaluate(() => window.offlineQueueBrowserTests.createVaultAndQueue());
  await page.reload();
  await page.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));

  const error = await page.evaluate(async () => {
    try {
      await window.offlineQueueBrowserTests.unlockAfterReload("Incorrect synthetic passphrase");
      return null;
    } catch (caught) {
      return caught.message;
    }
  });
  expect(error).toContain("Unable to unlock the offline key vault");
});

test("legacy queue migration works in a real browser IndexedDB implementation", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));
  const result = await page.evaluate(() => window.offlineQueueBrowserTests.seedAndMigrateLegacyQueue());
  expect(result).toMatchObject({
    migration: { migrated: 1, skipped: 0, failed: 0 },
    count: 1,
    patientName: "Synthetic Browser Test Patient",
  });
  const stored = await page.evaluate(() => window.offlineQueueBrowserTests.inspectStoredRecords());
  expect(stored).toEqual([{
    clientId: "browser-legacy-test",
    owner: "browser-test-account",
    hasPlaintextPayload: false,
    encrypted: true,
    hasCiphertext: true,
  }]);
});

test("two browser tabs cannot overwrite the same pending offline referral", async ({ page, context }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));
  await page.evaluate(() => window.offlineQueueBrowserTests.createVaultAndQueue());

  const secondTab = await context.newPage();
  await secondTab.goto(BASE_URL);
  await secondTab.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));

  const attemptInTab = () => window.offlineQueueBrowserTests.queueSameIdAfterUnlock("concurrent-duplicate-id")
    .then(
      () => ({ outcome: "saved" }),
      (error) => ({ outcome: error?.name === "ConstraintError" ? "duplicate-rejected" : "error", name: error?.name ?? null, message: error?.message ?? String(error) }),
    );
  const attempts = await Promise.all([
    page.evaluate(attemptInTab),
    secondTab.evaluate(attemptInTab),
  ]);

  expect(attempts.filter((attempt) => attempt.outcome === "error")).toEqual([]);
  expect(attempts.map((attempt) => attempt.outcome).sort()).toEqual(["duplicate-rejected", "saved"]);
  const records = await page.evaluate(() => window.offlineQueueBrowserTests.inspectStoredRecords());
  const duplicates = records.filter((record) => record.clientId === "concurrent-duplicate-id");
  expect(duplicates).toHaveLength(1);
  expect(duplicates[0]).toMatchObject({
    owner: "browser-test-account",
    hasPlaintextPayload: false,
    encrypted: true,
    hasCiphertext: true,
  });
  await secondTab.close();
});

test("real browser queue reads remain isolated between two accounts", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));
  await page.evaluate(() => window.offlineQueueBrowserTests.createVaultAndQueue());

  const counts = await page.evaluate(() => window.offlineQueueBrowserTests.createSecondAccountQueueRecord());
  expect(counts).toEqual({ accountA: 1, accountB: 1 });

  const accountARecords = await page.evaluate(() => window.offlineQueueBrowserTests.unlockAfterReload());
  expect(accountARecords).toMatchObject({
    count: 1,
    patientName: "Synthetic Browser Test Patient",
    clientId: "browser-reload-test",
  });
});

test("offline vault lock events reach only other tabs for the same account", async ({ page, context }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));

  const accountATab = await context.newPage();
  const accountBTab = await context.newPage();
  const secondAccountBTab = await context.newPage();
  for (const tab of [accountATab, accountBTab, secondAccountBTab]) {
    await tab.goto(BASE_URL);
    await tab.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));
  }

  const subscribe = async (targetPage, owner) => targetPage.evaluate(async (accountOwner) => {
    const { createOfflineVaultLockChannel } = await import("/src/lib/offlineVaultLockChannel.js");
    window.__vaultLockCount = 0;
    window.__vaultLockChannel = createOfflineVaultLockChannel(accountOwner, () => {
      window.__vaultLockCount += 1;
    });
  }, owner);

  await subscribe(page, "browser-test-account-a");
  await subscribe(accountATab, "browser-test-account-a");
  await subscribe(accountBTab, "browser-test-account-b");
  await subscribe(secondAccountBTab, "browser-test-account-b");

  await page.evaluate(() => window.__vaultLockChannel.broadcastLock());
  await expect.poll(() => accountATab.evaluate(() => window.__vaultLockCount)).toBe(1);
  expect(await page.evaluate(() => window.__vaultLockCount)).toBe(0);
  expect(await accountBTab.evaluate(() => window.__vaultLockCount)).toBe(0);
  expect(await secondAccountBTab.evaluate(() => window.__vaultLockCount)).toBe(0);

  await accountBTab.evaluate(() => window.__vaultLockChannel.broadcastLock());
  await expect.poll(() => secondAccountBTab.evaluate(() => window.__vaultLockCount)).toBe(1);
  expect(await page.evaluate(() => window.__vaultLockCount)).toBe(0);
  expect(await accountATab.evaluate(() => window.__vaultLockCount)).toBe(1);
  expect(await accountBTab.evaluate(() => window.__vaultLockCount)).toBe(0);

  for (const tab of [page, accountATab, accountBTab, secondAccountBTab]) {
    await tab.evaluate(() => window.__vaultLockChannel.close());
  }
  await accountATab.close();
  await accountBTab.close();
  await secondAccountBTab.close();
});
