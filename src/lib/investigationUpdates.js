import { validateInvestigationFileContent, createInvestigationFilePath } from "./investigationAttachments.js";

export function initialInvestigationRecords(records) {
  return records.map(({ result_file, result_file_path, result_file_name, result_file_type, result_file_size, ...clinical }) => clinical);
}

export async function saveInvestigation(client, referralId, expected, index, patch, operationId) {
  if (!Array.isArray(expected) || !Number.isInteger(index) || index < 0 || !expected[index]) {
    throw new Error("INVESTIGATION_REVIEW_REQUIRED");
  }
  const { data, error } = await client.rpc("save_referral_investigation", {
    p_referral_id: referralId, p_expected_records: expected, p_index: index,
    p_patch: patch, p_operation_id: operationId,
  });
  if (error) throw new Error("INVESTIGATION_OUTCOME_UNCONFIRMED");
  if (data?.status === "conflict") throw new Error("STALE_INVESTIGATION_RECORD");
  if (!["saved", "replayed"].includes(data?.status) || !Array.isArray(data.investigation_records)) {
    throw new Error("INVESTIGATION_OUTCOME_UNCONFIRMED");
  }
  return data;
}

// Register each file immediately. An interrupted later upload cannot hide an
// earlier successfully linked attachment. No storage deletion is attempted.
export async function uploadInitialInvestigationFiles(client, referralId, selected, expected, enabled, uuid = () => crypto.randomUUID()) {
  if (!selected.some((record) => record.result_file)) return expected;
  if (!enabled) throw new Error("INVESTIGATION_SERVICE_UNAVAILABLE");
  let records = expected;
  for (let index = 0; index < selected.length; index++) {
    const file = selected[index].result_file;
    if (!file) continue;
    await validateInvestigationFileContent(file);
    const path = createInvestigationFilePath(referralId, file, uuid);
    const { error } = await client.storage.from("referral-investigation-results")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw new Error("INVESTIGATION_OUTCOME_UNCONFIRMED");
    const saved = await saveInvestigation(client, referralId, records, index, {
      result_file_path: path, result_file_name: file.name,
      result_file_type: file.type, result_file_size: file.size,
    }, uuid());
    records = saved.investigation_records;
  }
  return records;
}
