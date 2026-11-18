import { monthlyPeriod } from "./reportingUtils.js";

export const REPORT_DATASETS = [
  {
    key: "continuity",
    title: "Continuity milestones by discharge month",
    rpc: "get_admin_continuity_milestones",
    columns: ["milestone", "referral_count"],
  },
  {
    "key": "volume",
    "title": "Referral volume",
    "rpc": "get_admin_referral_volume",
    "columns": [
      "period_start",
      "period_end",
      "referral_count",
      "acknowledged_count",
      "arrival_confirmed_count",
      "assessment_completed_count",
      "referral_completed_count",
      "chronology_anomaly_count"
    ]
  },
  {
    "key": "facilities",
    "title": "Facility activity",
    "rpc": "get_admin_facility_referral_summary",
    "columns": [
      "referral_direction",
      "facility_label",
      "facility_type",
      "lga",
      "state",
      "referral_count"
    ]
  },
  {
    "key": "coverage",
    "title": "Facility reporting coverage",
    "rpc": "get_admin_facility_reporting_coverage",
    "columns": [
      "coverage_group",
      "facility_count"
    ]
  },
  {
    "key": "geography",
    "title": "LGA referral activity",
    "rpc": "get_admin_lga_referral_summary",
    "columns": [
      "referral_direction",
      "lga_label",
      "state",
      "referral_count"
    ]
  },
  {
    "key": "pathways",
    "title": "Referral pathways",
    "rpc": "get_admin_referral_pathway_summary",
    "columns": [
      "sending_facility_type",
      "receiving_facility_type",
      "referral_count"
    ]
  }
];

const SUPPRESSION_FLAGS = {
  referral_count: "small_cell_suppressed", facility_count: "small_cell_suppressed",
  acknowledged_count: "acknowledged_count_suppressed",
  arrival_confirmed_count: "arrival_count_suppressed",
  assessment_completed_count: "assessment_count_suppressed",
  referral_completed_count: "completion_count_suppressed",
  chronology_anomaly_count: "chronology_anomaly_suppressed",
};

// Project only the verified aggregate contract; discard unexpected identifiers.
export function projectAggregateRows(rows, columns) {
  if (!Array.isArray(rows)) throw new Error("Aggregate response is unavailable.");
  return rows.map((row) => Object.fromEntries(columns.map((key) => {
    const value = row[key];
    if (key.endsWith("_count")) {
      const flag = row[SUPPRESSION_FLAGS[key]];
      if (typeof flag !== "boolean") throw new Error("Aggregate suppression metadata is missing.");
      if (flag || row.complementary_suppressed === true || value == null) return [key, null];
      const count = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Aggregate count is invalid.");
      return [key, count > 0 && count < 5 ? null : count];
    }
    if (value != null && typeof value !== "string") throw new Error("Aggregate label is invalid.");
    return [key, value ?? ""];
  })));
}

export async function loadPublicHealthReport(client, month) {
  const period = monthlyPeriod(month);
  const { data: identity, error: authError } = await client.auth.getUser();
  if (authError || !identity?.user) throw new Error("Sign in to view this report.");
  const { data: profile, error: profileError } = await client.from("profiles")
    .select("role").eq("id", identity.user.id).single();
  if (profileError || profile?.role !== "administrator") throw new Error("Authorized reporting access is required.");
  const datasets = await Promise.all(REPORT_DATASETS.map(async (definition) => {
    const { data, error } = await client.rpc(definition.rpc, {
      p_start_date: period.start, p_end_date: period.end,
    });
    if (error) throw new Error("The verified aggregate reporting service is unavailable. No patient-level fallback was requested.");
    return { ...definition, rows: projectAggregateRows(data, definition.columns) };
  }));
  return { period, datasets, generatedAt: new Date().toISOString() };
}
