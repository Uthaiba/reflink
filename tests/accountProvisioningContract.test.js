import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PROVISIONING_ROLES, buildInitialProfile, isAdministratorProfile, normalizeProvisioningInput, provisionAccount, requiresFacility } from "../supabase/functions/_shared/accountProvisioningPolicy.js";

const edgeFunction = await readFile(
  new URL("../supabase/functions/create-user/index.ts", import.meta.url),
  "utf8",
);
const provisioningPolicy = await readFile(new URL("../supabase/functions/_shared/accountProvisioningPolicy.js", import.meta.url), "utf8");
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
  assert.match(edgeFunction, /provisionAccount\(/);
  assert.match(edgeFunction, /\.from\("profiles"\)/);
});

test("provisioning roles remain aligned with the canonical profile role constraint", () => {
  assert.deepEqual(PROVISIONING_ROLES, ["administrator", "phc_staff", "receiving_staff"]);
  assert.match(profileSchema, /exactly `phc_staff`, `receiving_staff`, and `administrator`/);
  assert.match(profileSchema, /phc_staff/);
  assert.match(profileSchema, /receiving_staff/);
  assert.match(profileSchema, /administrator/);
  assert.doesNotMatch(edgeFunction, /"referring_staff"|"facility_admin"|"receiver"|"facility_manager"/);
});

test("staff provisioning requires an existing active facility", () => {
  assert.match(edgeFunction, /body: await req.json\(\)/);
  assert.equal(requiresFacility("phc_staff"), true);
  assert.equal(requiresFacility("receiving_staff"), true);
  assert.equal(requiresFacility("administrator"), false);
  assert.match(edgeFunction, /\.from\("facilities"\)/);
  assert.match(edgeFunction, /facility\?\.is_active === true/);
});

test("untrusted Auth metadata cannot assign an application role or facility", () => {
  assert.match(edgeFunction, /user_metadata: \{ full_name: fullName \}/);
  assert.doesNotMatch(edgeFunction, /user_metadata:\s*\{[^}]*\b(role|facility_id)\b/s);
});

test("profile creation failure attempts to compensate by deleting the Auth identity", () => {
  assert.match(provisioningPolicy, /if \(profileError \|\| !profile\)/);
  assert.match(edgeFunction, /admin\.auth\.admin\.deleteUser\(userId\)/);
  assert.match(provisioningPolicy, /if \(rollbackError\)/);
  assert.match(provisioningPolicy, /cleanup requires administrator review/);
  assert.match(provisioningPolicy, /account creation was rolled back/);
});

test("administrator dashboard provisions accounts through the Edge Function", () => {
  assert.match(adminDashboard, /functions\.invoke\(/);
  assert.match(adminDashboard, /"create-user"/);
  assert.match(adminDashboard, /\.from\("profiles"\)/);
});


test("temporary-password requirement is persisted atomically with the new profile", () => {
  assert.match(edgeFunction, /provisionAccount\(/);
  assert.match(provisioningPolicy, /must_change_password: true/);
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

test("shared policy normalizes valid email and rejects malformed addresses", () => {
  const valid = normalizeProvisioningInput({ email: " Nurse+Test@Example.org ", password: "temporary-password", full_name: " Nurse Example ", role: "phc_staff", facility_id: "facility-1" });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.email, "nurse+test@example.org");
  assert.equal(valid.value.fullName, "Nurse Example");
  for (const email of ["bad email@example.org", "missing-at-example.org", "staff@invalid"]) {
    const result = normalizeProvisioningInput({ email, password: "temporary-password", full_name: "Nurse Example", role: "phc_staff", facility_id: "facility-1" });
    assert.equal(result.ok, false, email);
  }
});

test("shared policy rejects legacy role aliases and missing staff facilities", () => {
  for (const role of ["receiver", "facility_manager", "referring_staff", "facility_admin", "unknown"]) {
    const result = normalizeProvisioningInput({ email: "nurse@example.org", password: "temporary-password", full_name: "Nurse Example", role, facility_id: "facility-1" });
    assert.equal(result.ok, false, role);
  }
  for (const role of ["phc_staff", "receiving_staff"]) {
    const result = normalizeProvisioningInput({ email: "nurse@example.org", password: "temporary-password", full_name: "Nurse Example", role });
    assert.equal(result.ok, false, role);
  }
});

test("administrator authorization reads the canonical profile role, not editable metadata", () => {
  assert.equal(isAdministratorProfile({ role: "administrator" }), true);
  assert.equal(isAdministratorProfile({ role: "phc_staff" }), false);
  assert.equal(isAdministratorProfile({ user_metadata: { role: "administrator" } }), false);
});

test("initial profile builder binds the Auth UUID and enforces password-change requirement", () => {
  assert.deepEqual(buildInitialProfile({ id: "auth-user-123", fullName: "Nurse Example", phone: "", role: "receiving_staff", facilityId: "facility-2" }), {
    id: "auth-user-123", full_name: "Nurse Example", phone: null, role: "receiving_staff", facility_id: "facility-2", must_change_password: true,
  });
  assert.throws(() => buildInitialProfile({ id: "auth-user-124", fullName: "Nurse Example", phone: "", role: "phc_staff", facilityId: null }), /facility assignment/);
});


function fakeProvisioningDependencies(overrides = {}) {
  const calls = { facility: [], authCreate: [], profileCreate: [], authDelete: [] };
  const dependencies = {
    requesterProfile: { role: "administrator" },
    body: { email: "nurse@example.org", password: "temporary-password", full_name: "Nurse Example", role: "phc_staff", facility_id: "facility-1" },
    findActiveFacility: async (id) => { calls.facility.push(id); return true; },
    createAuthUser: async (input) => { calls.authCreate.push(input); return { user: { id: "auth-user-1", email: input.email }, error: null }; },
    createProfile: async (input) => { calls.profileCreate.push(input); return { profile: { id: input.id, ...input }, error: null }; },
    deleteAuthUser: async (id) => { calls.authDelete.push(id); return { error: null }; },
    ...overrides,
  };
  return { dependencies, calls };
}

test("provisioning workflow rejects non-administrators before external writes", async () => {
  const { dependencies, calls } = fakeProvisioningDependencies({ requesterProfile: { role: "phc_staff" } });
  const result = await provisionAccount(dependencies);
  assert.equal(result.status, 403);
  assert.equal(calls.authCreate.length, 0);
  assert.equal(calls.profileCreate.length, 0);
});

test("provisioning workflow rejects inactive facilities before creating an Auth identity", async () => {
  const { dependencies, calls } = fakeProvisioningDependencies({ findActiveFacility: async () => false });
  const result = await provisionAccount(dependencies);
  assert.equal(result.status, 400);
  assert.equal(calls.authCreate.length, 0);
});

test("provisioning workflow creates one Auth identity and one matching profile", async () => {
  const { dependencies, calls } = fakeProvisioningDependencies();
  const result = await provisionAccount(dependencies);
  assert.equal(result.status, 201);
  assert.equal(calls.authCreate.length, 1);
  assert.equal(calls.profileCreate.length, 1);
  assert.equal(calls.profileCreate[0].id, "auth-user-1");
  assert.equal(calls.profileCreate[0].facility_id, "facility-1");
  assert.equal(calls.profileCreate[0].must_change_password, true);
  assert.equal(calls.authDelete.length, 0);
});

test("provisioning workflow compensates an Auth identity when profile creation fails", async () => {
  const { dependencies, calls } = fakeProvisioningDependencies({
    createProfile: async () => ({ profile: null, error: new Error("synthetic profile failure") }),
  });
  const result = await provisionAccount(dependencies);
  assert.equal(result.status, 500);
  assert.equal(calls.authDelete.length, 1);
  assert.equal(calls.authDelete[0], "auth-user-1");
  assert.match(result.body.error, /rolled back/);
});

test("provisioning workflow reports cleanup failure for administrator recovery", async () => {
  const { dependencies, calls } = fakeProvisioningDependencies({
    createProfile: async () => ({ profile: null, error: new Error("synthetic profile failure") }),
    deleteAuthUser: async (id) => { calls.authDelete.push(id); return { error: new Error("synthetic cleanup failure") }; },
  });
  const result = await provisionAccount(dependencies);
  assert.equal(result.status, 500);
  assert.equal(calls.authDelete.length, 1);
  assert.match(result.body.error, /administrator review/);
});

test("provisioning workflow treats duplicate-email Auth errors as a safe client failure", async () => {
  const { dependencies, calls } = fakeProvisioningDependencies({
    createAuthUser: async () => ({ user: null, error: new Error("duplicate email") }),
  });
  const result = await provisionAccount(dependencies);
  assert.equal(result.status, 400);
  assert.equal(calls.profileCreate.length, 0);
  assert.equal(calls.authDelete.length, 0);
  assert.doesNotMatch(result.body.error, /duplicate email/);
});


test("provisioning workflow compensates when profile adapter throws", async () => {
  const { dependencies, calls } = fakeProvisioningDependencies({
    createProfile: async () => { throw new Error("synthetic transport failure"); },
  });
  const result = await provisionAccount(dependencies);
  assert.equal(result.status, 500);
  assert.equal(calls.authDelete.length, 1);
  assert.match(result.body.error, /rolled back/);
});

test("provisioning workflow reports cleanup adapter exceptions for manual recovery", async () => {
  const { dependencies, calls } = fakeProvisioningDependencies({
    createProfile: async () => ({ profile: null, error: new Error("synthetic profile failure") }),
    deleteAuthUser: async (id) => { calls.authDelete.push(id); throw new Error("synthetic network failure"); },
  });
  const result = await provisionAccount(dependencies);
  assert.equal(result.status, 500);
  assert.equal(calls.authDelete.length, 1);
  assert.match(result.body.error, /administrator review/);
});
