/**
 * Aggregate only referral rows already authorized by the database.
 * Exclude synthetic/test rows defensively even when the query filters them.
 * This module contains no patient identifiers or network access.
 */
export function summarizeReferrals(rows = []) {
  const real = rows.filter((row) => row && row.is_test !== true);
  const total = real.length;
  const categories = new Map();
  const diagnoses = new Map();
  let classified = 0;
  let completed = 0;

  for (const row of real) {
    const category = String(row.diagnosis_category ?? "").trim();
    const diagnosis = String(row.final_diagnosis ?? "").trim();
    if (category) classified += 1;
    categories.set(category || "Unclassified", (categories.get(category || "Unclassified") || 0) + 1);
    if (category && diagnosis) diagnoses.set(diagnosis, (diagnoses.get(diagnosis) || 0) + 1);
    if (row.status === "completed" || row.status === "discharged") completed += 1;
  }

  const percent = (count) => total ? Number((100 * count / total).toFixed(1)) : 0;
  const sort = (a, b) => b.count - a.count || a.name.localeCompare(b.name);

  return {
    total,
    classified,
    unclassified: total - classified,
    completed,
    categories: [...categories].map(([name, count]) => ({ name, count, percentage: percent(count) })).sort(sort),
    diagnoses: [...diagnoses].map(([condition, count]) => ({ condition, count, percentage: percent(count) }))
      .sort((a, b) => b.count - a.count || a.condition.localeCompare(b.condition)).slice(0, 10),
  };
}
