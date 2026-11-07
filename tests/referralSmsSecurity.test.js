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

test("legacy SMS dispatch binds each event to the required role and facility before provider access", async () => {
  const source = await readFile(new URL("../api/referral-sms.js", import.meta.url), "utf8");
  const sentBranch = source.slice(
    source.indexOf('if (type === "referral_sent")'),
    source.indexOf('if (type === "referral_sent" && String(referral.urgency'),
  );
  const acknowledgedBranch = source.slice(
    source.indexOf("} else {", source.indexOf('if (type === "referral_sent")')),
    source.indexOf("if (type === \"referral_sent\" && String(referral.urgency"),
  );

  assert.match(sentBranch, /referral\.referring_user_id === actorId/);
  assert.match(sentBranch, /profile\?\.role === "phc_staff"/);
  assert.match(sentBranch, /profile\?\.facility_id === referral\.referring_facility_id/);
  assert.match(acknowledgedBranch, /profile\?\.role === "receiving_staff"/);
  assert.match(acknowledgedBranch, /profile\?\.facility_id === referral\.receiving_facility_id/);
  assert.match(acknowledgedBranch, /referral\.status === "acknowledged"/);
  assert.ok(source.indexOf("await sendTwilioSms(") > source.indexOf('if (type === "referral_sent")'));
});
