import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { initialInvestigationRecords, saveInvestigation, uploadInitialInvestigationFiles } from "../src/lib/investigationUpdates.js";

const referralId = randomUUID();
const operationId = randomUUID();
const expected = [{ investigation: "Synthetic investigation", result_status: "pending" }];

test("initial records exclude unconfirmed file descriptors while preserving clinical data", () => {
  const selected = [{ ...expected[0], result_file: {}, result_file_path: "", result_file_name: "synthetic.pdf", result_file_type: "application/pdf", result_file_size: 5 }];
  assert.deepEqual(initialInvestigationRecords(selected), expected);
  assert.equal(selected[0].result_file_name, "synthetic.pdf");
});

test("clinical snapshots are sent in the RPC body, never URL filters", async () => {
  let request;
  const client = createClient("https://synthetic.example.test", randomUUID(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      request = { url: String(url), body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ status: "saved", investigation_records: expected }), { headers: { "Content-Type": "application/json" } });
    } },
  });
  await saveInvestigation(client, referralId, expected, 0, { result_value: "Synthetic detail" }, operationId);
  assert.equal(request.url, "https://synthetic.example.test/rest/v1/rpc/save_referral_investigation");
  assert.deepEqual(request.body.p_expected_records, expected);
  assert.equal(request.body.p_operation_id, operationId);
  assert.ok(!request.url.includes("Synthetic"));
});

test("conflicts, errors and malformed responses are never reported as successful saves", async () => {
  for (const response of [
    { data: { status: "conflict" }, error: null }, { data: null, error: {} },
    { data: { status: "saved" }, error: null }, { data: {}, error: null },
  ]) {
    await assert.rejects(saveInvestigation({ rpc: async () => response }, referralId, expected, 0, {}, operationId));
  }
});

test("an idempotency replay returns the authorized current snapshot without another client write", async () => {
  const client = { rpc: async () => ({ data: { status: "replayed", investigation_records: expected }, error: null }) };
  assert.equal((await saveInvestigation(client, referralId, expected, 0, {}, operationId)).status, "replayed");
});

test("disabled attachment service performs no storage or RPC requests", async () => {
  await assert.rejects(uploadInitialInvestigationFiles({}, referralId,
    [{ result_file: {} }], expected, false), /SERVICE_UNAVAILABLE/);
});

test("referrals without files require no attachment backend", async () => {
  assert.equal(await uploadInitialInvestigationFiles({}, referralId, expected, expected, false), expected);
});

test("files are registered sequentially and every next call uses the last confirmed snapshot", async () => {
  const file = new File([new Uint8Array([37,80,68,70,45])], "synthetic.pdf", { type: "application/pdf" });
  const selected = [{ ...expected[0], result_file: file }, { ...expected[0], result_file: file }];
  let records = initialInvestigationRecords(selected);
  let registrations = 0;
  const client = {
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    rpc: async (_, args) => {
      assert.deepEqual(args.p_expected_records, records);
      records = records.map((item, index) => index === args.p_index ? { ...item, ...args.p_patch } : item);
      registrations++;
      return { data: { status: "saved", investigation_records: records }, error: null };
    },
  };
  const saved = await uploadInitialInvestigationFiles(client, referralId, selected, records, true, randomUUID);
  assert.equal(registrations, 2);
  assert.equal(saved.filter((record) => record.result_file_path).length, 2);
});
