const assessment = ["status","assessment_findings","final_diagnosis","diagnosis_category","diagnosis_status","treatment_provided","procedures_performed","clinical_feedback","disposition","assessment_completed_at","admission_at","discharged_at"];
const inpatient = ["status","admission_at","ward_unit","admission_diagnosis","clinical_progress","inpatient_treatment","discharge_diagnosis","condition_at_discharge","discharge_medications","follow_up_plan","discharged_at"];
const patches = {
  assessment: assessment.slice(1,9),
  admission: ["admission_at","ward_unit","admission_diagnosis","clinical_progress","inpatient_treatment"],
  discharge: ["discharge_diagnosis","condition_at_discharge","discharge_medications","follow_up_plan"],
};

export async function saveClinicalTransaction(client, referralId, kind, snapshot, patch, operationId) {
  if (!Object.hasOwn(patches, kind) || !snapshot || snapshot.id !== referralId || !operationId) {
    throw new Error("CLINICAL_RECORD_CONFLICT");
  }
  const fields = kind === "assessment" ? assessment : inpatient;
  const expected = Object.fromEntries(fields.map(field => [field, snapshot[field] ?? null]));
  const projected = Object.fromEntries(patches[kind].map(field => [field, patch[field] ?? null]));
  let response;
  try {
    response = await client.rpc("save_referral_clinical", {
      p_referral_id: referralId, p_kind: kind, p_expected: expected,
      p_patch: projected, p_operation_id: operationId,
    });
  } catch { throw new Error("CLINICAL_SAVE_UNCONFIRMED"); }
  if (response?.error) throw new Error("CLINICAL_SAVE_UNCONFIRMED");
  const result = response?.data;
  if (result?.status === "conflict") throw new Error("CLINICAL_RECORD_CONFLICT");
  if (!["saved","replayed"].includes(result?.status) ||
      typeof result.revision !== "string" || !result.revision ||
      result.referral?.id !== referralId ||
      typeof result.referral.referral_number !== "string" ||
      typeof result.referral.status !== "string" ||
      fields.some(field => !Object.hasOwn(result.referral, field))) {
    throw new Error("CLINICAL_SAVE_UNCONFIRMED");
  }
  const data = Object.fromEntries([...new Set([...fields, ...patches[kind], "id", "referral_number"])]
    .map(field => [field, result.referral[field] ?? null]));
  return { data, recovered: result.status === "replayed" };
}
