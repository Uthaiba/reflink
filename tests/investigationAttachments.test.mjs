import test from "node:test";
import assert from "node:assert/strict";
import { uploadResumableInvestigation, validateInvestigationFile, validateInvestigationFileContent, createInvestigationFilePath } from "../src/lib/investigationAttachments.js";

const referralId = "11111111-1111-4111-8111-111111111111";
const attachmentId = "22222222-2222-4222-8222-222222222222";
const document = (name, type, bytes) => new File([new Uint8Array(bytes)], name, { type });

test("accepts supported binary headers", async () => {
  for (const [name, type, bytes] of [
    ["report.pdf", "application/pdf", [37,80,68,70,45]],
    ["report.JPG", "image/jpeg", [255,216,255]],
    ["report.png", "image/png", [137,80,78,71,13,10,26,10]],
    ["report.webp", "image/webp", [82,73,70,70,4,0,0,0,87,69,66,80]],
  ]) await validateInvestigationFileContent(document(name, type, bytes));
});

test("rejects empty, oversized and invalid sizes", () => {
  for (const size of [0, -1, NaN, 1.5, 10 * 1024 * 1024 + 1]) {
    assert.throws(() => validateInvestigationFile({ name: "report.pdf", type: "application/pdf", size }));
  }
  assert.equal(validateInvestigationFile({ name: "report.pdf", type: "application/pdf", size: 10 * 1024 * 1024 }), "pdf");
});

test("rejects missing MIME types, unsupported types and mismatched extensions", () => {
  for (const [name, type] of [["report.pdf", ""], ["report.pdf.exe", "application/pdf"], ["report.html", "text/html"], ["report.png", "application/pdf"]]) {
    assert.throws(() => validateInvestigationFile({ name, type, size: 20 }));
  }
});

test("rejects forged or truncated binary headers", async () => {
  for (const [name, type, bytes] of [
    ["report.pdf", "application/pdf", [60,104,116,109,108]],
    ["report.png", "image/png", [137,80,78,71]],
    ["report.jpg", "image/jpeg", [255,216]],
    ["report.webp", "image/webp", [82,73,70,70,0,0,0,0,65,86,73,32]],
  ]) await assert.rejects(validateInvestigationFileContent(document(name, type, bytes)));
});

test("accepts UTF-8 clinical text and CSV including Unicode and line breaks", async () => {
  for (const [name, type] of [["report.txt", "text/plain"], ["report.csv", "text/csv"]]) {
    await validateInvestigationFileContent(new File(["Test,Value\nSynthetic,µmol/L\t12\r\n"], name, { type }));
  }
});

test("rejects binary masquerading as text", async () => {
  for (const bytes of [[65,0,66], [255,254,65], [65,1,66]]) {
    await assert.rejects(validateInvestigationFileContent(document("report.txt", "text/plain", bytes)));
  }
});

test("storage paths exclude original filenames and normalize extensions", () => {
  const file = document("Synthetic patient identifier.JPG", "image/jpeg", [255,216,255]);
  assert.equal(createInvestigationFilePath(referralId, file, () => attachmentId), referralId + "/" + attachmentId + ".jpg");
});

test("rejects malformed or traversing path identifiers", () => {
  const file = document("report.pdf", "application/pdf", [37,80,68,70,45]);
  assert.throws(() => createInvestigationFilePath("../referral", file, () => attachmentId));
  assert.throws(() => createInvestigationFilePath(referralId, file, () => "../file"));
});

test("separate upload identifiers produce distinct immutable paths", () => {
  const file = document("report.pdf", "application/pdf", [37,80,68,70,45]);
  const first = createInvestigationFilePath(referralId, file, () => attachmentId);
  const second = createInvestigationFilePath(referralId, file, () => "33333333-3333-4333-8333-333333333333");
  assert.notEqual(first, second);
});

test("reopening a receiving investigation resumes one upload after a lost response", async () => {
  const objects = new Map();
  let connected = false;
  const bucket = {
    async upload(path, file, options) {
      assert.equal(options.upsert, false);
      if (!objects.has(path)) objects.set(path, file);
      return {error: new Error("Upload response unavailable")};
    },
    async download(path) {
      return connected ? {data:objects.get(path)} : {error:new Error("Disconnected")};
    }
  };
  const selectFile = () => document("synthetic.pdf", "application/pdf", [37,80,68,70,45]);
  const retry = () => uploadResumableInvestigation(bucket, referralId, attachmentId, 0, selectFile());
  await assert.rejects(retry);
  connected = true;
  const path = await retry();
  assert.equal(objects.size, 1);
  assert.equal(await retry(), path);
  objects.set(path, document("different.pdf", "application/pdf", [37,80,68,70,46]));
  await assert.rejects(retry);
});

test("recovers a thrown upload error only after confirming the stored bytes", async () => {
  const file = new File(["fixture"], "report.txt", { type: "text/plain" });
  const lost = new Error("Upload confirmation lost");
  const objects = new Map();
  let readable = false;
  const bucket = {
    async upload(path, selected, options) {
      assert.equal(options.upsert, false);
      if (!objects.has(path)) objects.set(path, selected);
      throw lost;
    },
    async download(path) {
      if (!readable) throw new Error("Read interrupted");
      return {data: objects.get(path)};
    },
  };
  const submit = () => uploadResumableInvestigation(bucket, referralId, attachmentId, 0, file);
  await assert.rejects(submit, error => error === lost);
  readable = true;
  const path = await submit();
  assert.equal(objects.size, 1);
  objects.set(path, new Blob(["changed"]));
  await assert.rejects(submit, error => error === lost);
});
