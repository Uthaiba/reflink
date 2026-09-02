import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";

function formatClinicalLabel(value) {
  if (!value) return "Not recorded";

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusLabel(status) {
  if (!status) return "Unknown";

  const labels = {
    sent: "New Referral",
    acknowledged: "Acknowledged",
    patient_arrived: "Patient Arrived",
    under_assessment: "Under Assessment",
    admitted: "Admitted",
    discharged: "Discharged",
    referred_again: "Re-referred",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return labels[status] || String(status)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/* =======================================================
   HEALTHCARE DATA ANALYSIS HUB
   ======================================================= */

function AnalysisHub() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [referrals, setReferrals] = useState([]);
  const [analysis, setAnalysis] = useState("diagnosis");
  const [breakdown, setBreakdown] = useState("age");
  const [query, setQuery] = useState("");
  const [phase7ActiveSection, setPhase7ActiveSection] =
    useState("overview");

  const phase7Sections = [
    ["overview", "Overview"],
    ["clinical", "Clinical"],
    ["population", "Population"],
    ["facilities", "Facilities"],
    ["pathway", "Referral Pathway"],
    ["trends", "Trends"],
    ["quality", "Data Quality"],
    ["reports", "Reports"],
  ];

  const phase7GoTo = (section) => {
    setPhase7ActiveSection(section);

    const target =
      document.getElementById(
        `phase7-${section}`
      );

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };



  const loadAnalysisData = async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error: referralsError } = await supabase
        .from("referrals")
        .select(`
          id,
          referral_number,
          patient_identifier,
          patient_age_months,
          patient_sex,
          patient_address,
          diagnosis_category,
          diagnosis_status,
          provisional_diagnosis,
          final_diagnosis,
          urgency,
          status,
          created_at,
          acknowledged_at,
          patient_arrived_at,
          assessment_completed_at,
          admission_at,
          discharged_at,
          completed_at,
          referring_facility:facilities!referrals_referring_facility_id_fkey (
            id, name, state, lga, facility_type
          ),
          receiving_facility:facilities!referrals_receiving_facility_id_fkey (
            id, name, state, lga, facility_type
          )
        `)
        .eq("is_test", false)
        .order("created_at", { ascending: false });

      if (referralsError) throw referralsError;
      setReferrals(data || []);
    } catch (err) {
      console.error("ANALYSIS HUB ERROR:", err);
      setError(err?.message || "Unable to load healthcare analysis data.");
      setReferrals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalysisData();
  }, []);

  const getDiagnosis = (row) =>
    String(row?.final_diagnosis || row?.provisional_diagnosis || "")
      .trim() || "Unclassified";

  const getAgeGroup = (months) => {
    const value = Number(months);
    if (!Number.isFinite(value) || value < 0) return "Age not recorded";
    if (value < 60) return "0–4 years";
    if (value < 180) return "5–14 years";
    if (value < 300) return "15–24 years";
    if (value < 540) return "25–44 years";
    if (value < 780) return "45–64 years";
    return "65+ years";
  };

  const getBreakdownValue = (row) => {
    switch (breakdown) {
      case "age": return getAgeGroup(row.patient_age_months);
      case "sex": return formatClinicalLabel(row.patient_sex);
      case "category": return row.diagnosis_category?.trim() || "Unclassified";
      case "status": return getStatusLabel(row.status);
      case "urgency": return formatClinicalLabel(row.urgency);
      case "referring_facility": return row.referring_facility?.name || "Facility not recorded";
      case "receiving_facility": return row.receiving_facility?.name || "Facility not recorded";
      case "lga": return row.referring_facility?.lga || "LGA not recorded";
      case "state": return row.referring_facility?.state || "State not recorded";
      default: return "Unclassified";
    }
  };

  const filtered = referrals.filter((row) => {
    if (!query.trim()) return true;
    const haystack = [
      row.referral_number,
      row.patient_identifier,
      getDiagnosis(row),
      row.diagnosis_category,
      row.referring_facility?.name,
      row.receiving_facility?.name,
      row.referring_facility?.lga,
      row.referring_facility?.state,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase().trim());
  });

  const grouped = {};
  filtered.forEach((row) => {
    const key = getBreakdownValue(row);
    if (!grouped[key]) grouped[key] = { count: 0, diagnoses: {} };
    grouped[key].count += 1;
    const diagnosis = getDiagnosis(row);
    grouped[key].diagnoses[diagnosis] = (grouped[key].diagnoses[diagnosis] || 0) + 1;
  });

  const rows = Object.entries(grouped)
    .map(([label, value]) => {
      const topDiagnosis = Object.entries(value.diagnoses)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      return {
        label,
        count: value.count,
        topDiagnosis: topDiagnosis?.[0] || "Not recorded",
        topDiagnosisCount: topDiagnosis?.[1] || 0,
        percentage: filtered.length ? Number(((value.count / filtered.length) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const diagnosisRows = (() => {
    if (analysis !== "diagnosis") return rows;
    const diagnosisCounts = {};
    filtered.forEach((row) => {
      const diagnosis = getDiagnosis(row);
      diagnosisCounts[diagnosis] = (diagnosisCounts[diagnosis] || 0) + 1;
    });
    return Object.entries(diagnosisCounts)
      .map(([label, count]) => ({
        label,
        count,
        topDiagnosis: label,
        topDiagnosisCount: count,
        percentage: filtered.length ? Number(((count / filtered.length) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 20);
  })();


  /* =======================================================
     PHASE 2 — CROSS ANALYSIS + DATA VALIDATION
     ======================================================= */

  const crossAnalysisDefinitions = {
    diagnosis: {
      title: "Diagnosis by Age & Sex",
      rowLabel: "Diagnosis Category",
      rowValue: (row) =>
        row.diagnosis_category?.trim() || "Unclassified",
      columnLabels: ["0–4", "5–14", "15–24", "25–44", "45–64", "65+"],
      columnValue: (row) => getAgeGroup(row.patient_age_months),
    },
    patients: {
      title: "Age Group by Sex",
      rowLabel: "Age Group",
      rowValue: (row) => getAgeGroup(row.patient_age_months),
      columnLabels: ["Male", "Female", "Other / Not recorded"],
      columnValue: (row) => {
        const sex = String(row.patient_sex || "").trim().toLowerCase();
        if (sex === "male" || sex === "m") return "Male";
        if (sex === "female" || sex === "f") return "Female";
        return "Other / Not recorded";
      },
    },
    facilities: {
      title: "Facility Referral Distribution by Outcome",
      rowLabel: "Referring Facility",
      rowValue: (row) =>
        row.referring_facility?.name || "Facility not recorded",
      columnLabels: ["Sent", "Admitted", "Discharged", "Completed", "Other"],
      columnValue: (row) => {
        switch (row.status) {
          case "sent": return "Sent";
          case "admitted": return "Admitted";
          case "discharged": return "Discharged";
          case "completed": return "Completed";
          default: return "Other";
        }
      },
    },
    outcomes: {
      title: "Referral Outcome by Urgency",
      rowLabel: "Referral Outcome",
      rowValue: (row) => getStatusLabel(row.status),
      columnLabels: ["Routine", "Urgent", "Emergency", "Not recorded"],
      columnValue: (row) => {
        const urgency = String(row.urgency || "").trim().toLowerCase();
        if (urgency === "routine") return "Routine";
        if (urgency === "urgent") return "Urgent";
        if (urgency === "emergency") return "Emergency";
        return "Not recorded";
      },
    },
    geography: {
      title: "Geographic Referral Distribution",
      rowLabel: "LGA",
      rowValue: (row) =>
        row.referring_facility?.lga || "LGA not recorded",
      columnLabels: ["Referrals", "Admitted", "Discharged"],
      columnValue: (row) => {
        if (row.status === "admitted") return "Admitted";
        if (row.status === "discharged") return "Discharged";
        return "Referrals";
      },
    },
    time: {
      title: "Monthly Referral Outcome",
      rowLabel: "Month",
      rowValue: (row) => {
        if (!row.created_at) return "Date not recorded";
        const date = new Date(row.created_at);
        if (Number.isNaN(date.getTime())) return "Date not recorded";
        return date.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
        });
      },
      columnLabels: ["Sent", "Admitted", "Discharged", "Other"],
      columnValue: (row) => {
        switch (row.status) {
          case "sent": return "Sent";
          case "admitted": return "Admitted";
          case "discharged": return "Discharged";
          default: return "Other";
        }
      },
    },
  };

  const crossDefinition =
    crossAnalysisDefinitions[analysis] ||
    crossAnalysisDefinitions.diagnosis;

  const crossTabulation = useMemo(() => {
    const matrix = new Map();

    filtered.forEach((row) => {
      const rowKey = crossDefinition.rowValue(row);
      const colKey = crossDefinition.columnValue(row);

      if (!matrix.has(rowKey)) {
        matrix.set(rowKey, {});
      }

      const rowData = matrix.get(rowKey);
      rowData[colKey] =
        (rowData[colKey] || 0) + 1;
    });

    return Array.from(matrix.entries())
      .map(([label, values]) => {
        const total = Object.values(values)
          .reduce((sum, value) => sum + value, 0);

        return {
          label,
          values,
          total,
        };
      })
      .sort(
        (a, b) =>
          b.total - a.total ||
          a.label.localeCompare(b.label)
      )
      .slice(0, 30);
  }, [filtered, crossDefinition]);

  const validationFindings = useMemo(() => {
    const findings = [];

    filtered.forEach((row) => {
      const referralDate = row.created_at
        ? new Date(row.created_at)
        : null;

      if (
        referralDate &&
        Number.isNaN(referralDate.getTime())
      ) {
        findings.push({
          type: "Invalid date",
          field: "created_at",
          referral: row.referral_number,
        });
      }

      const age = Number(row.patient_age_months);

      if (
        row.patient_age_months !== null &&
        row.patient_age_months !== undefined &&
        (!Number.isFinite(age) || age < 0)
      ) {
        findings.push({
          type: "Invalid age",
          field: "patient_age_months",
          referral: row.referral_number,
        });
      }

      if (
        row.acknowledged_at &&
        row.created_at &&
        new Date(row.acknowledged_at) <
          new Date(row.created_at)
      ) {
        findings.push({
          type: "Timeline inconsistency",
          field: "acknowledged_at",
          referral: row.referral_number,
        });
      }

      if (
        row.patient_arrived_at &&
        row.acknowledged_at &&
        new Date(row.patient_arrived_at) <
          new Date(row.acknowledged_at)
      ) {
        findings.push({
          type: "Timeline inconsistency",
          field: "patient_arrived_at",
          referral: row.referral_number,
        });
      }

      if (
        row.assessment_completed_at &&
        row.patient_arrived_at &&
        new Date(row.assessment_completed_at) <
          new Date(row.patient_arrived_at)
      ) {
        findings.push({
          type: "Timeline inconsistency",
          field: "assessment_completed_at",
          referral: row.referral_number,
        });
      }

      if (
        row.discharged_at &&
        row.admission_at &&
        new Date(row.discharged_at) <
          new Date(row.admission_at)
      ) {
        findings.push({
          type: "Timeline inconsistency",
          field: "discharged_at",
          referral: row.referral_number,
        });
      }
    });

    const duplicateReferralNumbers = new Map();

    filtered.forEach((row) => {
      const key = String(
        row.referral_number || ""
      ).trim();

      if (!key) return;

      duplicateReferralNumbers.set(
        key,
        (duplicateReferralNumbers.get(key) || 0) + 1
      );
    });

    duplicateReferralNumbers.forEach(
      (count, referralNumber) => {
        if (count > 1) {
          findings.push({
            type: "Possible duplicate",
            field: "referral_number",
            referral: referralNumber,
          });
        }
      }
    );

    return findings;
  }, [filtered]);

  const validationSummary = useMemo(() => {
    const total = filtered.length;

    const missing = {
      age: filtered.filter(
        (row) =>
          row.patient_age_months === null ||
          row.patient_age_months === undefined
      ).length,
      sex: filtered.filter(
        (row) =>
          !String(row.patient_sex || "").trim()
      ).length,
      diagnosis: filtered.filter(
        (row) =>
          !String(
            row.final_diagnosis ||
              row.provisional_diagnosis ||
              ""
          ).trim()
      ).length,
      category: filtered.filter(
        (row) =>
          !String(
            row.diagnosis_category || ""
          ).trim()
      ).length,
      facility: filtered.filter(
        (row) =>
          !row.referring_facility_id ||
          !row.receiving_facility_id
      ).length,
    };

    return {
      total,
      missing,
      findings: validationFindings,
      issueCount: validationFindings.length,
    };
  }, [filtered, validationFindings]);



  /* =======================================================
     PHASE 3 — VISUAL ANALYTICS COMPONENTS
     ======================================================= */

  function AnalyticsBarChart({
    title,
    subtitle,
    data = [],
    valueKey = "count",
  }) {
    const chartData = data.slice(0, 10);
    const maxValue = Math.max(
      ...chartData.map((item) =>
        Number(item[valueKey]) || 0
      ),
      1
    );

    return (
      <div className="visual-analytics-card">
        <div className="visual-analytics-heading">
          <div>
            <span className="eyebrow">
              VISUAL ANALYSIS
            </span>
            <h4>{title}</h4>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="empty-state">
            No data available for this visualization.
          </div>
        ) : (
          <div className="bar-chart" role="img" aria-label={title}>
            {chartData.map((item) => {
              const value =
                Number(item[valueKey]) || 0;
              const width =
                Math.max(
                  3,
                  (value / maxValue) * 100
                );

              return (
                <div
                  className="bar-chart-row"
                  key={item.label}
                >
                  <div
                    className="bar-chart-label"
                    title={item.label}
                  >
                    {item.label}
                  </div>

                  <div className="bar-chart-track">
                    <div
                      className="bar-chart-fill"
                      style={{
                        width: `${width}%`,
                      }}
                    />
                  </div>

                  <div className="bar-chart-value">
                    {value}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function AnalyticsDonut({
    title,
    data = [],
  }) {
    const chartData = data.slice(0, 6);
    const total = chartData.reduce(
      (sum, item) =>
        sum + (Number(item.count) || 0),
      0
    );

    let cumulative = 0;

    const segments =
      total > 0
        ? chartData.map((item) => {
            const count =
              Number(item.count) || 0;
            const start = cumulative;
            cumulative += count;

            return {
              ...item,
              start,
              end: cumulative,
              percentage:
                (count / total) * 100,
            };
          })
        : [];

    return (
      <div className="visual-analytics-card">
        <div className="visual-analytics-heading">
          <div>
            <span className="eyebrow">
              DISTRIBUTION
            </span>
            <h4>{title}</h4>
          </div>
        </div>

        {total === 0 ? (
          <div className="empty-state">
            No data available for this visualization.
          </div>
        ) : (
          <div className="donut-layout">
            <div
              className="analytics-donut"
              style={{
                background: `conic-gradient(${segments
                  .map((segment, index) => {
                    const start =
                      (segment.start / total) * 100;
                    const end =
                      (segment.end / total) * 100;

                    const className =
                      [
                        "var(--ref-primary)",
                        "var(--ref-primary-dark)",
                        "#6b9f97",
                        "#9bc0ba",
                        "#c5d9d5",
                        "#dfeae8",
                      ][index] ||
                      "var(--ref-primary)";

                    return `${className} ${start}% ${end}%`;
                  })
                  .join(", ")})`,
              }}
              aria-label={title}
            >
              <div className="analytics-donut-hole">
                <strong>{total}</strong>
                <span>records</span>
              </div>
            </div>

            <div className="donut-legend">
              {segments.map((segment) => (
                <div
                  className="donut-legend-row"
                  key={segment.label}
                >
                  <span
                    className="donut-legend-label"
                    title={segment.label}
                  >
                    {segment.label}
                  </span>

                  <strong>
                    {segment.percentage.toFixed(1)}%
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const visualDiagnosisData = useMemo(() => {
    const groups = new Map();

    filtered.forEach((row) => {
      const diagnosis =
        row.diagnosis_category?.trim() ||
        "Unclassified";

      groups.set(
        diagnosis,
        (groups.get(diagnosis) || 0) + 1
      );
    });

    return Array.from(groups.entries())
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const visualAgeData = useMemo(() => {
    const groups = new Map();

    filtered.forEach((row) => {
      const ageGroup = getAgeGroup(
        row.patient_age_months
      );

      groups.set(
        ageGroup,
        (groups.get(ageGroup) || 0) + 1
      );
    });

    return Array.from(groups.entries()).map(
      ([label, count]) => ({
        label,
        count,
      })
    );
  }, [filtered]);

  const visualSexData = useMemo(() => {
    const groups = new Map();

    filtered.forEach((row) => {
      const sex =
        String(row.patient_sex || "").trim() ||
        "Not recorded";

      groups.set(
        sex,
        (groups.get(sex) || 0) + 1
      );
    });

    return Array.from(groups.entries())
      .map(([label, count]) => ({
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const visualStatusData = useMemo(() => {
    const groups = new Map();

    filtered.forEach((row) => {
      const status =
        row.status || "Not recorded";

      groups.set(
        status,
        (groups.get(status) || 0) + 1
      );
    });

    return Array.from(groups.entries())
      .map(([label, count]) => ({
        label: getStatusLabel(label),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);



  /* =======================================================
     PHASE 4 — HEALTHCARE INTELLIGENCE + REPORTING
     ======================================================= */

  const phase4Kpis = useMemo(() => {
    const total = filtered.length;

    const countStatus = (status) =>
      filtered.filter(
        (row) => row.status === status
      ).length;

    const acknowledged = filtered.filter(
      (row) => row.acknowledged_at
    ).length;

    const arrived = filtered.filter(
      (row) => row.patient_arrived_at
    ).length;

    const assessed = filtered.filter(
      (row) => row.assessment_completed_at
    ).length;

    const completedEpisodes = filtered.filter(
      (row) =>
        row.completed_at ||
        row.discharged_at
    ).length;

    const hoursBetween = (from, to) => {
      if (!from || !to) return null;

      const start = new Date(from);
      const end = new Date(to);

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end < start
      ) {
        return null;
      }

      return (
        (end.getTime() - start.getTime()) /
        3600000
      );
    };

    const median = (values) => {
      const clean = values
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);

      if (!clean.length) return null;

      const middle = Math.floor(
        clean.length / 2
      );

      return clean.length % 2
        ? clean[middle]
        : (clean[middle - 1] +
            clean[middle]) /
            2;
    };

    const acknowledgementTimes = filtered
      .map((row) =>
        hoursBetween(
          row.created_at,
          row.acknowledged_at
        )
      );

    const assessmentTimes = filtered
      .map((row) =>
        hoursBetween(
          row.patient_arrived_at,
          row.assessment_completed_at
        )
      );

    const episodeTimes = filtered
      .map((row) =>
        hoursBetween(
          row.created_at,
          row.completed_at ||
            row.discharged_at
        )
      );

    return {
      total,
      active:
        countStatus("sent") +
        countStatus("acknowledged") +
        countStatus("patient_arrived") +
        countStatus("under_assessment"),
      admitted: countStatus("admitted"),
      discharged: countStatus("discharged"),
      completed: countStatus("completed"),
      acknowledged,
      arrived,
      assessed,
      completedEpisodes,
      acknowledgementRate:
        total ? (acknowledged / total) * 100 : 0,
      arrivalRate:
        total ? (arrived / total) * 100 : 0,
      assessmentRate:
        total ? (assessed / total) * 100 : 0,
      completionRate:
        total
          ? (completedEpisodes / total) * 100
          : 0,
      medianAcknowledgement:
        median(acknowledgementTimes),
      medianAssessment:
        median(assessmentTimes),
      medianEpisode:
        median(episodeTimes),
    };
  }, [filtered]);

  const phase4TrendData = useMemo(() => {
    const months = new Map();

    filtered.forEach((row) => {
      if (!row.created_at) return;

      const date = new Date(row.created_at);
      if (Number.isNaN(date.getTime())) return;

      const key =
        `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

      const label = date.toLocaleDateString(
        undefined,
        {
          year: "numeric",
          month: "short",
        }
      );

      if (!months.has(key)) {
        months.set(key, {
          key,
          label,
          referrals: 0,
          admitted: 0,
          discharged: 0,
          completed: 0,
        });
      }

      const month = months.get(key);
      month.referrals += 1;

      if (row.status === "admitted") {
        month.admitted += 1;
      }

      if (row.status === "discharged") {
        month.discharged += 1;
      }

      if (row.status === "completed") {
        month.completed += 1;
      }
    });

    return Array.from(months.values())
      .sort((a, b) =>
        a.key.localeCompare(b.key)
      )
      .slice(-12);
  }, [filtered]);

  const phase4FacilityData = useMemo(() => {
    const groups = new Map();

    filtered.forEach((row) => {
      const name =
        row.referring_facility?.name ||
        "Facility not recorded";

      if (!groups.has(name)) {
        groups.set(name, {
          label: name,
          referrals: 0,
          admitted: 0,
          discharged: 0,
        });
      }

      const item = groups.get(name);
      item.referrals += 1;

      if (row.status === "admitted") {
        item.admitted += 1;
      }

      if (row.status === "discharged") {
        item.discharged += 1;
      }
    });

    return Array.from(groups.values())
      .sort(
        (a, b) =>
          b.referrals - a.referrals ||
          a.label.localeCompare(b.label)
      )
      .slice(0, 10);
  }, [filtered]);

  const phase4DiagnosisSex = useMemo(() => {
    const groups = new Map();

    filtered.forEach((row) => {
      const diagnosis =
        row.diagnosis_category?.trim() ||
        "Unclassified";

      const rawSex =
        String(row.patient_sex || "")
          .trim()
          .toLowerCase();

      const sex =
        rawSex === "male" ||
        rawSex === "m"
          ? "Male"
          : rawSex === "female" ||
            rawSex === "f"
          ? "Female"
          : "Not recorded";

      if (!groups.has(diagnosis)) {
        groups.set(diagnosis, {
          label: diagnosis,
          Male: 0,
          Female: 0,
          "Not recorded": 0,
        });
      }

      groups.get(diagnosis)[sex] += 1;
    });

    return Array.from(groups.values())
      .sort(
        (a, b) =>
          (b.Male +
            b.Female +
            b["Not recorded"]) -
          (a.Male +
            a.Female +
            a["Not recorded"])
      )
      .slice(0, 12);
  }, [filtered]);

  const phase4AgeDiagnosis = useMemo(() => {
    const ageOrder = [
      "0–4 years",
      "5–14 years",
      "15–24 years",
      "25–44 years",
      "45–64 years",
      "65+ years",
      "Age not recorded",
    ];

    const matrix = new Map();

    filtered.forEach((row) => {
      const diagnosis =
        row.diagnosis_category?.trim() ||
        "Unclassified";

      const age = getAgeGroup(
        row.patient_age_months
      );

      if (!matrix.has(diagnosis)) {
        matrix.set(
          diagnosis,
          Object.fromEntries(
            ageOrder.map((group) => [
              group,
              0,
            ])
          )
        );
      }

      matrix.get(diagnosis)[age] =
        (matrix.get(diagnosis)[age] || 0) + 1;
    });

    return Array.from(matrix.entries())
      .map(([label, values]) => ({
        label,
        values,
        total: Object.values(values).reduce(
          (sum, value) => sum + value,
          0
        ),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filtered]);

  const phase4ExportCsv = () => {
    const columns = [
      "referral_number",
      "patient_identifier",
      "status",
      "urgency",
      "patient_age_months",
      "patient_sex",
      "diagnosis_category",
      "diagnosis_status",
      "provisional_diagnosis",
      "final_diagnosis",
      "referring_facility",
      "receiving_facility",
      "created_at",
      "admission_at",
      "discharged_at",
      "completed_at",
    ];

    const escapeCsv = (value) => {
      const text =
        value === null ||
        value === undefined
          ? ""
          : String(value);

      return `"${text.replace(
        /"/g,
        '""'
      )}"`;
    };

    const dataRows = filtered.map((row) =>
      [
        row.referral_number,
        row.patient_identifier,
        row.status,
        row.urgency,
        row.patient_age_months,
        row.patient_sex,
        row.diagnosis_category,
        row.diagnosis_status,
        row.provisional_diagnosis,
        row.final_diagnosis,
        row.referring_facility?.name,
        row.receiving_facility?.name,
        row.created_at,
        row.admission_at,
        row.discharged_at,
        row.completed_at,
      ]
        .map(escapeCsv)
        .join(",")
    );

    const csv = [
      columns.join(","),
      ...dataRows,
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download =
      `reflink-healthcare-analysis-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const phase4PrintReport = () => {
    window.print();
  };



  /* =======================================================
     PHASE 5 — DATA QUALITY & CLINICAL GOVERNANCE
     ======================================================= */

  const phase5GovernanceFindings = useMemo(() => {
    const findings = [];

    const allowedStatuses = new Set([
      "draft",
      "sent",
      "acknowledged",
      "patient_arrived",
      "under_assessment",
      "admitted",
      "discharged",
      "referred_again",
      "completed",
      "cancelled",
    ]);

    const allowedDiagnosisStatuses = new Set([
      "suspected",
      "provisional",
      "confirmed",
    ]);

    const add = (
      severity,
      type,
      field,
      referral,
      detail
    ) => {
      findings.push({
        severity,
        type,
        field,
        referral,
        detail,
      });
    };

    filtered.forEach((row) => {
      const referral =
        row.referral_number ||
        row.id ||
        "Record";

      const ageMonths =
        row.patient_age_months === null ||
        row.patient_age_months === undefined
          ? null
          : Number(row.patient_age_months);

      if (
        ageMonths !== null &&
        (!Number.isFinite(ageMonths) ||
          ageMonths < 0 ||
          ageMonths > 1440)
      ) {
        add(
          "high",
          "Invalid age value",
          "patient_age_months",
          referral,
          "Age must be a valid non-negative value."
        );
      }

      if (
        row.diagnosis_status &&
        !allowedDiagnosisStatuses.has(
          String(row.diagnosis_status)
            .trim()
            .toLowerCase()
        )
      ) {
        add(
          "high",
          "Invalid diagnosis status",
          "diagnosis_status",
          referral,
          "Value is outside the approved diagnosis-status vocabulary."
        );
      }

      if (
        row.status &&
        !allowedStatuses.has(
          String(row.status)
            .trim()
            .toLowerCase()
        )
      ) {
        add(
          "high",
          "Invalid referral status",
          "status",
          referral,
          "Value is outside the approved referral-status vocabulary."
        );
      }

      const timeline = [
        ["created_at", row.created_at],
        ["acknowledged_at", row.acknowledged_at],
        ["patient_arrived_at", row.patient_arrived_at],
        [
          "assessment_completed_at",
          row.assessment_completed_at,
        ],
        ["admission_at", row.admission_at],
        ["discharged_at", row.discharged_at],
        ["completed_at", row.completed_at],
      ];

      let previous = null;

      timeline.forEach(([field, value]) => {
        if (!value) return;

        const current = new Date(value);

        if (Number.isNaN(current.getTime())) {
          add(
            "high",
            "Invalid timestamp",
            field,
            referral,
            "The stored timestamp cannot be interpreted as a valid date."
          );
          return;
        }

        if (previous && current < previous.date) {
          add(
            "high",
            "Chronology inconsistency",
            field,
            referral,
            `${field} occurs before ${previous.field}.`
          );
        }

        previous = {
          field,
          date: current,
        };
      });

      const hasFinal =
        String(
          row.final_diagnosis || ""
        ).trim().length > 0;

      const hasProvisional =
        String(
          row.provisional_diagnosis || ""
        ).trim().length > 0;

      if (
        row.diagnosis_status === "confirmed" &&
        !hasFinal
      ) {
        add(
          "high",
          "Confirmed diagnosis missing",
          "final_diagnosis",
          referral,
          "A confirmed diagnosis should have a final diagnosis recorded."
        );
      }

      if (
        row.diagnosis_status === "provisional" &&
        !hasProvisional &&
        !hasFinal
      ) {
        add(
          "medium",
          "Provisional diagnosis missing",
          "provisional_diagnosis",
          referral,
          "No provisional or final diagnosis is recorded."
        );
      }

      if (
        row.status === "discharged" &&
        !row.discharged_at
      ) {
        add(
          "medium",
          "Discharge timestamp missing",
          "discharged_at",
          referral,
          "Referral status is discharged but no discharge timestamp is recorded."
        );
      }

      if (
        row.status === "completed" &&
        !row.completed_at
      ) {
        add(
          "medium",
          "Completion timestamp missing",
          "completed_at",
          referral,
          "Referral status is completed but no completion timestamp is recorded."
        );
      }

      if (
        row.status === "admitted" &&
        !row.admission_at
      ) {
        add(
          "medium",
          "Admission timestamp missing",
          "admission_at",
          referral,
          "Referral status is admitted but no admission timestamp is recorded."
        );
      }

      if (
        !row.referring_facility_id ||
        !row.receiving_facility_id
      ) {
        add(
          "low",
          "Incomplete referral pathway",
          "facility_ids",
          referral,
          "Referring and receiving facility information should be complete."
        );
      }
    });

    return findings;
  }, [filtered]);

  const phase5GovernanceSummary = useMemo(() => {
    const total = filtered.length;
    const findings = phase5GovernanceFindings;

    const high = findings.filter(
      (item) => item.severity === "high"
    ).length;

    const medium = findings.filter(
      (item) => item.severity === "medium"
    ).length;

    const low = findings.filter(
      (item) => item.severity === "low"
    ).length;

    const affectedReferrals = new Set(
      findings.map((item) => item.referral)
    ).size;

    const cleanRate =
      total > 0
        ? Math.max(
            0,
            ((total - affectedReferrals) /
              total) *
              100
          )
        : 100;

    return {
      total,
      high,
      medium,
      low,
      issueCount: findings.length,
      affectedReferrals,
      cleanRate,
    };
  }, [
    filtered,
    phase5GovernanceFindings,
  ]);

  const phase5RoleGuidance = useMemo(() => ({
    title: "Privacy-by-design",
    text:
      "Keep personally identifiable information out of aggregate analytics wherever it is not necessary. Use de-identified or aggregated outputs for reporting and sharing.",
  }), []);

  const phase5ExportGovernanceReport = () => {
    const report = {
      generated_at:
        new Date().toISOString(),
      scope: {
        records_analysed:
          phase5GovernanceSummary.total,
      },
      summary: phase5GovernanceSummary,
      findings:
        phase5GovernanceFindings.slice(0, 500),
    };

    const blob = new Blob(
      [JSON.stringify(report, null, 2)],
      {
        type: "application/json;charset=utf-8",
      }
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download =
      `reflink-data-governance-report-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };



  /* =======================================================
     PHASE 6 — ADVANCED CLINICAL & POPULATION ANALYTICS
     ======================================================= */

  const [phase6MatrixDimension, setPhase6MatrixDimension] =
    useState("age");
  const [phase6MatrixColumn, setPhase6MatrixColumn] =
    useState("sex");

  const phase6DimensionOptions = [
    ["age", "Age Group"],
    ["sex", "Sex"],
    ["category", "Diagnosis Category"],
    ["status", "Referral Status"],
    ["urgency", "Urgency"],
    ["referring_facility", "Referring Facility"],
    ["receiving_facility", "Receiving Facility"],
    ["lga", "LGA"],
    ["state", "State"],
  ];

  const phase6GetDimensionValue = (row, dimension) => {
    switch (dimension) {
      case "age":
        return getAgeGroup(row.patient_age_months);

      case "sex": {
        const value = String(row.patient_sex || "")
          .trim()
          .toLowerCase();

        if (value === "male" || value === "m") return "Male";
        if (value === "female" || value === "f") return "Female";
        return "Not recorded";
      }

      case "category":
        return row.diagnosis_category?.trim() ||
          "Unclassified";

      case "status":
        return getStatusLabel(row.status);

      case "urgency":
        return formatClinicalLabel(row.urgency);

      case "referring_facility":
        return row.referring_facility?.name ||
          "Facility not recorded";

      case "receiving_facility":
        return row.receiving_facility?.name ||
          "Facility not recorded";

      case "lga":
        return row.referring_facility?.lga ||
          "LGA not recorded";

      case "state":
        return row.referring_facility?.state ||
          "State not recorded";

      default:
        return "Not recorded";
    }
  };

  const phase6Matrix = useMemo(() => {
    const matrix = new Map();
    const columns = new Set();

    filtered.forEach((row) => {
      const rowLabel =
        phase6GetDimensionValue(
          row,
          phase6MatrixDimension
        );

      const columnLabel =
        phase6GetDimensionValue(
          row,
          phase6MatrixColumn
        );

      columns.add(columnLabel);

      if (!matrix.has(rowLabel)) {
        matrix.set(rowLabel, {
          label: rowLabel,
          values: {},
          total: 0,
        });
      }

      const entry = matrix.get(rowLabel);
      entry.values[columnLabel] =
        (entry.values[columnLabel] || 0) + 1;
      entry.total += 1;
    });

    const preferredOrder = {
      age: [
        "0–4 years",
        "5–14 years",
        "15–24 years",
        "25–44 years",
        "45–64 years",
        "65+ years",
        "Age not recorded",
      ],
      sex: [
        "Male",
        "Female",
        "Not recorded",
      ],
    };

    const orderedColumns =
      preferredOrder[phase6MatrixColumn]
        ? preferredOrder[phase6MatrixColumn].filter(
            (value) => columns.has(value)
          )
        : Array.from(columns).sort(
            (a, b) => a.localeCompare(b)
          );

    const orderedRows =
      Array.from(matrix.values()).sort(
        (a, b) =>
          b.total - a.total ||
          a.label.localeCompare(b.label)
      );

    return {
      columns: orderedColumns,
      rows: orderedRows.slice(0, 25),
    };
  }, [
    filtered,
    phase6MatrixDimension,
    phase6MatrixColumn,
  ]);

  const phase6DiagnosisByArea = useMemo(() => {
    const groups = new Map();

    filtered.forEach((row) => {
      const area =
        row.referring_facility?.lga ||
        "LGA not recorded";

      const diagnosis =
        row.diagnosis_category?.trim() ||
        "Unclassified";

      if (!groups.has(area)) {
        groups.set(area, {
          label: area,
          diagnoses: {},
          total: 0,
        });
      }

      const item = groups.get(area);
      item.total += 1;
      item.diagnoses[diagnosis] =
        (item.diagnoses[diagnosis] || 0) + 1;
    });

    return Array.from(groups.values())
      .map((item) => {
        const top = Object.entries(item.diagnoses)
          .sort(
            (a, b) =>
              b[1] - a[1] ||
              a[0].localeCompare(b[0])
          )[0];

        return {
          label: item.label,
          total: item.total,
          topDiagnosis:
            top?.[0] || "Unclassified",
          topDiagnosisCount: top?.[1] || 0,
        };
      })
      .sort(
        (a, b) =>
          b.total - a.total ||
          a.label.localeCompare(b.label)
      )
      .slice(0, 15);
  }, [filtered]);

  const phase6UrgencyOutcome = useMemo(() => {
    const groups = new Map();

    filtered.forEach((row) => {
      const urgency =
        formatClinicalLabel(row.urgency) ||
        "Not recorded";

      const status =
        getStatusLabel(row.status) ||
        "Not recorded";

      if (!groups.has(urgency)) {
        groups.set(urgency, {
          label: urgency,
          admitted: 0,
          discharged: 0,
          active: 0,
          total: 0,
        });
      }

      const item = groups.get(urgency);
      item.total += 1;

      if (row.status === "admitted") {
        item.admitted += 1;
      }

      if (row.status === "discharged") {
        item.discharged += 1;
      }

      if (
        [
          "sent",
          "acknowledged",
          "patient_arrived",
          "under_assessment",
        ].includes(row.status)
      ) {
        item.active += 1;
      }
    });

    return Array.from(groups.values())
      .sort(
        (a, b) =>
          b.total - a.total ||
          a.label.localeCompare(b.label)
      );
  }, [filtered]);

  const phase6MonthlyDiagnosis = useMemo(() => {
    const groups = new Map();

    filtered.forEach((row) => {
      if (!row.created_at) return;

      const date = new Date(row.created_at);
      if (Number.isNaN(date.getTime())) return;

      const key =
        `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

      const diagnosis =
        row.diagnosis_category?.trim() ||
        "Unclassified";

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: date.toLocaleDateString(
            undefined,
            {
              year: "numeric",
              month: "short",
            }
          ),
          total: 0,
          categories: {},
        });
      }

      const item = groups.get(key);
      item.total += 1;
      item.categories[diagnosis] =
        (item.categories[diagnosis] || 0) + 1;
    });

    return Array.from(groups.values())
      .sort((a, b) =>
        a.key.localeCompare(b.key)
      )
      .slice(-12);
  }, [filtered]);


  const displayRows = analysis === "diagnosis" && breakdown === "overall" ? diagnosisRows : rows;

  const classified = filtered.filter((row) => String(row.diagnosis_category || "").trim()).length;
  const withAge = filtered.filter((row) => Number.isFinite(Number(row.patient_age_months)) && Number(row.patient_age_months) >= 0).length;
  const withSex = filtered.filter((row) => String(row.patient_sex || "").trim()).length;

  const analysisOptions = [
    ["diagnosis", "Diagnosis", "Conditions, diagnosis status and categories"],
    ["patients", "Patient Demographics", "Age, sex and demographic distribution"],
    ["facilities", "Facilities", "Referring and receiving facility patterns"],
    ["providers", "Providers", "Provider/facility analysis where provider fields are available"],
    ["geography", "Geography / Area", "State, LGA and recorded facility geography"],
    ["outcomes", "Referral Outcomes", "Status, urgency and episode outcomes"],
    ["time", "Trends & Time", "Referral activity over the reporting period"],
  ];

  const breakdownOptions = {
    diagnosis: [
      ["overall", "Overall Diagnosis"], ["age", "By Age"], ["sex", "By Sex"], ["category", "By Diagnosis Category"],
      ["status", "By Diagnosis/Referral Status"], ["referring_facility", "By Referring Facility"],
      ["receiving_facility", "By Receiving Facility"], ["lga", "By LGA"], ["urgency", "By Urgency"],
    ],
    patients: [["age", "Age Groups"], ["sex", "Sex"], ["category", "Diagnosis Category"], ["status", "Referral Status"], ["urgency", "Urgency"]],
    facilities: [["referring_facility", "Referring Facility"], ["receiving_facility", "Receiving Facility"], ["lga", "LGA"], ["state", "State"], ["category", "Diagnosis Category"]],
    providers: [["referring_facility", "Referring Facility"], ["receiving_facility", "Receiving Facility"]],
    geography: [["state", "State"], ["lga", "LGA"], ["referring_facility", "Referring Facility"], ["receiving_facility", "Receiving Facility"]],
    outcomes: [["status", "Referral Status"], ["urgency", "Urgency"], ["category", "Diagnosis Category"], ["age", "Age Group"], ["sex", "Sex"]],
    time: [["status", "Referral Status"], ["category", "Diagnosis Category"], ["urgency", "Urgency"], ["referring_facility", "Referring Facility"]],
  };

  useEffect(() => {
    const options = breakdownOptions[analysis] || breakdownOptions.diagnosis;
    if (!options.some(([id]) => id === breakdown)) setBreakdown(options[0][0]);
  }, [analysis]);

  const activeBreakdowns = breakdownOptions[analysis] || breakdownOptions.diagnosis;

  return (
    <section className="analysis-hub">
      <div className="analysis-hub-header">
        <div>
          <span className="eyebrow">HEALTHCARE DATA INTELLIGENCE</span>
          <h2>Analysis Hub</h2>
          <p>Explore referral and clinical data by diagnosis, patient demographics, facilities, geography and outcomes.</p>
        </div>
        <button type="button" className="secondary-button" onClick={loadAnalysisData} disabled={loading}>
          {loading ? "Loading..." : "↻ Refresh Data"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="phase7-command-centre">
        <div className="phase7-command-heading">
          <div>
            <span className="eyebrow">
              PHASE 7 • ANALYTICS COMMAND CENTRE
            </span>
            <h3>
              Choose what you need to understand
            </h3>
            <p>
              Start with the overview, then move to clinical, population,
              facility, pathway, trend, quality or reporting views.
            </p>
          </div>

          <span className="phase7-step-hint">
            Recommended sequence: Overview → Clinical → Population → Facilities → Pathway → Trends → Quality → Reports
          </span>
        </div>

        <nav
          className="phase7-nav"
          aria-label="Analytics sections"
        >
          {phase7Sections.map(
            ([id, label], index) => (
              <button
                type="button"
                key={id}
                className={
                  phase7ActiveSection === id
                    ? "is-active"
                    : ""
                }
                onClick={() =>
                  phase7GoTo(id)
                }
              >
                <span>
                  {String(index + 1).padStart(2, "0")}
                </span>
                {label}
              </button>
            )
          )}
        </nav>
      </div>




      <div className="phase7-workflow-note">
        <strong>How to use this workspace</strong>
        <span>
          Use the navigation above to jump directly to a decision area.
          All calculations continue to use the same filtered, non-test
          referral dataset, so results remain consistent across sections.
        </span>
      </div>

      <div className="analysis-step-card">
        <div className="analysis-step-heading"><span>01</span><div><strong>Choose an analysis area</strong><small>Select what you want to understand.</small></div></div>
        <div className="analysis-choice-grid">
          {analysisOptions.map(([id, label, description]) => (
            <button type="button" key={id} className={`analysis-choice ${analysis === id ? "is-active" : ""}`} onClick={() => setAnalysis(id)}>
              <strong>{label}</strong><span>{description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="analysis-step-card">
        <div className="analysis-step-heading"><span>02</span><div><strong>Choose the breakdown</strong><small>Group the selected data by the dimension you need.</small></div></div>
        <div className="analysis-toolbar">
          <div className="analysis-breakdown-list">
            {activeBreakdowns.map(([id, label]) => (
              <button type="button" key={id} className={`analysis-chip ${breakdown === id ? "is-active" : ""}`} onClick={() => setBreakdown(id)}>{label}</button>
            ))}
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search within analysis..." aria-label="Search analysis data" />
        </div>
      </div>

      <div id="phase7-overview" className="analysis-kpi-grid phase7-anchor">
        <div className="stat-card"><span>Records Analysed</span><strong>{filtered.length.toLocaleString()}</strong><small>Current analysis scope</small></div>
        <div className="stat-card"><span>Diagnosis Classified</span><strong>{filtered.length ? `${((classified / filtered.length) * 100).toFixed(1)}%` : "0%"}</strong><small>{classified.toLocaleString()} classified records</small></div>
        <div className="stat-card"><span>Age Recorded</span><strong>{filtered.length ? `${((withAge / filtered.length) * 100).toFixed(1)}%` : "0%"}</strong><small>{withAge.toLocaleString()} records with age</small></div>
        <div className="stat-card"><span>Sex Recorded</span><strong>{filtered.length ? `${((withSex / filtered.length) * 100).toFixed(1)}%` : "0%"}</strong><small>{withSex.toLocaleString()} records with sex</small></div>
      </div>

      <div id="phase7-clinical" className="dashboard-card analysis-results-card phase7-anchor">
        <div className="form-header">
          <div><span className="eyebrow">03 • RESULTS</span><h3>{analysisOptions.find(([id]) => id === analysis)?.[1] || "Analysis"}</h3><p>{analysis === "diagnosis" ? `Diagnosis grouped ${activeBreakdowns.find(([id]) => id === breakdown)?.[1]?.toLowerCase() || "by selected dimension"}.` : `Records grouped ${activeBreakdowns.find(([id]) => id === breakdown)?.[1]?.toLowerCase() || "by selected dimension"}.`}</p></div>
          <span className="analysis-result-count">{displayRows.length} groups</span>
        </div>
        {loading ? <div className="empty-state">Loading analysis data...</div> : displayRows.length ? (
          <div className="analysis-table-wrap">
            <table className="analysis-table"><thead><tr><th>Group</th><th>Records</th><th>Share</th><th>Top Diagnosis</th><th>Distribution</th></tr></thead><tbody>
              {displayRows.map((row) => <tr key={row.label}><td><strong>{row.label}</strong></td><td>{row.count.toLocaleString()}</td><td>{row.percentage}%</td><td>{row.topDiagnosis}{row.topDiagnosisCount > 1 ? ` (${row.topDiagnosisCount})` : ""}</td><td><div className="analysis-bar-track"><span style={{ width: `${Math.min(row.percentage, 100)}%` }} /></div></td></tr>)}
            </tbody></table>
          </div>
        ) : <div className="empty-state">No records match the current analysis scope.</div>}
      </div>


      <div className="dashboard-card cross-analysis-card">
        <div className="form-header">
          <div>
            <span className="eyebrow">
              04 • CROSS ANALYSIS
            </span>
            <h3>
              {crossDefinition.title}
            </h3>
            <p>
              A two-dimensional view for identifying patterns across
              the current filtered dataset.
            </p>
          </div>
        </div>

        {crossTabulation.length ? (
          <div className="analysis-table-wrap">
            <table className="analysis-table cross-analysis-table">
              <thead>
                <tr>
                  <th>{crossDefinition.rowLabel}</th>
                  {crossDefinition.columnLabels.map(
                    (label) => (
                      <th key={label}>
                        {label}
                      </th>
                    )
                  )}
                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                {crossTabulation.map((row) => (
                  <tr key={row.label}>
                    <td>
                      <strong>
                        {row.label}
                      </strong>
                    </td>

                    {crossDefinition.columnLabels.map(
                      (column) => (
                        <td key={column}>
                          {row.values[column] || 0}
                        </td>
                      )
                    )}

                    <td>
                      <strong>
                        {row.total}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            There is not enough data to generate a cross-analysis.
          </div>
        )}
      </div>

      <div className="dashboard-card validation-card">
        <div className="form-header">
          <div>
            <span className="eyebrow">
              05 • DATA VALIDATION
            </span>
            <h3>
              Healthcare Data Quality
            </h3>
            <p>
              Automated checks for missing fields, invalid values,
              duplicate referral numbers and timeline inconsistencies.
            </p>
          </div>

          <span
            className={`validation-status ${
              validationSummary.issueCount
                ? "has-issues"
                : "is-clean"
            }`}
          >
            {validationSummary.issueCount
              ? `${validationSummary.issueCount} issue${
                  validationSummary.issueCount === 1
                    ? ""
                    : "s"
                }`
              : "No detected issues"}
          </span>
        </div>

        <div className="validation-metrics">
          <div>
            <span>Missing age</span>
            <strong>
              {validationSummary.missing.age}
            </strong>
          </div>

          <div>
            <span>Missing sex</span>
            <strong>
              {validationSummary.missing.sex}
            </strong>
          </div>

          <div>
            <span>Missing diagnosis</span>
            <strong>
              {validationSummary.missing.diagnosis}
            </strong>
          </div>

          <div>
            <span>Missing category</span>
            <strong>
              {validationSummary.missing.category}
            </strong>
          </div>

          <div>
            <span>Incomplete facility pair</span>
            <strong>
              {validationSummary.missing.facility}
            </strong>
          </div>
        </div>

        {validationSummary.findings.length > 0 ? (
          <div className="validation-findings">
            {validationSummary.findings
              .slice(0, 15)
              .map((finding, index) => (
                <div
                  className="validation-finding"
                  key={`${finding.type}-${finding.field}-${finding.referral}-${index}`}
                >
                  <strong>
                    {finding.type}
                  </strong>
                  <span>
                    {finding.field} ·{" "}
                    {finding.referral ||
                      "record"}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <div className="validation-clean-message">
            The current filtered dataset passed the available automated
            validation checks.
          </div>
        )}

        {validationSummary.findings.length > 15 && (
          <p className="analysis-result-footnote">
            Showing the first 15 findings. Narrow the analysis scope
            to investigate a smaller dataset.
          </p>
        )}
      </div>


      <div id="phase7-pathway" className="dashboard-card intelligence-card phase7-anchor">
        <div className="form-header intelligence-header">
          <div>
            <span className="eyebrow">
              PHASE 4 • HEALTHCARE INTELLIGENCE
            </span>
            <h3>
              Executive Referral Performance
            </h3>
            <p>
              A decision-ready summary of referral volume, pathway
              performance and turnaround time for the current filters.
            </p>
          </div>

          <div className="intelligence-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={phase4ExportCsv}
              disabled={!filtered.length}
            >
              Export CSV
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={phase4PrintReport}
            >
              Print Report
            </button>
          </div>
        </div>

        <div className="intelligence-kpi-grid">
          <div className="intelligence-kpi">
            <span>Total Referrals</span>
            <strong>{phase4Kpis.total}</strong>
            <small>
              {phase4Kpis.active} currently active
            </small>
          </div>

          <div className="intelligence-kpi">
            <span>Acknowledgement Rate</span>
            <strong>
              {phase4Kpis.acknowledgementRate.toFixed(1)}%
            </strong>
            <small>
              {phase4Kpis.acknowledged} of {phase4Kpis.total}
            </small>
          </div>

          <div className="intelligence-kpi">
            <span>Assessment Rate</span>
            <strong>
              {phase4Kpis.assessmentRate.toFixed(1)}%
            </strong>
            <small>
              {phase4Kpis.assessed} assessments recorded
            </small>
          </div>

          <div className="intelligence-kpi">
            <span>Episode Completion</span>
            <strong>
              {phase4Kpis.completionRate.toFixed(1)}%
            </strong>
            <small>
              {phase4Kpis.completedEpisodes} completed/discharged
            </small>
          </div>
        </div>

        <div className="intelligence-secondary-grid">
          <div>
            <span>Median time to acknowledgement</span>
            <strong>
              {phase4Kpis.medianAcknowledgement === null
                ? "—"
                : `${phase4Kpis.medianAcknowledgement.toFixed(2)} h`}
            </strong>
          </div>

          <div>
            <span>Median time to assessment</span>
            <strong>
              {phase4Kpis.medianAssessment === null
                ? "—"
                : `${phase4Kpis.medianAssessment.toFixed(2)} h`}
            </strong>
          </div>

          <div>
            <span>Median episode duration</span>
            <strong>
              {phase4Kpis.medianEpisode === null
                ? "—"
                : `${phase4Kpis.medianEpisode.toFixed(2)} h`}
            </strong>
          </div>

          <div>
            <span>Discharged / admitted</span>
            <strong>
              {phase4Kpis.discharged} / {phase4Kpis.admitted}
            </strong>
          </div>
        </div>
      </div>

      <div className="dashboard-card intelligence-card">
        <div className="form-header">
          <div>
            <span className="eyebrow">
              PATTERN ANALYSIS
            </span>
            <h3>
              Diagnosis, Demographics & Facility Patterns
            </h3>
            <p>
              Cross-check clinical burden against patient demographics
              and referral-source performance.
            </p>
          </div>
        </div>

        <div className="intelligence-panel-grid">
          <div className="intelligence-panel">
            <h4>Diagnosis × Sex</h4>

            {phase4DiagnosisSex.length ? (
              <div className="analysis-table-wrap">
                <table className="analysis-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Male</th>
                      <th>Female</th>
                      <th>Not recorded</th>
                    </tr>
                  </thead>

                  <tbody>
                    {phase4DiagnosisSex.map(
                      (row) => (
                        <tr key={row.label}>
                          <td>
                            <strong>{row.label}</strong>
                          </td>
                          <td>{row.Male}</td>
                          <td>{row.Female}</td>
                          <td>{row["Not recorded"]}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                No diagnosis/sex data available.
              </div>
            )}
          </div>

          <div className="intelligence-panel">
            <h4>Diagnosis × Age Group</h4>

            {phase4AgeDiagnosis.length ? (
              <div className="analysis-table-wrap">
                <table className="analysis-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>0–4</th>
                      <th>5–14</th>
                      <th>15–24</th>
                      <th>25–44</th>
                      <th>45–64</th>
                      <th>65+</th>
                    </tr>
                  </thead>

                  <tbody>
                    {phase4AgeDiagnosis.map(
                      (row) => (
                        <tr key={row.label}>
                          <td>
                            <strong>{row.label}</strong>
                          </td>
                          <td>{row.values["0–4 years"]}</td>
                          <td>{row.values["5–14 years"]}</td>
                          <td>{row.values["15–24 years"]}</td>
                          <td>{row.values["25–44 years"]}</td>
                          <td>{row.values["45–64 years"]}</td>
                          <td>{row.values["65+ years"]}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                No diagnosis/age data available.
              </div>
            )}
          </div>
        </div>
      </div>

      <div id="phase7-reports" className="dashboard-card intelligence-card phase7-anchor">
        <div className="form-header">
          <div>
            <span className="eyebrow">
              FACILITY INTELLIGENCE
            </span>
            <h3>
              Referral Source Performance
            </h3>
            <p>
              Top referring facilities in the current analysis scope,
              with outcome counts shown alongside referral volume.
            </p>
          </div>
        </div>

        {phase4FacilityData.length ? (
          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Referring Facility</th>
                  <th>Referrals</th>
                  <th>Admitted</th>
                  <th>Discharged</th>
                  <th>Admission %</th>
                  <th>Discharge %</th>
                </tr>
              </thead>

              <tbody>
                {phase4FacilityData.map(
                  (row) => (
                    <tr key={row.label}>
                      <td>
                        <strong>{row.label}</strong>
                      </td>
                      <td>{row.referrals}</td>
                      <td>{row.admitted}</td>
                      <td>{row.discharged}</td>
                      <td>
                        {row.referrals
                          ? (
                              (row.admitted /
                                row.referrals) *
                              100
                            ).toFixed(1)
                          : "0.0"}%
                      </td>
                      <td>
                        {row.referrals
                          ? (
                              (row.discharged /
                                row.referrals) *
                              100
                            ).toFixed(1)
                          : "0.0"}%
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            No facility data available.
          </div>
        )}
      </div>

      <div className="dashboard-card intelligence-card">
        <div className="form-header">
          <div>
            <span className="eyebrow">
              TIME SERIES
            </span>
            <h3>
              Monthly Referral Trend
            </h3>
            <p>
              Last 12 available months in the current filtered dataset.
            </p>
          </div>
        </div>

        {phase4TrendData.length ? (
          <div className="trend-table">
            {phase4TrendData.map(
              (row) => {
                const max =
                  Math.max(
                    ...phase4TrendData.map(
                      (item) =>
                        item.referrals
                    ),
                    1
                  );

                return (
                  <div
                    className="trend-row"
                    key={row.key}
                  >
                    <span className="trend-label">
                      {row.label}
                    </span>

                    <div className="trend-track">
                      <div
                        className="trend-fill"
                        style={{
                          width: `${Math.max(
                            3,
                            (row.referrals /
                              max) *
                              100
                          )}%`,
                        }}
                      />
                    </div>

                    <strong>
                      {row.referrals}
                    </strong>
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <div className="empty-state">
            No dated referral records are available.
          </div>
        )}
      </div>


      <div id="phase7-quality" className="dashboard-card governance-card phase7-anchor">
        <div className="form-header governance-header">
          <div>
            <span className="eyebrow">
              PHASE 5 • DATA QUALITY & CLINICAL GOVERNANCE
            </span>
            <h3>
              Governance & Validation Control Centre
            </h3>
            <p>
              Automated safeguards for clinical consistency, data quality,
              chronology and privacy-aware analytical use.
            </p>
          </div>

          <div className="governance-actions">
            <span
              className={`governance-score ${
                phase5GovernanceSummary.cleanRate >= 95
                  ? "governance-good"
                  : phase5GovernanceSummary.cleanRate >= 80
                  ? "governance-watch"
                  : "governance-action"
              }`}
            >
              {phase5GovernanceSummary.cleanRate.toFixed(1)}% clean
            </span>

            <button
              type="button"
              className="secondary-button"
              onClick={phase5ExportGovernanceReport}
            >
              Export Governance Report
            </button>
          </div>
        </div>

        <div className="governance-metrics">
          <div>
            <span>Records checked</span>
            <strong>
              {phase5GovernanceSummary.total}
            </strong>
          </div>

          <div className="governance-high">
            <span>High priority</span>
            <strong>
              {phase5GovernanceSummary.high}
            </strong>
          </div>

          <div className="governance-medium">
            <span>Medium priority</span>
            <strong>
              {phase5GovernanceSummary.medium}
            </strong>
          </div>

          <div className="governance-low">
            <span>Low priority</span>
            <strong>
              {phase5GovernanceSummary.low}
            </strong>
          </div>

          <div>
            <span>Records affected</span>
            <strong>
              {phase5GovernanceSummary.affectedReferrals}
            </strong>
          </div>
        </div>

        <div className="governance-role-panel">
          <div>
            <span className="eyebrow">
              ROLE-AWARE GUIDANCE
            </span>
            <h4>
              {phase5RoleGuidance.title}
            </h4>
          </div>

          <p>
            {phase5RoleGuidance.text}
          </p>
        </div>

        {phase5GovernanceFindings.length ? (
          <div className="governance-findings">
            <div className="governance-findings-heading">
              <div>
                <span className="eyebrow">
                  VALIDATION FINDINGS
                </span>
                <h4>
                  Issues requiring review
                </h4>
              </div>

              <span className="analysis-result-count">
                {phase5GovernanceSummary.issueCount} findings
              </span>
            </div>

            <div className="governance-finding-list">
              {phase5GovernanceFindings
                .slice(0, 20)
                .map((finding, index) => (
                  <div
                    className={`governance-finding governance-${finding.severity}`}
                    key={`${finding.type}-${finding.field}-${finding.referral}-${index}`}
                  >
                    <div>
                      <strong>
                        {finding.type}
                      </strong>
                      <span>
                        {finding.field} ·{" "}
                        {finding.referral}
                      </span>
                    </div>

                    <p>
                      {finding.detail}
                    </p>
                  </div>
                ))}
            </div>

            {phase5GovernanceFindings.length > 20 && (
              <p className="analysis-result-footnote">
                Showing the first 20 findings. Use the governance report
                export for the complete machine-readable validation output.
              </p>
            )}
          </div>
        ) : (
          <div className="validation-clean-message">
            No governance issues were detected in the current filtered
            dataset.
          </div>
        )}
      </div>


      <div id="phase7-population" className="dashboard-card phase6-card phase7-anchor">
        <div className="form-header phase6-header">
          <div>
            <span className="eyebrow">
              PHASE 6 • ADVANCED CLINICAL & POPULATION ANALYTICS
            </span>
            <h3>
              Multi-Dimensional Explorer
            </h3>
            <p>
              Compare two healthcare dimensions at the same time. This
              is designed for clinical, programme and public-health
              questions without requiring statistical software.
            </p>
          </div>
        </div>

        <div className="phase6-selector-grid">
          <label>
            <span>Rows</span>
            <select
              value={phase6MatrixDimension}
              onChange={(event) =>
                setPhase6MatrixDimension(event.target.value)
              }
            >
              {phase6DimensionOptions.map(
                ([id, label]) => (
                  <option
                    value={id}
                    key={id}
                    disabled={
                      id === phase6MatrixColumn
                    }
                  >
                    {label}
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            <span>Columns</span>
            <select
              value={phase6MatrixColumn}
              onChange={(event) =>
                setPhase6MatrixColumn(event.target.value)
              }
            >
              {phase6DimensionOptions.map(
                ([id, label]) => (
                  <option
                    value={id}
                    key={id}
                    disabled={
                      id === phase6MatrixDimension
                    }
                  >
                    {label}
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        {phase6Matrix.rows.length ? (
          <div className="analysis-table-wrap phase6-matrix-wrap">
            <table className="analysis-table phase6-matrix">
              <thead>
                <tr>
                  <th>
                    {
                      phase6DimensionOptions.find(
                        ([id]) =>
                          id ===
                          phase6MatrixDimension
                      )?.[1]
                    }
                  </th>

                  {phase6Matrix.columns.map(
                    (column) => (
                      <th key={column}>
                        {column}
                      </th>
                    )
                  )}

                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                {phase6Matrix.rows.map(
                  (row) => (
                    <tr key={row.label}>
                      <td>
                        <strong>
                          {row.label}
                        </strong>
                      </td>

                      {phase6Matrix.columns.map(
                        (column) => (
                          <td key={column}>
                            {row.values[column] || 0}
                          </td>
                        )
                      )}

                      <td>
                        <strong>
                          {row.total}
                        </strong>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            No records are available for the selected dimensions.
          </div>
        )}
      </div>

      <div id="phase7-facilities" className="dashboard-card phase6-card phase7-anchor">
        <div className="form-header">
          <div>
            <span className="eyebrow">
              POPULATION & AREA INTELLIGENCE
            </span>
            <h3>
              Diagnosis Burden by Area
            </h3>
            <p>
              Uses referring-facility LGA data where available. It does
              not infer geography from patient names or free-text fields.
            </p>
          </div>
        </div>

        {phase6DiagnosisByArea.length ? (
          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Area / LGA</th>
                  <th>Referrals</th>
                  <th>Leading Diagnosis Category</th>
                  <th>Leading Category Count</th>
                  <th>Share of Area</th>
                </tr>
              </thead>

              <tbody>
                {phase6DiagnosisByArea.map(
                  (row) => (
                    <tr key={row.label}>
                      <td>
                        <strong>{row.label}</strong>
                      </td>
                      <td>{row.total}</td>
                      <td>
                        {row.topDiagnosis}
                      </td>
                      <td>
                        {row.topDiagnosisCount}
                      </td>
                      <td>
                        {row.total
                          ? (
                              (row.topDiagnosisCount /
                                row.total) *
                              100
                            ).toFixed(1)
                          : "0.0"}%
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            No area data are available in the current filtered dataset.
          </div>
        )}
      </div>

      <div className="dashboard-card phase6-card">
        <div className="form-header">
          <div>
            <span className="eyebrow">
              URGENCY & OUTCOME
            </span>
            <h3>
              Urgency-to-Outcome Profile
            </h3>
            <p>
              Compare urgency levels against admission, discharge and
              currently active referral states.
            </p>
          </div>
        </div>

        {phase6UrgencyOutcome.length ? (
          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Urgency</th>
                  <th>Total</th>
                  <th>Active</th>
                  <th>Admitted</th>
                  <th>Discharged</th>
                  <th>Admission %</th>
                </tr>
              </thead>

              <tbody>
                {phase6UrgencyOutcome.map(
                  (row) => (
                    <tr key={row.label}>
                      <td>
                        <strong>{row.label}</strong>
                      </td>
                      <td>{row.total}</td>
                      <td>{row.active}</td>
                      <td>{row.admitted}</td>
                      <td>{row.discharged}</td>
                      <td>
                        {row.total
                          ? (
                              (row.admitted /
                                row.total) *
                              100
                            ).toFixed(1)
                          : "0.0"}%
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            No urgency/outcome data are available.
          </div>
        )}
      </div>

      <div id="phase7-trends" className="dashboard-card phase6-card phase7-anchor">
        <div className="form-header">
          <div>
            <span className="eyebrow">
              CLINICAL TREND
            </span>
            <h3>
              Monthly Diagnosis Pattern
            </h3>
            <p>
              Monthly referral volume with the leading diagnosis
              category for each month.
            </p>
          </div>
        </div>

        {phase6MonthlyDiagnosis.length ? (
          <div className="phase6-month-grid">
            {phase6MonthlyDiagnosis.map(
              (month) => {
                const top =
                  Object.entries(
                    month.categories
                  ).sort(
                    (a, b) =>
                      b[1] - a[1] ||
                      a[0].localeCompare(b[0])
                  )[0];

                return (
                  <div
                    className="phase6-month-card"
                    key={month.key}
                  >
                    <span>
                      {month.label}
                    </span>
                    <strong>
                      {month.total}
                    </strong>
                    <small>
                      referrals
                    </small>

                    <div>
                      <b>
                        {top?.[0] ||
                          "Unclassified"}
                      </b>
                      <em>
                        {top?.[1] || 0}
                      </em>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <div className="empty-state">
            No monthly clinical trend can be calculated.
          </div>
        )}
      </div>

      <div className="analysis-note-card">
        <strong>Data interpretation</strong>
        <span>Analysis excludes records explicitly marked as test data. Missing fields remain visible as “not recorded” or “unclassified” rather than being silently removed.</span>
      </div>
    </section>
  );
}
export default AnalysisHub;