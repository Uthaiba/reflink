// Read-only recovery: this is a snapshot, never authorization to delete storage.
export async function inspectInvestigationAttachment(fetchReferral, path) {
  if (typeof path !== "string" || !path) return "unknown";
  try {
    const response = await fetchReferral();
    if (response?.error || !response?.data) return "unknown";
    let records = response.data.investigation_records;
    if (typeof records === "string") records = JSON.parse(records);
    // Missing/malformed data is not evidence that an object is unreferenced.
    if (!Array.isArray(records)) return "unknown";
    if (records.some((item) => item && typeof item === "object" && item.result_file_path === path)) {
      return "referenced";
    }
    if (records.some((item) => !item || (typeof item !== "object" && typeof item !== "string") || Array.isArray(item))) {
      return "unknown";
    }
    return "unreferenced";
  } catch {
    // A second transport failure must not escape the upload error handler.
    return "unknown";
  }
}
