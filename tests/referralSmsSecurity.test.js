import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("legacy SMS endpoint minimizes referral projection and verifies committed lifecycle state", async () => {
  const source = await readFile(new URL("../api/referral-sms.js", import.meta.url), "utf8");

  assert.match(source, /referral\.status === "sent"/);
  assert.match(source, /referral\.status === "acknowledged"/);
  assert.match(source, /Boolean\(referral\.acknowledged_at\)/);
  assert.doesNotMatch(source, /patient_identifier|referral_number/);
});

test("legacy SMS endpoint does not expose provider diagnostics or message identifiers", async () => {
  const source = await readFile(new URL("../api/referral-sms.js", import.meta.url), "utf8");

  assert.match(source, /error_message: "SMS provider delivery failed\."/);
  assert.match(source, /error: "SMS notification could not be delivered\."/);
  assert.doesNotMatch(source, /data\?\.message|error\?\.message/);
  assert.match(source, /provider_message_id:\s*result\.sid/);
  assert.doesNotMatch(source, /return json\(res, 200, \{ status: "sent", provider_message_id:/);
  assert.match(source, /return json\(res, 200, \{ status: "sent" \}\)/);
});
