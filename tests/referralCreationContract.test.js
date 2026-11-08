import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReferralCreatePayload,
  REFERRAL_CREATE_ALLOWED_FIELDS,
} from "../src/lib/referralCreation.js";

const context = {
  authenticatedUserId: "user-current",
  profileRole: "phc_staff",
  profileFacilityId: "facility-phc",
  activeDestinationFacilityId: "facility-receiving",
  offlineClientId: "client-001",
  syncSource: "offline",
};

function intake(overrides = {}) {
  return {
    referral_number: "RF-2026-123456",
    patient_identifier: "SYNTHETIC-PATIENT-001",
    patient_age_months: 84,
    patient_sex: "female",
    chief_complaint: "Fever and weakness",
    urgency: "urgent",
    receiving_facility_id: "facility-receiving",
    offline_client_id: "client-001",
    physical_findings_structured: ["Fever", "Reduced oral intake"],
    investigation_categories: ["Laboratory"],
    diagnosis_records: [{
      status: "suspected", category: "infectious_disease",
      diagnosis: "Malaria", referring_user_id: "attacker-user",
    }],
    investigation_records: [{
      category: "Laboratory", investigation: "Malaria RDT",
      result_status: "pending", result_value: "",
      result_file: { name: "unexpected.pdf" }, arbitrary_column: "discard",
    }],
    treatment_given_structured: ["Oral rehydration"],
    ...overrides,
  };
}

test("create contract exposes only explicit clinical intake fields", () => {
  assert.ok(REFERRAL_CREATE_ALLOWED_FIELDS.includes("diagnosis_records"));
  assert.ok(REFERRAL_CREATE_ALLOWED_FIELDS.includes("investigation_records"));
  for (const field of ["created_at", "is_test", "status", "referring_user_id", "referring_facility_id"]) {
    assert.ok(!REFERRAL_CREATE_ALLOWED_FIELDS.includes(field));
  }
});

test("trusted identity, facility and lifecycle metadata override tampered intake fields", () => {
  const payload = buildReferralCreatePayload(intake({
    referring_user_id: "attacker-user",
    referring_facility_id: "facility-attacker",
    status: "completed",
    is_test: true,
    sync_source: "online",
    created_at: "1999-01-01T00:00:00.000Z",
    completed_at: "1999-01-02T00:00:00.000Z",
    privileged_column: "discard",
  }), context);

  assert.equal(payload.referring_user_id, "user-current");
  assert.equal(payload.referring_facility_id, "facility-phc");
  assert.equal(payload.receiving_facility_id, "facility-receiving");
  assert.equal(payload.status, "sent");
  assert.equal(payload.offline_client_id, "client-001");
  assert.equal(payload.sync_source, "offline");
  assert.equal(payload.is_test, false);
  assert.ok(!Object.hasOwn(payload, "created_at"));
  assert.ok(!Object.hasOwn(payload, "completed_at"));
  assert.ok(!Object.hasOwn(payload, "privileged_column"));
});

test("nested diagnosis and investigation JSON is reduced to allowlisted fields", () => {
  const payload = buildReferralCreatePayload(intake(), context);
  assert.deepEqual(payload.diagnosis_records, [{
    status: "suspected", category: "infectious_disease", diagnosis: "Malaria",
  }]);
  assert.deepEqual(payload.investigation_records, [{
    category: "Laboratory", investigation: "Malaria RDT",
    result_status: "pending", result_value: "",
  }]);
  assert.deepEqual(payload.investigation_categories, ["Laboratory"]);
  assert.deepEqual(payload.physical_findings_structured, ["Fever", "Reduced oral intake"]);
});

test("online and offline origins are assigned explicitly", () => {
  const online = buildReferralCreatePayload(intake(), { ...context, syncSource: "online" });
  const offline = buildReferralCreatePayload(intake(), context);
  assert.equal(online.sync_source, "online");
  assert.equal(offline.sync_source, "offline");
});

test("creation rejects wrong role, missing identity and missing sender facility", () => {
  assert.throws(() => buildReferralCreatePayload(intake(), { ...context, profileRole: "receiving_staff" }), /PHC staff/);
  assert.throws(() => buildReferralCreatePayload(intake(), { ...context, authenticatedUserId: "" }), /authenticated user/);
  assert.throws(() => buildReferralCreatePayload(intake(), { ...context, profileFacilityId: null }), /current profile facility/);
});

test("creation rejects destination substitution and altered idempotency key", () => {
  assert.throws(() => buildReferralCreatePayload(intake({ receiving_facility_id: "facility-other" }), context), /does not match/);
  assert.throws(() => buildReferralCreatePayload(intake({ offline_client_id: "client-other" }), context), /idempotency key/);
  assert.throws(() => buildReferralCreatePayload(intake(), { ...context, activeDestinationFacilityId: "" }), /active receiving facility/);
});

test("creation rejects malformed core clinical and nested values", () => {
  assert.throws(() => buildReferralCreatePayload(intake({ patient_age_months: -1 }), context), /Patient age/);
  assert.throws(() => buildReferralCreatePayload(intake({ patient_sex: "unknown" }), context), /Patient sex/);
  assert.throws(() => buildReferralCreatePayload(intake({ urgency: "critical" }), context), /urgency/);
  assert.throws(() => buildReferralCreatePayload(intake({ diagnosis_records: [{ status: { injected: true } }] }), context), /invalid "status"/);
});
