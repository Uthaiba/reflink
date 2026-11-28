import test from "node:test";
import assert from "node:assert/strict";
import { inspectInvestigationAttachment } from "../src/lib/investigationAttachmentRecovery.js";

const path = "synthetic-referral/synthetic-attachment.pdf";
const fetchRecords = (records) => async () => ({ data: { investigation_records: records }, error: null });

test("recognizes an attachment saved before a lost confirmation", async () => {
  assert.equal(await inspectInvestigationAttachment(fetchRecords([{ result_file_path: path }]), path), "referenced");
});

test("recognizes legacy JSON-encoded investigation arrays", async () => {
  assert.equal(await inspectInvestigationAttachment(fetchRecords(JSON.stringify([{ result_file_path: path }])), path), "referenced");
});

test("reports only a snapshot when a valid array has no matching reference", async () => {
  for (const records of [[], ["Legacy investigation"], [{ result_file_path: "different-object" }]]) {
    assert.equal(await inspectInvestigationAttachment(fetchRecords(records), path), "unreferenced");
  }
});

test("transport exception during recovery produces an unknown outcome", async () => {
  assert.equal(await inspectInvestigationAttachment(async () => { throw new Error("Synthetic offline failure"); }, path), "unknown");
});

test("database errors and absent responses never imply unreferenced", async () => {
  for (const response of [undefined, null, {}, { data: null }, { data: { investigation_records: [] }, error: { message: "Synthetic denied" } }]) {
    assert.equal(await inspectInvestigationAttachment(async () => response, path), "unknown");
  }
});

test("malformed or missing investigation metadata remains unknown", async () => {
  for (const records of [undefined, null, "", "invalid JSON", "null", "{}", {}, [null], [false], [[]]]) {
    assert.equal(await inspectInvestigationAttachment(fetchRecords(records), path), "unknown");
  }
});

test("an explicit matching reference is preserved even with other malformed entries", async () => {
  assert.equal(await inspectInvestigationAttachment(fetchRecords([null, { result_file_path: path }]), path), "referenced");
});

test("an invalid object path does not issue a database read", async () => {
  let reads = 0;
  const fetchReferral = async () => { reads++; return { data: { investigation_records: [] } }; };
  for (const invalid of [undefined, null, ""]) {
    assert.equal(await inspectInvestigationAttachment(fetchReferral, invalid), "unknown");
  }
  assert.equal(reads, 0);
});
