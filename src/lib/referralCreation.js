/**
 * Canonical client-side referral creation contract.
 *
 * This allowlist is defence in depth, not a database authorization boundary.
 * RLS or a fixed-argument create_referral RPC must independently bind auth.uid(),
 * the current profile role/facility, the active destination and initial status.
 */
const TEXT_FIELDS = Object.freeze([
  "referral_number", "patient_identifier", "patient_phone", "patient_address",
  "relative_name", "relative_relationship", "relative_phone",
  "chief_complaint", "chief_complaint_category", "chief_complaint_other",
  "clinical_summary", "physical_findings", "diagnosis_status", "diagnosis_category",
  "diagnosis_category_other", "provisional_diagnosis", "investigations",
  "treatment_given", "referral_reason",
]);
const STRING_ARRAY_FIELDS = Object.freeze([
  "physical_findings_structured", "investigation_categories", "treatment_given_structured",
]);
const DIAGNOSIS_FIELDS = Object.freeze(["status", "category", "diagnosis"]);
const INVESTIGATION_FIELDS = Object.freeze([
  "category", "investigation", "result_status", "result_value", "result_unit",
  "reference_range", "interpretation", "result_notes", "result_file_path",
  "result_file_name", "result_file_type", "result_file_size",
]);

export const REFERRAL_CREATE_ALLOWED_FIELDS = Object.freeze([
  ...TEXT_FIELDS, "patient_age_months", "patient_sex", "urgency",
  ...STRING_ARRAY_FIELDS, "diagnosis_records", "investigation_records",
]);

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireIdentifier(value, label) {
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("A valid " + label + " is required to create a referral.");
  }
  return String(value).trim();
}

function copyTextFields(source, target, fields) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(source, field) || source[field] === undefined) continue;
    const value = source[field];
    if (value !== null && typeof value !== "string") {
      throw new Error('Referral field "' + field + '" must be text or null.');
    }
    target[field] = value;
  }
}

function sanitizeStringArray(value, field) {
  if (!Array.isArray(value)) throw new Error('Referral field "' + field + '" must be an array.');
  return value.map((item) => {
    if (typeof item !== "string") {
      throw new Error('Referral field "' + field + '" contains an invalid value.');
    }
    return item.trim();
  }).filter(Boolean);
}

function sanitizeRecordArray(value, fields, label) {
  if (!Array.isArray(value)) throw new Error('Referral field "' + label + '" must be an array.');
  return value.map((record, index) => {
    if (!isPlainRecord(record)) {
      throw new Error('Referral field "' + label + '" contains an invalid record at position ' + (index + 1) + ".");
    }
    const clean = {};
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(record, field) || record[field] === undefined) continue;
      const fieldValue = record[field];
      if (field === "result_file_size") {
        if (fieldValue !== null && (!Number.isInteger(fieldValue) || fieldValue < 0)) {
          throw new Error('Referral field "' + label + '" contains an invalid file size.');
        }
      } else if (fieldValue !== null && typeof fieldValue !== "string") {
        throw new Error('Referral field "' + label + '" contains an invalid "' + field + '" value.');
      }
      clean[field] = fieldValue;
    }
    return clean;
  });
}

/**
 * Build a strict INSERT payload from clinical intake and fresh trusted context.
 * The intake object is never spread into the result.
 *
 * created_at is omitted so PostgreSQL supplies now(). is_test is fixed false;
 * synthetic test fixtures must be created through controlled staging tooling.
 */
export function buildReferralCreatePayload(intake, {
  authenticatedUserId, profileRole, profileFacilityId,
  activeDestinationFacilityId, offlineClientId, syncSource,
} = {}) {
  if (!isPlainRecord(intake)) throw new Error("A valid referral intake object is required.");
  if (profileRole !== "phc_staff") {
    throw new Error("Only an assigned PHC staff account may create a referral.");
  }

  const actorId = requireIdentifier(authenticatedUserId, "authenticated user");
  const senderFacilityId = requireIdentifier(profileFacilityId, "current profile facility");
  const destinationFacilityId = requireIdentifier(activeDestinationFacilityId, "active receiving facility");
  const clientId = requireIdentifier(offlineClientId, "referral idempotency key");

  if (syncSource !== "online" && syncSource !== "offline") {
    throw new Error("The referral synchronization source is invalid.");
  }

  const requestedDestinationId = requireIdentifier(
    intake.receiving_facility_id, "selected receiving facility"
  );
  if (requestedDestinationId !== destinationFacilityId) {
    throw new Error("The selected receiving facility does not match the currently verified active facility.");
  }

  if (intake.offline_client_id !== undefined && intake.offline_client_id !== null
    && String(intake.offline_client_id).trim() !== clientId) {
    throw new Error("The referral idempotency key does not match the queued record.");
  }

  const payload = {};
  copyTextFields(intake, payload, TEXT_FIELDS);
  payload.referral_number = requireIdentifier(payload.referral_number, "referral number");
  payload.patient_identifier = requireIdentifier(payload.patient_identifier, "patient identifier");

  if (intake.patient_age_months === undefined || intake.patient_age_months === null
    || String(intake.patient_age_months).trim() === "") {
    throw new Error("Patient age must be a non-negative whole number of months.");
  }
  const age = Number(intake.patient_age_months);
  if (!Number.isInteger(age) || age < 0) {
    throw new Error("Patient age must be a non-negative whole number of months.");
  }

  const patientSex = String(intake.patient_sex || "").trim().toLowerCase();
  if (!["male", "female", "other"].includes(patientSex)) throw new Error("Patient sex is invalid.");

  const urgency = String(intake.urgency || "").trim().toLowerCase();
  if (!["routine", "urgent", "emergency"].includes(urgency)) {
    throw new Error("Referral urgency is invalid.");
  }

  const chiefComplaint = String(payload.chief_complaint || "").trim();
  if (!chiefComplaint) throw new Error("A chief complaint is required.");

  payload.patient_age_months = age;
  payload.patient_sex = patientSex;
  payload.chief_complaint = chiefComplaint;
  payload.urgency = urgency;

  for (const field of STRING_ARRAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(intake, field) && intake[field] !== undefined) {
      payload[field] = sanitizeStringArray(intake[field], field);
    }
  }
  if (Object.prototype.hasOwnProperty.call(intake, "diagnosis_records")
    && intake.diagnosis_records !== undefined) {
    payload.diagnosis_records = sanitizeRecordArray(
      intake.diagnosis_records, DIAGNOSIS_FIELDS, "diagnosis_records"
    );
  }
  if (Object.prototype.hasOwnProperty.call(intake, "investigation_records")
    && intake.investigation_records !== undefined) {
    payload.investigation_records = sanitizeRecordArray(
      intake.investigation_records, INVESTIGATION_FIELDS, "investigation_records"
    );
  }

  // Authority-bearing and system-managed columns are assigned only here.
  payload.referring_user_id = actorId;
  payload.referring_facility_id = senderFacilityId;
  payload.receiving_facility_id = destinationFacilityId;
  payload.offline_client_id = clientId;
  payload.sync_source = syncSource;
  payload.status = "sent";
  payload.is_test = false;

  return payload;
}
