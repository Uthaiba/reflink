const SUPPORTED_STATUSES = new Set(["suspected", "provisional", "confirmed"]);

// diagnosis_records remains authoritative. A legacy scalar cannot describe mixed
// certainty without either violating its CHECK constraint or overstating certainty.
export function getLegacyDiagnosisStatus(records) {
  if (!Array.isArray(records)) throw new Error("Diagnosis records must be a list.");
  if (records.length === 0) return null;
  const statuses = records.map((record) => record?.status);
  if (statuses.some((status) => !SUPPORTED_STATUSES.has(status))) {
    throw new Error("Each diagnosis must have a supported diagnosis status.");
  }
  return statuses.every((status) => status === statuses[0]) ? statuses[0] : null;
}
