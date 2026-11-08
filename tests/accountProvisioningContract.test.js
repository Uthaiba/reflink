import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const edgeFunction = await readFile(
  new URL("../supabase/functions/create-user/index.ts", import.meta.url),
  "utf8",
);
const profileSchema = await readFile(
  new URL("../docs/IDENTITY_AND_ACCOUNT_PROVISIONING_RECONCILIATION.md", import.meta.url),
  "utf8",
);
const adminDashboard = await readFile(
  new URL("../src/components/dashboards/AdminDashboard.jsx", import.meta.url),
  "utf8",
);

test("account provisioning verifies the bearer token and canonical administrator profile", () => {
  assert.match(edgeFunction, /admin\.auth\.getUser\(token\)/);
  assert.match(edgeFunction, /requesterProfile\?\.role !== "administrator"/);
  assert.match(edgeFunction, /\.from\("profiles"\)/);
});

test("provisioning roles remain aligned with the canonical profile role constraint", () => {
  assert.match(edgeFunction, /new Set\(\["administrator", "phc_staff", "receiving_staff"\]\)/);
  assert.match(profileSchema, /exactly `phc_staff`, `receiving_staff`, and `administrator`/);
  assert.match(profileSchema, /phc_staff/);
  assert.match(profileSchema, /receiving_staff/);
  assert.match(profileSchema, /administrator/);
  assert.doesNotMatch(edgeFunction, /"referring_staff"|"facility_admin"|"receiver"|"facility_manager"/);
});

test("staff provisioning requires an existing active facility", () => {
  assert.match(edgeFunction, /role !== "administrator" && !facilityId/);
  assert.match(edgeFunction, /\.from\("facilities"\)/);
  assert.match(edgeFunction, /facility\.is_active !== true/);
});

test("untrusted Auth metadata cannot assign an application role or facility", () => {
  assert.match(edgeFunction, /user_metadata: \{ full_name: fullName \}/);
  assert.doesNotMatch(edgeFunction, /user_metadata:\s*\{[^}]*\b(role|facility_id)\b/s);
});

test("profile creation failure attempts to compensate by deleting the Auth identity", () => {
  assert.match(edgeFunction, /if \(profileError \|\| !profile\)/);
  assert.match(edgeFunction, /admin\.auth\.admin\.deleteUser\(created\.user\.id\)/);
  assert.match(edgeFunction, /account creation was rolled back/);
});

test("administrator dashboard provisions accounts through the Edge Function", () => {
  assert.match(adminDashboard, /functions\.invoke\(/);
  assert.match(adminDashboard, /"create-user"/);
  assert.match(adminDashboard, /\.from\("profiles"\)/);
});


test("temporary-password requirement is persisted atomically with the new profile", () => {
  assert.match(edgeFunction, /must_change_password: true/);
  assert.doesNotMatch(adminDashboard, /TEMPORARY PASSWORD FLAG UPDATE SKIPPED/);
  assert.doesNotMatch(adminDashboard, /must_change_password:\s*true/);
});


test("provisioning CORS uses the verified application origin and explicit configured origins", () => {
  assert.match(edgeFunction, /https:\/\/reflink-yobe\.vercel\.app/);
  assert.match(edgeFunction, /REFLINK_ALLOWED_ORIGINS/);
  assert.match(edgeFunction, /allowedOrigins\.has\(origin\)/);
  assert.match(edgeFunction, /headers\["Access-Control-Allow-Origin"\] = origin/);
  assert.doesNotMatch(edgeFunction, /"Access-Control-Allow-Origin": "\*"/);
});
