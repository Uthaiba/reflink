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

  const attempts = await Promise.all([
    page.evaluate(() => window.offlineQueueBrowserTests.queueSameIdAfterUnlock("concurrent-duplicate-id")),
    secondTab.evaluate(() => window.offlineQueueBrowserTests.queueSameIdAfterUnlock("concurrent-duplicate-id")),
  ].map((promise) => promise.then(
    () => "saved",
    (error) => error.name === "ConstraintError" ? "duplicate-rejected" : Promise.reject(error),
  )));

  expect(attempts.sort()).toEqual(["duplicate-rejected", "saved"]);
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
