// Operates exclusively on already-authorized, suppression-projected aggregates.
export const humanLabel = (value) => String(value).replaceAll("_", " ");

export function aggregateSeries(dataset, metric) {
  if (!dataset.columns.includes(metric) || !metric.endsWith("_count")) return [];
  const labels = dataset.columns.filter((key) => !key.endsWith("_count") && !key.startsWith("period_"));
  return dataset.rows.map((row, index) => ({
    row: index + 1,
    label: labels.map((key) => row[key]).filter(Boolean).join(" · ") || `Period total (row ${index + 1})`,
    value: Number.isSafeInteger(row[metric]) && (row[metric] === 0 || row[metric] >= 5) ? row[metric] : null,
  }));
}

export function createAggregateDraft(report) {
  const lines = [
    "REFLINK monthly referral report — DRAFT FOR HUMAN REVIEW",
    `Period: ${report.period.start} to ${report.period.end} (Africa/Lagos)`,
    `Retrieved: ${report.generatedAt}`,
    "Method: deterministic summary of authorized aggregate cells; no AI model or patient-level records used.",
    "Scope: participating-facility referral activity. This is not population incidence, prevalence, service availability or outbreak confirmation.",
    "Current periods may be incomplete. Suppression and missing values are not zero; do not reconstruct withheld cells.",
    "",
  ];
  for (const dataset of report.datasets) {
    lines.push(dataset.title);
    let withheld = 0;
    const counts = dataset.columns.filter((key) => key.endsWith("_count"));
    if (!dataset.rows.length) lines.push("No aggregate rows returned; this does not establish zero activity.");
    for (const metric of counts) {
      for (const item of aggregateSeries(dataset, metric)) {
        const source = `[${dataset.rpc}; row ${item.row}; field ${metric}]`;
        if (item.value == null) { withheld++; continue; }
        lines.push(`${item.label}: ${humanLabel(metric)} = ${item.value}. ${source}`);
      }
    }
    lines.push(`${withheld} count cells withheld or unavailable. No rates, totals across overlapping rows or changes from other months were inferred.`, "");
  }
  lines.push("Questions for the reporting team:",
    "Were participation, recording completeness or referral pathways different during this period?",
    "Do incomplete records or chronology anomalies require operational review?",
    "Has cross-report disclosure risk been assessed before external sharing?",
    "Reviewer: __________________  Review date: __________________",
    "Approval and interpretation must be supplied by an authorized human reviewer.");
  return lines.join("\n");
}
