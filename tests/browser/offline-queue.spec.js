import { test, expect } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:4173/tests/browser/offline-queue.html";

test("encrypted offline referral survives a real browser reload and unlock", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => Boolean(window.offlineQueueBrowserTests));

  const queued = await page.evaluate(() => window.offlineQueueBrowserTests.createVaultAndQueue());
  expect(queued).toEqual({ queued: 1, owner: "browser-test-account" });

  const stored = await page.evaluate(() => window.offlineQueueBrowserTests.inspectStoredRecords());
  expect(stored).toEqual([{
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
    hasPlaintextPayload: false,
    encrypted: true,
    hasCiphertext: true,
  }]);
});
