
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { cacheValue, createClientId, getCachedValue, getQueueCount, getOfflineKeyVaultEnvelope, saveOfflineKeyVaultEnvelope, queueEncryptedReferral, migratePlaintextQueueToEncrypted, syncQueuedReferrals } from "./lib/offlineReferralQueue.js";
import { createOfflineKeyVault, unlockOfflineKeyVault } from "./lib/offlineQueueKeyVault.js";
import { createOfflineVaultLockChannel } from "./lib/offlineVaultLockChannel.js";
import { isAcknowledgementOverdue as isAckOverdue, isOpenIncomingReferral, sortIncomingReferralsByPriority } from "./lib/referralPriority.js";
import { LanguageSwitcher, useLanguage } from "./lib/i18n.jsx";
import AdminDashboard from "./components/dashboards/AdminDashboard.jsx";
import "./App.css";
import "./reflink-theme-professional.css";
import "./reflink-branding.css";
import "./reflink-human-centered-ux.css";
import "./reflink-dashboard-refinement.css";
import "./reflink-referral-detail-ux.css";
import "./reflink-investigation-results-ux.css";
import "./reflink-workspace-quality.css";

function formatPatientAge(ageInMonths) {
  const months = Number(ageInMonths);
  if (!Number.isFinite(months) || months < 0) return "Age not recorded";
  const wholeMonths = Math.floor(months);
  if (wholeMonths < 12) return `${wholeMonths} ${wholeMonths === 1 ? "month" : "months"}`;
  const years = Math.floor(wholeMonths / 12);
  const remainingMonths = wholeMonths % 12;
  if (remainingMonths === 0) return `${years} ${years === 1 ? "year" : "years"}`;
  return `${years} ${years === 1 ? "year" : "years"} ${remainingMonths} ${remainingMonths === 1 ? "month" : "months"}`;
}

function normalizePatientAgeToMonths(value, unit) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return unit === "years" ? Math.round(numeric * 12) : Math.round(numeric);
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

function formatReferralDateTime(value) {
  if (!value) return "Awaiting update";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Invalid date"
    : date.toLocaleString();
}


const REFLINK_ROLE_LABELS = {
  phc_staff: "PHC Staff",
  receiving_staff: "Receiving Facility",
  administrator: "Administrator",
};

function getApplicationRole(role) {
  return REFLINK_ROLE_LABELS[String(role || "").trim().toLowerCase()] || null;
}

function isTransientAuthError(error) {
  const message = String(error?.message || error?.details || error || "");
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return offline || /failed to fetch|network|offline|timeout|timed out|503|502|504|err_internet_disconnected|load failed/i.test(message);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDiagnosisRecords(records, fallback = "") {
  const parsed = Array.isArray(records) ? records : parseJsonArray(records);

  if (parsed.length > 0) {
    return parsed
      .map((item) => {
        if (typeof item === "string") return item;
        const status = item?.status ? `${item.status}: ` : "";
        const diagnosis = item?.diagnosis || item?.name || "";
        const category = item?.category ? ` (${item.category})` : "";
        return `${status}${diagnosis}${category}`;
      })
      .filter(Boolean)
      .join(" • ");
  }

  return fallback || "Not recorded";
}

function formatDiagnosisSummary(records, fallback = "", maxItems = 2) {
  const parsed = Array.isArray(records) ? records : parseJsonArray(records);

  if (parsed.length > 0) {
    const names = parsed
      .map((item) =>
        typeof item === "string" ? item : item?.diagnosis || item?.name || ""
      )
      .filter(Boolean);

    if (!names.length) return fallback || "Not recorded";

    const shown = names.slice(0, maxItems).join(", ");
    const remaining = names.length - maxItems;

    return remaining > 0 ? `${shown} +${remaining} more` : shown;
  }

  return fallback || "Not recorded";
}

function formatInvestigationRecords(records, fallback = "") {
  const parsed = Array.isArray(records) ? records : parseJsonArray(records);

  if (parsed.length > 0) {
    return parsed
      .map((item) => {
        if (typeof item === "string") return item;
        const investigation = item?.investigation || item?.name || "";
        const category = item?.category ? ` (${item.category})` : "";
        return `${investigation}${category}`;
      })
      .filter(Boolean)
      .join(" • ");
  }

  return fallback || "Not recorded";
}

function getDiagnosisRecords(referral) {
  const records = Array.isArray(referral?.diagnosis_records)
    ? referral.diagnosis_records
    : parseJsonArray(referral?.diagnosis_records);

  if (records.length) return records;

  const diagnoses = String(referral?.provisional_diagnosis || "")
    .split(" • ")
    .map((item) => item.trim())
    .filter(Boolean);

  return diagnoses.map((diagnosis) => ({
    status: referral?.diagnosis_status || "",
    category: referral?.diagnosis_category || "",
    diagnosis,
  }));
}

function getInvestigationRecords(referral) {
  const records = Array.isArray(referral?.investigation_records)
    ? referral.investigation_records
    : parseJsonArray(referral?.investigation_records);

  if (records.length) return records;

  return String(referral?.investigations || "")
    .split(" • ")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((investigation) => ({ category: "", investigation }));
}


function formatClinicalLabel(value) {
  if (!value) return "Not recorded";

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}


function getInvestigationResultConfig(investigation = "") {
  const name = String(investigation || "").toLowerCase();

  if (
    name.includes("blood group") ||
    name.includes("blood grouping") ||
    name.includes("abo/rh") ||
    name.includes("rh typing")
  ) {
    return {
      type: "blood_group",
      label: "Blood group (ABO/Rh)",
      statuses: ["pending", "result_recorded", "invalid", "not_performed"],
      defaultUnit: "",
    };
  }

  if (name.includes("blood pressure") || name === "bp") {
    return {
      type: "blood_pressure",
      label: "Blood pressure",
      statuses: ["pending", "within_range", "low", "high", "critical", "invalid", "not_performed"],
      defaultUnit: "mmHg",
    };
  }

  if (name.includes("electrolyte")) {
    return {
      type: "electrolytes",
      label: "Electrolyte panel",
      statuses: ["pending", "within_range", "abnormal", "critical", "invalid", "not_performed"],
      defaultUnit: "mmol/L",
    };
  }

  if (name.includes("full blood count") || name === "fbc" || name.includes("complete blood count")) {
    return {
      type: "fbc_panel",
      label: "Full blood count panel",
      statuses: ["pending", "within_range", "abnormal", "low", "high", "critical", "invalid", "not_performed"],
      defaultUnit: "",
    };
  }

  if (name.includes("haemoglobin") || name.includes("hemoglobin")) {
    return {
      type: "quantitative",
      label: "Haemoglobin measurement",
      statuses: ["pending", "within_range", "low", "high", "critical", "invalid", "not_performed"],
      defaultUnit: "g/dL",
    };
  }

  if (name.includes("pcv") || name.includes("packed cell volume")) {
    return {
      type: "quantitative",
      label: "Packed cell volume",
      statuses: ["pending", "within_range", "low", "high", "critical", "invalid", "not_performed"],
      defaultUnit: "%",
    };
  }

  const quantitativeConfig = [
    { terms: ["white blood cell", "wbc"], unit: "10^9/L" },
    { terms: ["platelet"], unit: "10^9/L" },
    { terms: ["urea"], unit: "mmol/L" },
    { terms: ["creatinine"], unit: "µmol/L" },
    { terms: ["temperature"], unit: "°C" },
    { terms: ["pulse rate", "heart rate"], unit: "bpm" },
    { terms: ["respiratory rate"], unit: "breaths/min" },
    { terms: ["oxygen saturation", "spo2", "spO₂".toLowerCase()], unit: "%" },
    { terms: ["blood glucose", "serum glucose", "glucose"], unit: "mmol/L" },
    { terms: ["sodium", "potassium", "chloride", "bicarbonate"], unit: "mmol/L" },
    { terms: ["specific gravity"], unit: "" },
    { terms: ["ph"], unit: "" },
    { terms: ["albumin"], unit: "g/L" },
    { terms: ["bilirubin"], unit: "µmol/L" },
    { terms: ["ast", "alt", "alkaline phosphatase"], unit: "U/L" },
    { terms: ["titer"], unit: "" },
  ];

  const quantitativeMatch = quantitativeConfig.find(({ terms }) =>
    terms.some((term) => name.includes(term))
  );
  if (quantitativeMatch) {
    return {
      type: "quantitative",
      label: "Measured value",
      statuses: ["pending", "within_range", "low", "high", "critical", "invalid", "not_performed"],
      defaultUnit: quantitativeMatch.unit,
    };
  }

  if (name.includes("urinalysis") || name.includes("urine analysis")) {
    return {
      type: "panel",
      label: "Urinalysis panel",
      statuses: ["pending", "normal", "abnormal", "inconclusive", "not_performed"],
      defaultUnit: "",
    };
  }

  if (name.includes("blood culture") || name.includes("urine microscopy/culture") || name.includes("culture") || name.includes("microbiology") || name.includes("sputum") || name.includes("stool microscopy")) {
    return {
      type: "microbiology",
      label: "Microbiology result",
      statuses: ["pending", "growth_detected", "no_growth", "detected", "not_detected", "contaminated", "inconclusive", "not_performed"],
      defaultUnit: "",
    };
  }

  if (name.includes("cross-match") || name.includes("crossmatch")) {
    return {
      type: "qualitative",
      label: "Cross-match result",
      statuses: ["pending", "compatible", "incompatible", "inconclusive", "invalid", "not_performed"],
      defaultUnit: "",
    };
  }

  if (name.includes("hiv") || name.includes("hepatitis")) {
    return {
      type: "qualitative",
      label: "Screening result",
      statuses: ["pending", "reactive", "non_reactive", "indeterminate", "invalid", "not_performed"],
      defaultUnit: "",
    };
  }

  if (name.includes("ultrasound") || name.includes("x-ray") || name.includes("xray") || name.includes("ct scan") || name.includes("mri") || name.includes("imaging")) {
    return {
      type: "imaging",
      label: "Imaging report",
      statuses: ["pending", "no_significant_abnormality", "abnormal_finding", "inconclusive", "not_performed"],
      defaultUnit: "",
    };
  }

  return {
    type: "qualitative",
    label: "Qualitative result",
    statuses: ["pending", "positive", "negative", "reactive", "non_reactive", "indeterminate", "invalid", "not_performed"],
    defaultUnit: "",
  };
}

const INVESTIGATION_STATUS_LABELS = {
  result_recorded: "Result Recorded",
  compatible: "Compatible",
  incompatible: "Incompatible",
  pending: "Pending / Not Yet Available",
  within_range: "Within Reference Range",
  low: "Below Reference Range",
  high: "Above Reference Range",
  critical: "Critical",
  invalid: "Invalid",
  normal: "Normal",
  abnormal: "Abnormal",
  inconclusive: "Inconclusive",
  not_performed: "Not Performed",
  positive: "Positive",
  negative: "Negative",
  reactive: "Reactive",
  non_reactive: "Non-reactive",
  indeterminate: "Indeterminate",
  growth_detected: "Growth Detected",
  no_growth: "No Growth",
  detected: "Detected",
  not_detected: "Not Detected",
  contaminated: "Contaminated / Repeat Required",
  no_significant_abnormality: "No Significant Abnormality",
  abnormal_finding: "Abnormal Finding",
};

function getInvestigationResultLabel(status) {
  return INVESTIGATION_STATUS_LABELS[status] || formatClinicalLabel(status || "pending");
}

function getInvestigationResultSummary(item) {
  if (!item) return "";
  const config = getInvestigationResultConfig(item.investigation);

  if (config.type === "blood_group") {
    return item.result_value || "";
  }

  if (config.type === "blood_pressure") {
    if (item.systolic || item.diastolic) {
      return `${item.systolic || "—"}/${item.diastolic || "—"} mmHg`;
    }
    return item.result_value || "";
  }

  if (config.type === "electrolytes") {
    const components = [
      ["Na⁺", item.sodium],
      ["K⁺", item.potassium],
      ["Cl⁻", item.chloride],
      ["HCO₃⁻", item.bicarbonate],
    ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([label, value]) => `${label}: ${value} mmol/L`);
    return components.join(" · ") || item.result_value || "";
  }

  if (config.type === "fbc_panel") {
    const components = [
      ["Hb", item.haemoglobin, "g/dL"],
      ["PCV", item.pcv, "%"],
      ["WBC", item.wbc, "10^9/L"],
      ["Platelets", item.platelets, "10^9/L"],
    ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([label, value, unit]) => `${label}: ${value} ${unit}`);
    if (item.result_value) components.push(String(item.result_value));
    return components.join(" · ");
  }

  if (!item.result_value) return "";
  return [String(item.result_value), item.result_unit || config.defaultUnit || ""].filter(Boolean).join(" ");
}

function parseNumericReferenceRange(referenceRange) {
  const match = String(referenceRange || "")
    .replace(/,/g, ".")
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:-|–|—|\bto\b)\s*(-?\d+(?:\.\d+)?)/i);

  if (!match) return null;

  const lower = Number(match[1]);
  const upper = Number(match[2]);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) return null;
  return { lower, upper };
}

const NUMERIC_RESULT_CLASSIFICATION_STATUSES = new Set([
  "within_range",
  "low",
  "high",
  "critical",
]);

function getInvestigationValidationMessage(item) {
  if (!item) return "";

  const config = getInvestigationResultConfig(item.investigation);
  const status = String(item.result_status || "pending");

  if (config.type === "blood_pressure") {
    const systolicRaw = String(item.systolic ?? "").trim();
    const diastolicRaw = String(item.diastolic ?? "").trim();

    const classified =
      NUMERIC_RESULT_CLASSIFICATION_STATUSES.has(status);

    if (!systolicRaw && !diastolicRaw && !classified) return "";

    if (!systolicRaw || !diastolicRaw) {
      return "Enter both systolic and diastolic values before classifying the blood-pressure result.";
    }

    const systolic = Number(systolicRaw.replace(/,/g, "."));
    const diastolic = Number(diastolicRaw.replace(/,/g, "."));

    if (
      !Number.isFinite(systolic) ||
      !Number.isFinite(diastolic) ||
      systolic <= 0 ||
      diastolic <= 0
    ) {
      return "Both blood-pressure measurements must be positive numbers.";
    }

    if (systolic <= diastolic) {
      return "Verify the entries: systolic pressure must be greater than diastolic pressure.";
    }

    return "";
  }

  if (config.type !== "quantitative") return "";

  if (!NUMERIC_RESULT_CLASSIFICATION_STATUSES.has(status)) {
    return "";
  }

  const rawValue = String(item.result_value ?? "").trim();

  if (!rawValue) {
    return "Measurement not recorded. Enter the numerical result before selecting this classification.";
  }

  const value = Number(rawValue.replace(/,/g, "."));

  if (!Number.isFinite(value)) {
    return "Enter a valid numerical measurement before classifying this result.";
  }

  // A critical result requires a recorded measurement.
  // REFLINK does not automatically determine critical thresholds.
  if (status === "critical") return "";

  const bounds = parseNumericReferenceRange(item.reference_range);

  if (!bounds) {
    return "Reference range required. Enter the range supplied by the performing laboratory and verify the selected status.";
  }

  if (
    status === "within_range" &&
    (value < bounds.lower || value > bounds.upper)
  ) {
    return `Status mismatch: ${value} is outside the entered reference range ${bounds.lower}–${bounds.upper}.`;
  }

  if (status === "low" && value >= bounds.lower) {
    return `Status mismatch: ${value} is not below the entered reference range ${bounds.lower}–${bounds.upper}.`;
  }

  if (status === "high" && value <= bounds.upper) {
    return `Status mismatch: ${value} is not above the entered reference range ${bounds.lower}–${bounds.upper}.`;
  }

  return "";
}

function getInvestigationResultClass(status) {
  if (["positive", "reactive", "growth_detected", "abnormal", "abnormal_finding", "high", "low", "critical"].includes(status)) return "investigation-result-positive";
  if (["negative", "non_reactive", "no_growth", "not_detected", "normal", "within_range", "no_significant_abnormality"].includes(status)) return "investigation-result-negative";
  return "investigation-result-pending";
}

function normalizeInvestigationRecord(item) {
  if (typeof item === "string") {
    return { category: "", investigation: item, result_status: "pending", result_value: "", result_unit: "", reference_range: "", interpretation: "", result_notes: "", result_file_path: "", result_file_name: "", result_file_type: "", result_file_size: null };
  }
  const investigation = item?.investigation || item?.name || "Investigation";
  const config = getInvestigationResultConfig(investigation);
  const storedValue = item?.result_value || "";
  let storedStatus = item?.result_status || "pending";

  // Old builds incorrectly represented ABO/Rh typing as positive/negative.
  // Treat those legacy records as needing a real group value instead of displaying a false result.
  if (config.type === "blood_group") {
    if (storedValue && storedStatus !== "result_recorded" && storedStatus !== "invalid" && storedStatus !== "not_performed") {
      storedStatus = "result_recorded";
    } else if (!storedValue && ["positive", "negative"].includes(storedStatus)) {
      storedStatus = "pending";
    }
  }

  return {
    ...item,
    category: item?.category || "",
    investigation,
    result_status: storedStatus,
    result_value: storedValue,
    result_unit: item?.result_unit || "",
    reference_range: item?.reference_range || "",
    interpretation: item?.interpretation || "",
    result_notes: item?.result_notes || "",
    result_file_path: item?.result_file_path || "",
    result_file_name: item?.result_file_name || "",
    result_file_type: item?.result_file_type || "",
    result_file_size: item?.result_file_size || null,
  };
}

function InvestigationResultCards({ investigations, editable = false, onResultChange, onFileUpload }) {
  if (!investigations.length) {
    return <div className="empty-selection-state">No investigation was recorded.</div>;
  }

  const normalized = investigations.map(normalizeInvestigationRecord);

  return (
    <div className="investigation-result-list">
      {normalized.map((item, index) => {
        const config = getInvestigationResultConfig(item.investigation);
        const resultSummary = getInvestigationResultSummary(item);

        return (
          <div className="investigation-result-card" key={`${item.category}-${item.investigation}-${index}`}>
            <div className="investigation-result-main">
              <span className="investigation-checkmark">✓</span>
              <div className="investigation-result-name">
                <strong>{item.investigation}</strong>
                {item.category && <small>{item.category}</small>}
              </div>
            </div>

            <div className="investigation-result-control">
              <span>{config.label}</span>
              {editable ? (
                <select
                  value={item.result_status}
                  onChange={(e) => onResultChange?.(index, { result_status: e.target.value })}
                  aria-label={`Result status for ${item.investigation}`}
                >
                  {config.statuses.map((status) => (
                    <option value={status} key={status}>{getInvestigationResultLabel(status)}</option>
                  ))}
                </select>
              ) : (
                <span className={`investigation-result-badge ${getInvestigationResultClass(item.result_status)}`}>
                  {getInvestigationResultLabel(item.result_status)}
                </span>
              )}
            </div>

            {getInvestigationValidationMessage(item) && (
              <div
                className="investigation-validation-warning"
                role="status"
                style={{
                  marginTop: "0.5rem",
                  padding: "0.65rem 0.75rem",
                  border: "1px solid #f59e0b",
                  borderRadius: "0.5rem",
                  background: "#fffbeb",
                  color: "#92400e",
                  fontSize: "0.875rem",
                  lineHeight: 1.45,
                }}
              >
                <strong>Verification required: </strong>
                {getInvestigationValidationMessage(item)}
              </div>
            )}

            {editable && (
              <div className="investigation-result-detail-grid">
                {config.type === "blood_group" && (
                  <label>
                    <span>Blood group (ABO/Rh)</span>
                    <select
                      value={item.result_value || ""}
                      onChange={(e) => onResultChange?.(index, {
                        result_value: e.target.value,
                        result_status: e.target.value ? "result_recorded" : "pending",
                      })}
                    >
                      <option value="">Select blood group</option>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => (
                        <option value={group} key={group}>{group}</option>
                      ))}
                    </select>
                  </label>
                )}

                {config.type === "blood_pressure" && (
                  <>
                    <label><span>Systolic (mmHg)</span><input inputMode="decimal" value={item.systolic || ""} onChange={(e) => onResultChange?.(index, { systolic: e.target.value })} placeholder="e.g. 120" /></label>
                    <label><span>Diastolic (mmHg)</span><input inputMode="decimal" value={item.diastolic || ""} onChange={(e) => onResultChange?.(index, { diastolic: e.target.value })} placeholder="e.g. 80" /></label>
                  </>
                )}

                {config.type === "electrolytes" && (
                  <>
                    <label><span>Sodium Na⁺ (mmol/L)</span><input inputMode="decimal" value={item.sodium || ""} onChange={(e) => onResultChange?.(index, { sodium: e.target.value })} placeholder="Sodium" /></label>
                    <label><span>Potassium K⁺ (mmol/L)</span><input inputMode="decimal" value={item.potassium || ""} onChange={(e) => onResultChange?.(index, { potassium: e.target.value })} placeholder="Potassium" /></label>
                    <label><span>Chloride Cl⁻ (mmol/L)</span><input inputMode="decimal" value={item.chloride || ""} onChange={(e) => onResultChange?.(index, { chloride: e.target.value })} placeholder="Chloride" /></label>
                    <label><span>Bicarbonate HCO₃⁻ (mmol/L)</span><input inputMode="decimal" value={item.bicarbonate || ""} onChange={(e) => onResultChange?.(index, { bicarbonate: e.target.value })} placeholder="Bicarbonate" /></label>
                  </>
                )}

                {config.type === "fbc_panel" && (
                  <>
                    <label><span>Haemoglobin (g/dL)</span><input inputMode="decimal" value={item.haemoglobin || ""} onChange={(e) => onResultChange?.(index, { haemoglobin: e.target.value })} placeholder="Hb" /></label>
                    <label><span>PCV (%)</span><input inputMode="decimal" value={item.pcv || ""} onChange={(e) => onResultChange?.(index, { pcv: e.target.value })} placeholder="PCV" /></label>
                    <label><span>WBC (10^9/L)</span><input inputMode="decimal" value={item.wbc || ""} onChange={(e) => onResultChange?.(index, { wbc: e.target.value })} placeholder="White blood cells" /></label>
                    <label><span>Platelets (10^9/L)</span><input inputMode="decimal" value={item.platelets || ""} onChange={(e) => onResultChange?.(index, { platelets: e.target.value })} placeholder="Platelet count" /></label>
                    <label className="investigation-result-notes"><span>Additional FBC report details</span><textarea value={item.result_value || ""} onChange={(e) => onResultChange?.(index, { result_value: e.target.value })} placeholder="Differential count or laboratory report comments" rows={2} /></label>
                  </>
                )}

                {config.type === "quantitative" && (
                  <>
                    <label><span>Measured value</span><input inputMode="decimal" value={item.result_value || ""} onChange={(e) => onResultChange?.(index, { result_value: e.target.value })} placeholder="Enter measured value" /></label>
                    <label><span>Unit</span><input value={item.result_unit || config.defaultUnit || ""} onChange={(e) => onResultChange?.(index, { result_unit: e.target.value })} placeholder={config.defaultUnit || "Unit"} /></label>
                    <label><span>Laboratory reference range</span><input value={item.reference_range || ""} onChange={(e) => onResultChange?.(index, { reference_range: e.target.value })} placeholder="Use performing laboratory range" /></label>
                  </>
                )}

                {config.type === "panel" && (
                  <label className="investigation-result-notes"><span>Panel findings</span><textarea value={item.result_value || ""} onChange={(e) => onResultChange?.(index, { result_value: e.target.value })} placeholder="Record pH, protein, glucose, blood, nitrite, leukocytes, specific gravity and other findings." rows={3} /></label>
                )}

                {(config.type === "qualitative" || config.type === "microbiology" || config.type === "imaging") && (
                  <label className="investigation-result-notes"><span>Result / report detail</span><textarea value={item.result_value || ""} onChange={(e) => onResultChange?.(index, { result_value: e.target.value })} placeholder={config.type === "imaging" ? "Enter report findings and impression." : "Enter additional result details, organism or finding."} rows={3} /></label>
                )}

                <label className="investigation-result-notes"><span>Clinical/laboratory note</span><textarea value={item.result_notes || ""} onChange={(e) => onResultChange?.(index, { result_notes: e.target.value })} placeholder="Optional note" rows={2} /></label>
              </div>
            )}

            {!editable && (resultSummary || item.reference_range || item.result_notes) && (
              <div className="investigation-result-value">
                <span>{config.type === "blood_group" ? "Blood group" : "Recorded result"}</span>
                {resultSummary && <strong>{resultSummary}</strong>}
                {item.reference_range && <small>Reference range: {item.reference_range}</small>}
                {item.result_notes && <small>Note: {item.result_notes}</small>}
              </div>
            )}

            <div className="investigation-file-row">
              <div>
                <span>Original result</span>
                <strong>{item.result_file_name || "No result document attached"}</strong>
                {item.result_file_size ? <small>{Math.round(item.result_file_size / 1024)} KB</small> : null}
              </div>
              {editable && (
                <label className="upload-result-button">📎 {item.result_file_name ? "Replace result" : "Upload result"}
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv" onChange={(e) => onFileUpload?.(index, e.target.files?.[0] || null)} />
                </label>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PrintReferralSheet({
  referral,
  copyLabel = "REFERRAL COPY",
}) {
  const diagnoses = getDiagnosisRecords(referral);
  const investigations = getInvestigationRecords(referral).map(
    normalizeInvestigationRecord
  );

  const hasReceivingUpdate = Boolean(
    referral?.assessment_findings ||
    referral?.final_diagnosis ||
    referral?.diagnosis_category ||
    referral?.diagnosis_status ||
    referral?.treatment_provided ||
    referral?.procedures_performed ||
    referral?.clinical_feedback ||
    referral?.disposition
  );

  return (
    <div className="printable-referral-sheet">
      <header className="print-document-header">
        <div>
          <img className="print-brand-logo" src="/logo.png" alt="REFLINK — Digital Referral & Care-Continuity Platform" />
          <h1>Patient Referral Form</h1>
          <p>Digital referral • {copyLabel}</p>
        </div>

        <div className="print-referral-meta">
          <span>REFLINK ID</span>
          <strong>{referral?.referral_number || "DRAFT REFERRAL"}</strong>
          <small>{formatReferralDateTime(referral?.created_at)}</small>
        </div>
      </header>

      <section className="print-section print-identity-section">
        <div className="print-identity-grid">
          <div>
            <span>Patient / Identifier</span>
            <strong>{referral?.patient_identifier || "Not recorded"}</strong>
          </div>
          <div>
            <span>Age</span>
            <strong>{formatPatientAge(referral?.patient_age_months)}</strong>
          </div>
          <div>
            <span>Sex</span>
            <strong>{formatClinicalLabel(referral?.patient_sex)}</strong>
          </div>
          <div>
            <span>Urgency</span>
            <strong>{formatClinicalLabel(referral?.urgency)}</strong>
          </div>
        </div>
      </section>

      <section className="print-section">
        <h2>Referral Information</h2>
        <div className="print-grid">
          <div>
            <span>Referring Facility</span>
            <strong>
              {referral?.referring_facility?.name ||
                referral?.referring_facility_name ||
                "Not recorded"}
            </strong>
          </div>
          <div>
            <span>Receiving Facility</span>
            <strong>
              {referral?.receiving_facility?.name ||
                referral?.receiving_facility_name ||
                "Not recorded"}
            </strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{getStatusLabel(referral?.status)}</strong>
          </div>
          <div>
            <span>Referral Date</span>
            <strong>{formatReferralDateTime(referral?.created_at)}</strong>
          </div>
        </div>
      </section>

      <section className="print-section">
        <h2>Clinical Summary</h2>
        <div className="print-narrative-grid">
          <div>
            <span>Chief Complaint</span>
            <p>{referral?.chief_complaint || "Not recorded"}</p>
          </div>
          <div>
            <span>Clinical Summary</span>
            <p>{referral?.clinical_summary || "Not recorded"}</p>
          </div>
          <div>
            <span>Physical Findings</span>
            <p>{referral?.physical_findings || "Not recorded"}</p>
          </div>
          <div>
            <span>Treatment Given at Referring Facility</span>
            <p>{referral?.treatment_given || "Not recorded"}</p>
          </div>
          <div>
            <span>Reason for Referral</span>
            <p>{referral?.referral_reason || "Not recorded"}</p>
          </div>
        </div>
      </section>

      <section className="print-section">
        <h2>Diagnosis</h2>
        {diagnoses.length ? (
          <table className="print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
                <th>Category</th>
                <th>Diagnosis</th>
              </tr>
            </thead>
            <tbody>
              {diagnoses.map((item, index) => (
                <tr key={`${item?.diagnosis || index}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{formatClinicalLabel(item?.status)}</td>
                  <td>{item?.category || "Not recorded"}</td>
                  <td>{item?.diagnosis || item?.name || "Not recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>None recorded.</p>
        )}
      </section>

      <section className="print-section">
        <h2>Investigations & Results</h2>
        {investigations.length ? (
          <table className="print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Category</th>
                <th>Investigation</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {investigations.map((item, index) => (
                <tr key={`${item.category}-${item.investigation}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{item.category || "Not recorded"}</td>
                  <td>{item.investigation}</td>
                  <td>
                    <strong>{getInvestigationResultLabel(item.result_status)}</strong>
                    {getInvestigationResultSummary(item) && <div>{getInvestigationResultSummary(item)}</div>}
                    {item.reference_range && <small>Reference range: {item.reference_range}</small>}
                    {item.result_notes && <small>Note: {item.result_notes}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>None recorded.</p>
        )}
      </section>

      {hasReceivingUpdate && (
        <section className="print-section">
          <h2>Receiving Facility Update</h2>
          <div className="print-narrative-grid">
            {referral?.assessment_findings && (
              <div>
                <span>Assessment Findings</span>
                <p>{referral.assessment_findings}</p>
              </div>
            )}
            {referral?.final_diagnosis && (
              <div>
                <span>Final Diagnosis</span>
                <p>{referral.final_diagnosis}</p>
              </div>
            )}

            {referral?.diagnosis_status && (
              <div>
                <span>Diagnosis Status</span>
                <p>{formatClinicalLabel(referral.diagnosis_status)}</p>
              </div>
            )}

            {referral?.diagnosis_category && (
              <div>
                <span>Diagnosis Category</span>
                <p>{referral.diagnosis_category}</p>
              </div>
            )}

            {referral?.treatment_provided && (
              <div>
                <span>Treatment Provided</span>
                <p>{referral.treatment_provided}</p>
              </div>
            )}
            {referral?.procedures_performed && (
              <div>
                <span>Procedures Performed</span>
                <p>{referral.procedures_performed}</p>
              </div>
            )}
            {referral?.clinical_feedback && (
              <div>
                <span>Clinical Feedback</span>
                <p>{referral.clinical_feedback}</p>
              </div>
            )}
            {referral?.disposition && (
              <div>
                <span>Disposition</span>
                <p>{formatClinicalLabel(referral.disposition)}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="print-signature-section">
        <div>
          <span>Referring Health Worker</span>
          <div className="signature-line" />
          <small>Signature / Date</small>
        </div>
        <div>
          <span>Receiving Health Worker</span>
          <div className="signature-line" />
          <small>Signature / Date</small>
        </div>
        <div>
          <span>Facility Stamp</span>
          <div className="stamp-box" />
          <small>Official facility stamp</small>
        </div>
      </section>

      <footer className="print-document-footer">
        REFLINK • Keep this paper copy with the patient referral record.
      </footer>
    </div>
  );
}

async function printReferralForm(referral, copyLabel = "REFERRAL COPY", onCount = null) {
  let printNumber = null;
  if (referral?.id) {
    try {
      const { data, error } = await supabase.rpc("log_referral_print", {
        p_referral_id: referral.id,
        p_copy_label: copyLabel,
      });
      if (!error) printNumber = Number(data);
    } catch (error) {
      console.warn("REFLINK print history unavailable", error);
    }
  }
  if (typeof onCount === "function") onCount(printNumber);
  window.setTimeout(() => window.print(), 80);
  return printNumber;
}

function ReferralSourceDetails({ referral, editableInvestigationResults = false, onInvestigationResultChange }) {
  const diagnoses = getDiagnosisRecords(referral);
  const investigations = getInvestigationRecords(referral);
  const rawCategories = parseJsonArray(
    referral?.investigation_categories
  );
  const investigationCategories = rawCategories.length
    ? rawCategories
        .map((item) =>
          typeof item === "string"
            ? item
            : item?.category || item?.name || ""
        )
        .filter(Boolean)
    : [...new Set(
        investigations
          .map((item) => item?.category || "")
          .filter(Boolean)
      )];

  const groupedInvestigations = investigations.reduce(
    (groups, item) => {
      const category =
        item?.category || "Other Investigations";

      if (!groups[category]) {
        groups[category] = [];
      }

      const investigation =
        item?.investigation ||
        item?.name ||
        (typeof item === "string" ? item : "");

      if (investigation) {
        // Preserve saved result status, values, units and notes.
        // Legacy string entries remain supported.
        groups[category].push(
          typeof item === "string"
            ? { category, investigation }
            : item
        );
      }

      return groups;
    },
    {}
  );


  return (
    <section className="referral-source-details">
      <div className="source-details-heading">
        <div>
          <span className="eyebrow">REFERRAL INFORMATION</span>
          <h3>Information Provided by Referring PHC</h3>
          <p>
            All patient, clinical, diagnosis, investigation and treatment
            information recorded by the referring healthcare worker is
            available to the receiving facility.
          </p>
        </div>
      </div>

      <div className="clinical-detail-section">
        <h4>Patient Information</h4>

        <div className="clinical-detail-grid">
          <div className="clinical-detail-card">
            <span>Patient Identifier</span>
            <strong>{referral?.patient_identifier || "Not recorded"}</strong>
          </div>

          <div className="clinical-detail-card">
            <span>Age</span>
            <strong>{formatPatientAge(referral?.patient_age_months)}</strong>
          </div>

          <div className="clinical-detail-card">
            <span>Sex</span>
            <strong>{formatClinicalLabel(referral?.patient_sex)}</strong>
          </div>

          <div className="clinical-detail-card">
            <span>Patient Phone</span>
            <strong>{referral?.patient_phone || "Not recorded"}</strong>
          </div>

          <div className="clinical-detail-card clinical-detail-card-wide">
            <span>Patient Address</span>
            <strong>{referral?.patient_address || "Not recorded"}</strong>
          </div>

          <div className="clinical-detail-card">
            <span>Relative / Caregiver</span>
            <strong>{referral?.relative_name || "Not recorded"}</strong>
          </div>

          <div className="clinical-detail-card">
            <span>Relationship</span>
            <strong>
              {formatClinicalLabel(referral?.relative_relationship)}
            </strong>
          </div>

          <div className="clinical-detail-card">
            <span>Relative Phone</span>
            <strong>{referral?.relative_phone || "Not recorded"}</strong>
          </div>
        </div>
      </div>

      <div className="clinical-detail-section">
        <h4>Clinical Information from PHC</h4>

        <div className="clinical-narrative-grid">
          <div className="clinical-narrative-card">
            <span>Chief Complaint</span>
            <p>{referral?.chief_complaint || "Not recorded"}</p>
          </div>

          <div className="clinical-narrative-card">
            <span>Clinical Summary</span>
            <p>{referral?.clinical_summary || "Not recorded"}</p>
          </div>

          <div className="clinical-narrative-card">
            <span>Physical Findings</span>
            <p>{referral?.physical_findings || "Not recorded"}</p>
          </div>

          <div className="clinical-narrative-card">
            <span>Treatment Given at PHC</span>
            <p>{referral?.treatment_given || "Not recorded"}</p>
          </div>

          <div className="clinical-narrative-card">
            <span>Reason for Referral</span>
            <p>{referral?.referral_reason || "Not recorded"}</p>
          </div>

          <div className="clinical-narrative-card">
            <span>Urgency</span>
            <p>{formatClinicalLabel(referral?.urgency)}</p>
          </div>
        </div>
      </div>

      <div className="clinical-detail-section">
        <div className="selection-display-header">
          <div>
            <h4>Selected Diagnoses</h4>
            <p>
              Each diagnosis is displayed with its status and clinical
              category.
            </p>
          </div>

          <span className="selection-count-badge">
            {diagnoses.length} selected
          </span>
        </div>

        {diagnoses.length > 0 ? (
          <div className="clinical-detail-card-grid diagnosis-detail-grid">
            {diagnoses.map((item, index) => (
              <div
                className="clinical-detail-card diagnosis-detail-card"
                key={`${item?.status || "diagnosis"}-${item?.diagnosis || index}-${index}`}
              >
                <div className="detail-card-topline">
                  <span
                    className={`clinical-status-pill status-${String(
                      item?.status || "unknown"
                    ).toLowerCase()}`}
                  >
                    {formatClinicalLabel(item?.status || "Unknown")}
                  </span>

                  {item?.category && (
                    <span className="detail-category-label">
                      {item.category}
                    </span>
                  )}
                </div>

                <strong>
                  {item?.diagnosis ||
                    item?.name ||
                    "Diagnosis not recorded"}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-selection-state">
            No diagnosis was recorded.
          </div>
        )}
      </div>

      <div className="clinical-detail-section">
        <div className="selection-display-header">
          <div>
            <h4>Selected Investigation Categories</h4>
            <p>
              All investigation categories selected by the referring PHC.
            </p>
          </div>

          <span className="selection-count-badge">
            {investigationCategories.length} selected
          </span>
        </div>

        {investigationCategories.length > 0 ? (
          <div className="selected-category-boxes">
            {investigationCategories.map((category) => (
              <div
                className="selected-category-box"
                key={category}
              >
                <span className="category-checkmark">✓</span>
                <strong>{category}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-selection-state">
            No investigation category was recorded.
          </div>
        )}
      </div>

      <div className="clinical-detail-section">
        <div className="selection-display-header">
          <div>
            <h4>Selected Investigations</h4>
            <p>
              Individual investigations selected by the referring PHC,
              grouped by category.
            </p>
          </div>

          <span className="selection-count-badge">
            {investigations.length} selected
          </span>
        </div>

        {investigations.length > 0 ? (
          <div className="selected-investigation-groups">
            {Object.entries(groupedInvestigations).map(
              ([category, items]) => (
                <div
                  className="selected-investigation-group"
                  key={category}
                >
                  <div className="selected-investigation-group-header">
                    <strong>{category}</strong>
                    <span>{items.length}</span>
                  </div>

                  <InvestigationResultCards
                    investigations={items}
                    editable={editableInvestigationResults}
                    onResultChange={(localIndex, value) => {
                      const categoryItems = investigations.filter(
                        (entry) =>
                          (entry?.category || "Other Investigations") === category
                      );
                      const selectedItem = categoryItems[localIndex];
                      const globalIndex = investigations.findIndex(
                        (entry) => entry === selectedItem
                      );

                      if (globalIndex >= 0) {
                        onInvestigationResultChange?.(globalIndex, value);
                      }
                    }}
                  />
                </div>
              )
            )}
          </div>
        ) : (
          <div className="empty-selection-state">
            No investigation was recorded.
          </div>
        )}
      </div>
    </section>
  );
}

function ReferralTimeline({ referral }) {
  const steps = [
    {
      key: "created",
      label: "Referral Created",
      timestamp: referral.created_at,
    },
    {
      key: "acknowledged",
      label: "Referral Acknowledged",
      timestamp: referral.acknowledged_at,
    },
    {
      key: "patient-arrived",
      label: "Patient Arrived",
      timestamp: referral.patient_arrived_at,
    },
    {
      key: "assessment",
      label: referral.assessment_completed_at
  ? "Assessment Completed"
  : referral.status === "under_assessment"
    ? "Assessment in Progress"
    : "Assessment",
      timestamp: referral.assessment_completed_at,
    },
    {
      key: "completed",
      label: "Referral Completed",
      timestamp: referral.completed_at || referral.discharged_at,
    },
  ];

  let activeFound = false;

  return (
    <section className="referral-timeline" aria-label="Referral journey">
      <div className="referral-timeline-header">
        <div>
          <span className="eyebrow">REFERRAL JOURNEY</span>
          <h3>Referral Timeline</h3>
        </div>
        <span className={`timeline-current status-${String(referral.status || "unknown").toLowerCase().replace(/\s+/g, "-")}`}>
          {({
            sent: "New Referral",
            acknowledged: "Acknowledged",
            patient_arrived: "Patient Arrived",
            under_assessment: "Under Assessment",
            admitted: "Admitted",
            completed: "Completed",
            discharged: "Discharged",
          }[referral.status] || "Status Unknown")}
        </span>
      </div>

      <div className="timeline-track">
        {steps.map((step) => {
          const completed = Boolean(step.timestamp);
          const current = !completed && !activeFound;
          if (current) activeFound = true;

          return (
            <div
              className={`timeline-step ${completed ? "is-complete" : ""} ${current ? "is-current" : "is-pending"}`}
              key={step.key}
            >
              <span className="timeline-dot" aria-hidden="true">
                {completed ? "✓" : ""}
              </span>
              <div className="timeline-content">
                <strong>{step.label}</strong>
                <span>
  {completed
    ? formatReferralDateTime(step.timestamp)
    : current &&
        step.key === "assessment" &&
        referral.status === "under_assessment"
      ? "In progress"
      : "Awaiting update"}
</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* =========================================================
   MAIN APP
   ========================================================= */

const REFLINK_LOGO = "/logo.png";
const REFLINK_MARK = "/reflink-mark.png";

const CHIEF_COMPLAINT_OPTIONS = [
  "Fever", "Difficulty breathing", "Severe pain", "Bleeding",
  "Convulsion", "Altered consciousness", "Pregnancy/labour complication",
  "Injury/trauma", "Dehydration", "Severe weakness", "Childhood illness",
  "Other",
];

const PHYSICAL_FINDING_OPTIONS = [
  "Pale", "Febrile", "Dehydrated", "Unconscious", "Respiratory distress",
  "Hypotension", "Hypertension", "Low oxygen saturation", "Active bleeding",
  "Convulsion", "Severe pain", "Oedema", "Jaundice", "Other",
];

const TREATMENT_OPTIONS = [
  "IV fluids", "Antibiotics", "Antimalarial", "Analgesia", "Oxygen",
  "Blood transfusion", "Anticonvulsant", "Wound care", "Referral stabilization",
  "None", "Other",
];

function OfflineStatusBadge() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const count = session?.user?.id ? await getQueueCount(session.user.id) : 0;
        if (active) setQueued(count);
      } catch {
        if (active) setQueued(0);
      }
    };
    const onOnline = () => { setOnline(true); refresh(); };
    const onOffline = () => setOnline(false);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { Promise.resolve().then(refresh); });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(timer);
    };
  }, []);
  return (
    <span className={`reflink-connectivity-badge ${online ? "is-online" : "is-offline"}`} aria-live="polite">
      <span className="reflink-connectivity-dot" />
      {online ? "Online" : "Offline"}{queued > 0 ? ` • ${queued} waiting` : ""}
    </span>
  );
}

async function requestReferralSms(referralId, type) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch("/api/referral-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ referralId, type }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) console.warn("REFLINK SMS notification:", result?.error || response.statusText);
  } catch (error) {
    console.warn("REFLINK SMS notification unavailable", error);
  }
}

function urgencyMeta(urgency) {
  const value = String(urgency || "routine").toLowerCase();
  if (value === "emergency") return { label: "Emergency", className: "urgency-emergency", sla: "Acknowledgement target: 15 minutes" };
  if (value === "urgent") return { label: "Urgent", className: "urgency-urgent", sla: "Acknowledgement target: 2 hours" };
  return { label: "Routine", className: "urgency-routine", sla: "Acknowledgement target: 24 hours" };
}

function OfflineVaultPanel({ ownerUserId, onUnlocked, onClose }) {
  const [envelope, setEnvelope] = useState(null);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getOfflineKeyVaultEnvelope(ownerUserId)
      .then((stored) => { if (active) setEnvelope(stored); })
      .catch(() => { if (active) setError("Unable to read the offline vault from this browser."); })
      .finally(() => { if (active) setVaultLoading(false); });
    return () => { active = false; };
  }, [ownerUserId]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      let result;
      if (envelope) {
        result = await unlockOfflineKeyVault(envelope, { ownerUserId, passphrase });
      } else {
        if (passphrase !== confirmation) throw new Error("The passphrases do not match.");
        result = await createOfflineKeyVault({ ownerUserId, passphrase });
        await saveOfflineKeyVaultEnvelope(result.envelope, ownerUserId);
        setEnvelope(result.envelope);
      }
      setPassphrase("");
      setConfirmation("");
      await onUnlocked(result.key, ownerUserId);
    } catch (unlockError) {
      if (unlockError?.name === "ConstraintError") {
        const existing = await getOfflineKeyVaultEnvelope(ownerUserId).catch(() => null);
        if (existing) {
          setEnvelope(existing);
          setError("An offline vault already exists for this account. Enter its passphrase to unlock it.");
        } else {
          setError("Another tab may be creating the vault. Close other REFLINK tabs and try again.");
        }
      } else {
        setError(unlockError?.message || "Unable to unlock the offline vault.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="reflink-offline-vault-panel" aria-labelledby="offline-vault-title">
      <div className="reflink-offline-vault-panel__header">
        <div>
          <h3 id="offline-vault-title">Offline referral protection</h3>
          <p>{envelope ? "Unlock your account's offline vault to access and synchronise pending referrals." : "Create a passphrase-protected vault before saving referrals while offline."}</p>
        </div>
        {onClose && <button type="button" className="secondary-button" onClick={onClose}>Close</button>}
      </div>
      <form onSubmit={submit}>
        <label htmlFor="offline-vault-passphrase">Vault passphrase</label>
        <input
          id="offline-vault-passphrase"
          type="password"
          autoComplete="current-password"
          minLength={12}
          maxLength={1024}
          required
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          placeholder="At least 12 characters"
        />
        {!envelope && (
          <>
            <label htmlFor="offline-vault-confirm">Confirm passphrase</label>
            <input
              id="offline-vault-confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={1024}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="Re-enter passphrase"
            />
          </>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}
        <p className="reflink-offline-vault-panel__notice">
          Keep this passphrase safe. It cannot be recovered by REFLINK. Signing out locks the vault but does not delete pending referrals.
        </p>
        <button type="submit" disabled={busy || vaultLoading}>
          {vaultLoading ? "Checking existing vault…" : busy ? "Please wait…" : envelope ? "Unlock offline vault" : "Create offline vault"}
        </button>
      </form>
    </section>
  );
}

function App() {
  const { t } = useLanguage();
  const [screen, setScreen] = useState("home");
  const [role, setRole] = useState(null);
  const [profile, setProfile] = useState(null);

  const [dashboardView, setDashboardView] =
    useState("overview");

  const [dashboardFilter, setDashboardFilter] =
    useState("all");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [offlineSyncMessage, setOfflineSyncMessage] = useState("");
  const [offlineVaultKey, setOfflineVaultKey] = useState(null);
  const [offlineVaultOwner, setOfflineVaultOwner] = useState(null);
  const [offlineVaultVisible, setOfflineVaultVisible] = useState(false);
  const offlineVaultOwnerRef = useRef(null);
  const offlineVaultChannelRef = useRef(null);
  offlineVaultOwnerRef.current = offlineVaultOwner;


  useEffect(() => {
    const channel = createOfflineVaultLockChannel(offlineVaultOwner, () => {
      setOfflineVaultKey(null);
      setOfflineVaultOwner(null);
    });
    offlineVaultChannelRef.current = channel;
    return () => {
      channel.close();
      if (offlineVaultChannelRef.current === channel) offlineVaultChannelRef.current = null;
    };
  }, [offlineVaultOwner]);

  const handleOfflineVaultUnlocked = async (key, ownerUserId) => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.id || String(user.id) !== String(ownerUserId)) {
      throw new Error("The signed-in account changed. Unlock the vault again for the active account.");
    }
    const migration = await migratePlaintextQueueToEncrypted(ownerUserId, key);
    const { data: { user: verifiedUser }, error: verificationError } = await supabase.auth.getUser();
    if (verificationError || !verifiedUser?.id || String(verifiedUser.id) !== String(ownerUserId)) {
      throw new Error("The signed-in account changed while the offline vault was unlocking. Unlock the vault again for the active account.");
    }
    setOfflineVaultKey(key);
    setOfflineVaultOwner(String(ownerUserId));
    setOfflineVaultVisible(false);
    if (migration.failed > 0) {
      setOfflineSyncMessage(`${migration.failed} older offline referral(s) could not be encrypted. They remain stored and were not synchronised.`);
    }
    if (navigator.onLine) {
      const result = await syncQueuedReferrals(supabase, key);
      if (result.synced > 0) setOfflineSyncMessage(`${result.synced} offline referral${result.synced === 1 ? "" : "s"} synced successfully.`);
    }
  };

  useEffect(() => {
    let active = true;
    const sync = async () => {
      if (!navigator.onLine || !offlineVaultKey || !offlineVaultOwner) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id || String(user.id) !== String(offlineVaultOwner)) return;
        const result = await syncQueuedReferrals(supabase, offlineVaultKey);
        if (active && result.synced > 0) setOfflineSyncMessage(`${result.synced} offline referral${result.synced === 1 ? "" : "s"} synced successfully.`);
      } catch (error) {
        if (active) console.warn("REFLINK offline sync", error);
      }
    };
    sync();
    window.addEventListener("online", sync);
    const timer = window.setInterval(sync, 15000);
    return () => { active = false; window.removeEventListener("online", sync); window.clearInterval(timer); };
  }, [offlineVaultKey, offlineVaultOwner]);

  useEffect(() => {
    if (offlineVaultOwner && profile?.id && String(offlineVaultOwner) !== String(profile.id)) {
      offlineVaultChannelRef.current?.broadcastLock();
      setOfflineVaultKey(null);
      setOfflineVaultOwner(null);
      setOfflineVaultVisible(true);
    }
  }, [profile?.id, offlineVaultOwner]);

  useEffect(() => {
    let active = true;
    const inspectQueue = async () => {
      if (!profile?.id) return;
      try {
        const count = await getQueueCount(profile.id);
        const envelope = await getOfflineKeyVaultEnvelope(profile.id);
        if (active && count > 0 && !offlineVaultKey && !offlineVaultVisible) setOfflineVaultVisible(true);
        if (active && count > 0 && !envelope) setOfflineVaultVisible(true);
      } catch {
        if (active) setOfflineVaultVisible(true);
      }
    };
    inspectQueue();
    return () => { active = false; };
  }, [profile?.id]);

  /* =========================================================
   LOGIN / AUTHENTICATION
   ========================================================= */

const handleSignIn = async () => {
  setLoginError("");
  setLoading(true);

  try {
    // 1. Authenticate with Supabase
    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (error) {
      setLoginError(error.message);
      return;
    }

    const user = data?.user;

    if (!user) {
      setLoginError(
        "Authentication succeeded, but no user account was returned."
      );
      return;
    }

    // 2. Load REFLINK profile
    const {
      data: userProfile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        "id, full_name, role, facility_id, must_change_password"
      )
      .eq("id", user.id)
      .single();

    if (profileError || !userProfile) {
      console.warn("REFLINK profile query after sign-in failed", profileError?.message || "No profile returned");

      if (isTransientAuthError(profileError)) {
        try {
          const cachedProfile = await getCachedValue(`profile:${user.id}`, null);
          const cachedRole = getApplicationRole(cachedProfile?.role);
          if (cachedProfile && cachedRole && String(cachedProfile.id) === String(user.id)) {
            setProfile({ ...cachedProfile, auth_user_id: user.id });
            setRole(cachedRole);
            setDashboardView("overview");
            setDashboardFilter("all");
            setOfflineSyncMessage("Connection to Supabase is temporarily unavailable. Your saved workspace is open; live data may not load until connectivity returns.");
            setScreen(cachedProfile.must_change_password ? "change-password" : "dashboard");
            return;
          }
        } catch (cacheError) {
          console.warn("REFLINK cached sign-in profile unavailable", cacheError);
        }
      }

      setLoginError(
        "Your credentials were accepted, but REFLINK could not verify your profile. Check your connection and retry. Your session has not been forcibly signed out."
      );
      return;
    }

    // 3. Normalize role
    const applicationRole = getApplicationRole(userProfile.role);

    // 4. Reject unsupported roles
    if (!applicationRole) {
      console.error(
        "Unsupported REFLINK role:",
        userProfile.role
      );

      setLoginError(
        `Your REFLINK account has an unsupported role: "${userProfile.role}". Please contact the system administrator.`
      );

      return;
    }

    // 5. Store authenticated profile
    setProfile({
      ...userProfile,
      auth_user_id: user.id,
    });
    try { await cacheValue(`profile:${user.id}`, { ...userProfile, auth_user_id: user.id }); } catch (cacheError) { console.warn("REFLINK profile cache skipped", cacheError); }

    setRole(applicationRole);

    if (userProfile.must_change_password) {
      setPasswordError("");
      setPasswordMessage(
        "Your account was created with a temporary password. Please set your own password before continuing."
      );
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setScreen("change-password");
      return;
    }

    // 6. Reset dashboard state
    setDashboardView("overview");
    setDashboardFilter("all");

    // 7. Open dashboard
    setScreen("dashboard");

  } catch (error) {
    console.error(
      "Unexpected authentication error:",
      error
    );

    setLoginError(
      error?.message ||
      "An unexpected error occurred while signing in."
    );
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    let active = true;
    let restoreSequence = 0;
    let currentSessionUser = null;
    let initialSessionHandled = false;

    const applyWorkspaceProfile = async (user, profileRow, fromCache = false) => {
      if (!active) return;

      const applicationRole = getApplicationRole(profileRow?.role);
      if (!profileRow || !applicationRole || String(profileRow.id) !== String(user.id)) {
        setLoginError("Your REFLINK profile could not be verified. Please contact the system administrator.");
        setScreen("login");
        return;
      }

      const restoredProfile = { ...profileRow, auth_user_id: user.id };
      setProfile(restoredProfile);
      setRole(applicationRole);
      setDashboardView("overview");
      setDashboardFilter("all");
      setLoginError("");
      setScreen(profileRow.must_change_password ? "change-password" : "dashboard");

      if (fromCache) {
        setOfflineSyncMessage("Connection to Supabase is temporarily unavailable. Your saved workspace is open; live data may not load until connectivity returns.");
      } else {
        setOfflineSyncMessage("");
        try {
          await cacheValue(`profile:${user.id}`, restoredProfile);
        } catch (cacheError) {
          console.warn("REFLINK profile cache skipped", cacheError);
        }
      }
    };

    const restoreUserProfile = async (user) => {
      if (!user?.id) return;
      currentSessionUser = user;
      const requestId = ++restoreSequence;
      let userProfile = null;
      let profileError = null;

      try {
        const result = await supabase
          .from("profiles")
          .select("id, full_name, role, facility_id, must_change_password")
          .eq("id", user.id)
          .single();
        userProfile = result.data;
        profileError = result.error;
      } catch (error) {
        profileError = error;
      }

      if (!active || requestId !== restoreSequence) return;

      if (profileError || !userProfile) {
        console.warn("REFLINK profile restore query failed", profileError?.message || "No profile returned");

        if (isTransientAuthError(profileError)) {
          try {
            const cachedProfile = await getCachedValue(`profile:${user.id}`, null);
            if (!active || requestId !== restoreSequence) return;
            if (cachedProfile && getApplicationRole(cachedProfile.role) && String(cachedProfile.id) === String(user.id)) {
              await applyWorkspaceProfile(user, cachedProfile, true);
              return;
            }
          } catch (cacheError) {
            console.warn("REFLINK cached profile restore failed", cacheError);
          }

          if (!active || requestId !== restoreSequence) return;
          setLoginError("Your session is saved, but REFLINK cannot reach your profile right now. Reconnect to retry automatically; you have not been signed out.");
          setOfflineSyncMessage("Waiting for a connection to verify your REFLINK profile.");
          // Do not call signOut and do not force a login redirect on a temporary network failure.
          return;
        }

        setLoginError("Your signed-in account could not be matched to an active REFLINK profile. Please contact the system administrator.");
        setScreen("login");
        return;
      }

      await applyWorkspaceProfile(user, userProfile, false);
    };

    const restoreSession = async () => {
      const startingSequence = restoreSequence;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!active || startingSequence !== restoreSequence) return;
        if (data?.session?.user && !initialSessionHandled) {
          initialSessionHandled = true;
          currentSessionUser = data.session.user;
          await restoreUserProfile(data.session.user);
        }
      } catch (error) {
        if (!active || startingSequence !== restoreSequence) return;
        console.warn("REFLINK session restore could not complete", error?.message || error);
        if (isTransientAuthError(error)) {
          setOfflineSyncMessage("Supabase is temporarily unreachable. Reconnect to restore your workspace; REFLINK has not signed you out.");
          return;
        }
        setLoginError("Unable to restore the saved session. Please sign in again if the session has expired.");
        setScreen("login");
      }
    };

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "PASSWORD_RECOVERY") {
        setPasswordError("");
        setPasswordMessage("");
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setScreen("change-password");
        return;
      }

      if (event === "INITIAL_SESSION" && session?.user && !initialSessionHandled) {
        initialSessionHandled = true;
        currentSessionUser = session.user;
        // Defer profile lookup outside the auth callback to avoid blocking Supabase's auth lock.
        window.setTimeout(() => {
          if (active) void restoreUserProfile(session.user);
        }, 0);
      }

      if (event === "SIGNED_IN" && session?.user) {
        currentSessionUser = session.user;
        const activeVaultOwner = offlineVaultOwnerRef.current;
        if (activeVaultOwner && String(activeVaultOwner) !== String(session.user.id)) {
          offlineVaultChannelRef.current?.broadcastLock();
          setOfflineVaultKey(null);
          setOfflineVaultOwner(null);
          setOfflineVaultVisible(true);
        }
      }

      if (event === "SIGNED_OUT") {
        restoreSequence += 1;
        currentSessionUser = null;
        if (offlineVaultOwnerRef.current) offlineVaultChannelRef.current?.broadcastLock();
        setOfflineVaultKey(null);
        setOfflineVaultOwner(null);
        setOfflineVaultVisible(false);
        setProfile(null);
        setRole(null);
        setDashboardView("overview");
        setDashboardFilter("all");
        setOfflineSyncMessage("");
        setScreen("home");
      }
    });

    const handleOnline = () => {
      if (currentSessionUser?.id) {
        void restoreUserProfile(currentSessionUser);
      } else {
        void restoreSession();
      }
    };

    window.addEventListener("online", handleOnline);

    return () => {
      active = false;
      restoreSequence += 1;
      window.removeEventListener("online", handleOnline);
      subscription?.unsubscribe();
    };
  }, []);

  const handlePasswordResetRequest = async () => {
    setLoginError("");

    const resetEmail = email.trim();

    if (!resetEmail) {
      setLoginError("Enter your email address first.");
      return;
    }

    setLoading(true);

    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          resetEmail,
          {
            redirectTo: window.location.origin,
          }
        );

      if (error) throw error;

      setLoginError(
        "If an account exists for this email, a password reset link has been sent."
      );
    } catch (error) {
      console.error("PASSWORD RESET REQUEST ERROR:", error);
      setLoginError(
        error?.message || "Unable to send the password reset email."
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    const newPassword = passwordForm.newPassword;
    const confirmPassword = passwordForm.confirmPassword;

    if (!newPassword || !confirmPassword) {
      setPasswordError("Enter and confirm your new password.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(
        "Your new password must be at least 8 characters long."
      );
      return;
    }

    const passwordPolicy =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

    if (!passwordPolicy.test(newPassword)) {
      setPasswordError(
        "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    setPasswordSaving(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      try {
        await supabase
          .from("profiles")
          .update({
            must_change_password: false,
          })
          .eq("id", profile?.id || "");
      } catch (profileUpdateError) {
        console.warn(
          "PASSWORD FLAG UPDATE SKIPPED:",
          profileUpdateError
        );
      }

      setPasswordMessage(
        "Password changed successfully. Your new password is now active."
      );
    } catch (error) {
      console.error("PASSWORD CHANGE ERROR:", error);
      setPasswordError(
        error?.message || "Unable to change your password."
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const openLogin = () => {
    setScreen("login");
  };

  /*
 * Role selection is intentionally removed.
 *
 * REFLINK determines the user's workspace from
 * the authenticated Supabase profile.
 *
 * Users cannot manually switch their role.
 */

  const logout = async () => {
  setLoading(true);

  try {
    offlineVaultChannelRef.current?.broadcastLock();
    setOfflineVaultKey(null);
    setOfflineVaultOwner(null);
    setOfflineVaultVisible(false);
    await supabase.auth.signOut();
  } finally {
    setRole(null);
    setProfile(null);
    setDashboardView("overview");
    setDashboardFilter("all");
    setEmail("");
    setPassword("");
    setLoginError("");
    setScreen("home");
    setLoading(false);
  }
};

  return (
    <div className="app">

      <OfflineStatusBadge />
      {profile?.id && !offlineVaultVisible && (
        <button type="button" className="secondary-button reflink-offline-vault-open" onClick={() => {
          if (offlineVaultKey) {
            offlineVaultChannelRef.current?.broadcastLock();
            setOfflineVaultKey(null);
            setOfflineVaultOwner(null);
          } else {
            setOfflineVaultVisible(true);
          }
        }}>
          {offlineVaultKey ? "Lock offline vault" : "Unlock offline referrals"}
        </button>
      )}
      {profile?.id && offlineVaultVisible && (
        <OfflineVaultPanel
          ownerUserId={profile.id}
          onUnlocked={handleOfflineVaultUnlocked}
          onClose={() => setOfflineVaultVisible(false)}
        />
      )}
      {offlineSyncMessage && (
        <div className="success-message reflink-offline-sync-banner">
          {offlineSyncMessage}
        </div>
      )}

      {/* =====================================================
          HOME PAGE
          ===================================================== */}

      {screen === "home" && (
  <>
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo-image" src={REFLINK_MARK} alt="REFLINK logo" />

        <div className="brand-copy">
          <h1>REFLINK</h1>
          <p>Closed-Loop Digital Referral System</p>
        </div>
      </div>

      <nav className="home-nav">
        <LanguageSwitcher />
        <button
          type="button"
          onClick={() =>
            document
              .getElementById("how-it-works")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          {t("howItWorks")}
        </button>

        <button
          type="button"
          onClick={() =>
            document
              .getElementById("platform")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          {t("platform")}
        </button>

        <button
          type="button"
          onClick={openLogin}
          className="login-button"
        >
          Sign In
        </button>
      </nav>
    </header>

    <main className="home-page">

      {/* ================= HERO ================= */}

      <section className="hero redesigned-hero">
        <div className="hero-content">

          <span className="eyebrow">
            {t("closedLoop")}
          </span>

          <h2>
            {t("hero")}
          </h2>

          <p className="hero-text">
            REFLINK is a digital referral coordination platform that
            helps healthcare facilities securely transfer patient
            information, track referrals, confirm arrival, and close
            the referral loop with clinical feedback.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary-button hero-primary"
              onClick={openLogin}
            >
              {t("access")}
              <span>→</span>
            </button>

            <button
              type="button"
              className="secondary-button hero-secondary"
              onClick={() =>
                document
                  .getElementById("how-it-works")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              See How It Works
            </button>
          </div>

          <div className="trust-row">
            <div>
              <strong>01</strong>
              <span>Controlled Referral</span>
            </div>

            <div>
              <strong>02</strong>
              <span>Referral Tracking</span>
            </div>

            <div>
              <strong>03</strong>
              <span>Arrival Confirmation</span>
            </div>

            <div>
              <strong>04</strong>
              <span>Clinical Feedback</span>
            </div>
          </div>

        </div>

        {/* ================= REFERRAL VISUAL ================= */}

        <div className="hero-visual">

          <div className="network-card">

            <div className="network-header">
              <div>
                <span className="live-dot"></span>
                REFERRAL WORKFLOW PREVIEW
              </div>

              <span className="network-status">
                ILLUSTRATIVE
              </span>
            </div>

            <div className="network-body">

              <div className="network-node">
                <div className="node-icon phc">
                  PHC
                </div>

                <div>
                  <strong>Primary Health Centre</strong>
                  <small>Referral initiated</small>
                </div>

                <span className="node-check">✓</span>
              </div>

              <div className="network-line">
                <span></span>
                <span></span>
                <span></span>
              </div>

              <div className="network-node">
                <div className="node-icon hospital">
                  H
                </div>

                <div>
                  <strong>Receiving Hospital</strong>
                  <small>Referral acknowledged</small>
                </div>

                <span className="node-check">✓</span>
              </div>

              <div className="network-line">
                <span></span>
                <span></span>
                <span></span>
              </div>

              <div className="network-node">
                <div className="node-icon feedback">
                  ✓
                </div>

                <div>
                  <strong>Clinical Feedback</strong>
                  <small>Referral loop completed</small>
                </div>

                <span className="node-check">✓</span>
              </div>

            </div>

            <div className="network-footer">
              <div>
                <small>REFERRAL STATUS</small>
                <strong>Example referral journey</strong>
              </div>

              <span>DEMO</span>
            </div>

          </div>

          <div className="floating-card floating-card-one">
            <span>●</span>
            <div>
              <strong>Patient Arrival</strong>
              <small>Confirmed</small>
            </div>
          </div>

          <div className="floating-card floating-card-two">
            <span>✓</span>
            <div>
              <strong>Referral Closed</strong>
              <small>Feedback received</small>
            </div>
          </div>

        </div>
      </section>


      {/* ================= TRUST STRIP ================= */}

      <section className="trust-strip">
        <div>
          <strong>ONE CONNECTED WORKFLOW</strong>
          <span>
            From referral initiation to clinical feedback.
          </span>
        </div>

        <div className="trust-points">
          <span>✓ Secure</span>
          <span>✓ Trackable</span>
          <span>✓ Accountable</span>
          <span>✓ Patient-centred</span>
        </div>
      </section>


      {/* ================= HOW IT WORKS ================= */}

      <section
        id="how-it-works"
        className="content-section"
      >
        <div className="section-heading">
          <span className="eyebrow">
            HOW REFLINK WORKS
          </span>

          <h2>
            A referral should never disappear
            <br />
            after it leaves your facility.
          </h2>

          <p>
            REFLINK creates a connected workflow between the
            referring facility, receiving facility, and clinical
            team.
          </p>
        </div>

        <div className="steps-grid">

          <div className="step-card">
            <span className="step-number">01</span>
            <div className="step-icon">↗</div>
            <h3>Create Referral</h3>
            <p>
              Capture essential patient and clinical information
              and securely send the referral to an appropriate
              receiving facility.
            </p>
          </div>

          <div className="step-card">
            <span className="step-number">02</span>
            <div className="step-icon">◎</div>
            <h3>Track Referral</h3>
            <p>
              Follow the referral status from the moment it is
              sent until the receiving facility acknowledges it.
            </p>
          </div>

          <div className="step-card">
            <span className="step-number">03</span>
            <div className="step-icon">✓</div>
            <h3>Confirm Arrival</h3>
            <p>
              Receiving facilities can acknowledge arrival and
              update the patient's referral status.
            </p>
          </div>

          <div className="step-card">
            <span className="step-number">04</span>
            <div className="step-icon">↺</div>
            <h3>Close the Loop</h3>
            <p>
              Clinical feedback and outcome information return
              to the referring facility.
            </p>
          </div>

        </div>
      </section>


      {/* ================= PLATFORM ================= */}

      <section
        id="platform"
        className="platform-section"
      >
        <div className="platform-copy">

          <span className="eyebrow">
            BUILT FOR HEALTHCARE FACILITIES
          </span>

          <h2>
            One platform.
            <br />
            One referral journey.
          </h2>

          <p>
            REFLINK connects the different stages of referral
            coordination into a single digital workflow.
          </p>

          <div className="platform-list">

            <div>
              <span>01</span>
              <div>
                <strong>PHC Referral Management</strong>
                <p>
                  Create and monitor outgoing referrals from
                  primary healthcare facilities.
                </p>
              </div>
            </div>

            <div>
              <span>02</span>
              <div>
                <strong>Receiving Facility Coordination</strong>
                <p>
                  Receive, acknowledge and manage incoming
                  referrals.
                </p>
              </div>
            </div>

            <div>
              <span>03</span>
              <div>
                <strong>Clinical Continuity</strong>
                <p>
                  Maintain communication and feedback after
                  referral.
                </p>
              </div>
            </div>

          </div>

        </div>

        <div className="platform-panel">

          <div className="panel-top">
            <span>REFLINK WORKSPACE</span>
            <span className="panel-live">● LIVE</span>
          </div>

          <div className="mini-dashboard">

            <div className="mini-stat">
              <small>ACTIVE REFERRALS</small>
              <strong>24</strong>
            </div>

            <div className="mini-stat">
              <small>ACKNOWLEDGED</small>
              <strong>18</strong>
            </div>

            <div className="mini-stat">
              <small>COMPLETED</small>
              <strong>12</strong>
            </div>

          </div>

          <div className="mini-referral">

            <div className="mini-referral-top">
              <span>REF-2026-001245</span>
              <span>ACTIVE</span>
            </div>

            <strong>Primary Health Centre → Receiving Hospital</strong>

            <div className="progress-track">
              <span></span>
            </div>

            <div className="progress-labels">
              <span>Sent</span>
              <span>Acknowledged</span>
              <span>Arrival</span>
              <span>Feedback</span>
            </div>

          </div>

        </div>
      </section>


      {/* ================= CTA ================= */}

      <section className="final-cta">

        <div>
          <span className="eyebrow">
            CONNECTED REFERRAL CARE
          </span>

          <h2>
            Make every referral
            <br />
            count.
          </h2>

          <p>
            Give healthcare teams the visibility they need
            to coordinate referrals and follow patients
            across facilities.
          </p>
        </div>

        <button
          type="button"
          className="cta-button"
          onClick={openLogin}
        >
          Access REFLINK
          <span>→</span>
        </button>

      </section>

    </main>


    {/* ================= FOOTER ================= */}

    <footer className="modern-footer">

      <div className="footer-brand">

        <div className="brand">
          <img className="footer-brand-mark-image" src={REFLINK_MARK} alt="REFLINK logo" />

          <div>
            <h1>REFLINK</h1>
            <p>Connected Referral Care</p>
          </div>
        </div>

        <p>
          Digital closed-loop referral coordination
          for connected healthcare delivery.
        </p>

      </div>

      <div className="footer-links">

        <div>
          <strong>Platform</strong>
          <span>Digital Referrals</span>
          <span>Referral Tracking</span>
          <span>Clinical Feedback</span>
        </div>

        <div>
          <strong>Access</strong>
          <button type="button" onClick={openLogin}>
            Sign In
          </button>
        </div>

      </div>

      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} REFLINK
        </span>

        <span>
          Digital Closed-Loop Referral System
        </span>
      </div>

    </footer>
  </>
)}

      {/* =====================================================
          LOGIN
          ===================================================== */}

      {screen === "login" && (
        <div className="login-page">

          <div className="login-card">

            <img
  className="login-logo-image"
  src="/logo.png"
  alt="REFLINK — Digital Referral & Care-Continuity Platform"
/>

            <h2>
              Sign in to REFLINK
            </h2>

            <p>
              Access your healthcare referral workspace.
            </p>

            <label>
              Email Address
            </label>

            <input
              type="email"
              placeholder="name@facility.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label>
              Password
            </label>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              type="button"
              className="primary-button full-width"
              onClick={handleSignIn}
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            {loginError && (
              <p className="login-error">
                {loginError}
              </p>
            )}

            <button
              type="button"
              className="text-button"
              onClick={handlePasswordResetRequest}
              disabled={loading}
            >
              Forgot password?
            </button>

            <button
              type="button"
              className="back-button"
              onClick={() => setScreen("home")}
            >
              ← Back to home
            </button>

            <p className="demo-note">
              Secure authentication powered by REFLINK.
            </p>

          </div>

        </div>
      )}


      {/* =====================================================
          CHANGE PASSWORD
          ===================================================== */}

      {screen === "change-password" && (
        <div className="login-page password-page">
          <div className="login-card password-card">
            <img className="login-logo-image" src={REFLINK_LOGO} alt="REFLINK — Digital Referral & Care-Continuity Platform" />

            <span className="eyebrow">
              ACCOUNT SECURITY
            </span>

            <h2>Change Password</h2>

            <p>
              Replace your temporary or current password with a
              secure password that only you know.
            </p>

            <form onSubmit={handlePasswordChange}>
              <label>New Password</label>

              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm((previous) => ({
                    ...previous,
                    newPassword: e.target.value,
                  }))
                }
                placeholder="Enter a new password"
                autoComplete="new-password"
                minLength={8}
                required
              />

              <label>Confirm New Password</label>

              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm((previous) => ({
                    ...previous,
                    confirmPassword: e.target.value,
                  }))
                }
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                minLength={8}
                required
              />

              {passwordError && (
                <div className="login-error">
                  {passwordError}
                </div>
              )}

              {passwordMessage && (
                <div className="success-message">
                  {passwordMessage}
                </div>
              )}

              <button
                type="submit"
                className="primary-button full-width"
                disabled={passwordSaving}
              >
                {passwordSaving
                  ? "Updating Password..."
                  : "Update Password"}
              </button>
            </form>

            <button
              type="button"
              className="back-button"
              onClick={() => {
                setPasswordError("");
                setPasswordMessage("");
                setScreen(
                  role ? "dashboard" : "login"
                );
              }}
            >
              ← Back
            </button>

            <p className="demo-note">
              Use a unique password of at least 8 characters.
            </p>
          </div>
        </div>
      )}

      {/* =====================================================
          DASHBOARD
          ===================================================== */}

      {screen === "dashboard" && (
        <div className="dashboard-page">

          <header className="dashboard-header">

            <div className="brand">

              <img
  className="brand-mark-image"
  src="/reflink-mark.png"
  alt="REFLINK logo"
/>

              <div>
                <h1>REFLINK</h1>

                <p>
  {profile?.full_name
    ? `${profile.full_name} • ${role}`
    : role}
</p>
              </div>

            </div>

            <div className="dashboard-header-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setPasswordError("");
                  setPasswordMessage("");
                  setPasswordForm({
                    currentPassword: "",
                    newPassword: "",
                    confirmPassword: "",
                  });
                  setScreen("change-password");
                }}
              >
                Change Password
              </button>

              <button
                type="button"
                className="logout-button"
                onClick={logout}
              >
                Sign Out
              </button>
            </div>

          </header>

          <main className="dashboard">

            <div className="dashboard-title">

              <div>

                <span className="eyebrow">
                  REFLINK WORKSPACE
                </span>

                <h2>
                  {role} Dashboard
                </h2>

                <p>
                  Welcome to your referral management workspace.
                </p>

              </div>

            </div>

            {role === "PHC Staff" && (
              <PHCStaffDashboard
                onNewReferral={() => setScreen("new-referral")}
              />
            )}

            {role === "Receiving Facility" && (
              <ReceivingDashboard />
            )}

            {role === "Administrator" && (
              <AdministratorRoute>
                <AdminDashboard
                  profile={profile}
                  formatPatientAge={formatPatientAge}
                  getStatusLabel={getStatusLabel}
                />
              </AdministratorRoute>
            )}

          </main>

        </div>
      )}

      {/* =====================================================
          NEW REFERRAL
          ===================================================== */}

      {screen === "new-referral" && (
        <div className="dashboard-page">

          <header className="dashboard-header">

            <div className="brand">

              <img className="brand-mark-image" src={REFLINK_MARK} alt="REFLINK logo" />

              <div>
                <h1>REFLINK</h1>
                <p>PHC Staff</p>
              </div>

            </div>

            <button
              type="button"
              className="logout-button"
              onClick={logout}
            >
              Sign Out
            </button>

          </header>

          <main className="dashboard">

            <NewReferralForm
              onBack={() => setScreen("dashboard")}
              offlineVaultKey={offlineVaultKey}
              offlineVaultOwner={offlineVaultOwner}
              onRequestVault={() => setOfflineVaultVisible(true)}
            />

          </main>

        </div>
      )}

    </div>
  );
}

/* =========================================================
   NEW REFERRAL FORM
   ========================================================= */
/* =========================================================
   REFLINK DIAGNOSIS CATALOGUE
   ========================================================= */

const DIAGNOSIS_CATEGORIES = {
  "Maternal & Obstetric": [
    "Complicated labour",
    "Prolonged labour",
    "Obstructed labour",
    "Breech presentation",
    "Malpresentation",
    "Transverse lie",
    "Eclampsia",
    "Pre-eclampsia",
    "Pregnancy-induced hypertension",
    "Antepartum haemorrhage",
    "Postpartum haemorrhage",
    "Retained placenta",
    "Placenta previa",
    "Placental abruption",
    "Ruptured uterus",
    "Maternal sepsis",
    "Severe anaemia in pregnancy",
    "Multiple pregnancy",
    "Preterm labour",
    "Premature rupture of membranes",
    "Miscarriage",
    "Ectopic pregnancy",
    "Other obstetric condition",
  ],

  "Neonatal": [
    "Birth asphyxia",
    "Neonatal sepsis",
    "Neonatal jaundice",
    "Prematurity",
    "Low birth weight",
    "Respiratory distress",
    "Neonatal convulsion",
    "Other neonatal condition",
  ],

  "Paediatric": [
    "Severe acute malnutrition",
    "Moderate acute malnutrition",
    "Pneumonia",
    "Severe pneumonia",
    "Malaria",
    "Severe malaria",
    "Diarrhoeal disease",
    "Dehydration",
    "Febrile illness",
    "Convulsion",
    "Meningitis",
    "Anaemia",
    "Other paediatric condition",
  ],

  "Infectious Diseases": [
    "Malaria",
    "Severe malaria",
    "Tuberculosis",
    "Pneumonia",
    "Sepsis",
    "Meningitis",
    "Typhoid fever",
    "Cholera",
    "Measles",
    "Other infectious disease",
  ],

  "Medical": [
    "Hypertension",
    "Hypertensive emergency",
    "Diabetes mellitus",
    "Severe anaemia",
    "Heart failure",
    "Stroke",
    "Asthma",
    "Chronic obstructive pulmonary disease",
    "Acute kidney injury",
    "Chronic kidney disease",
    "Sepsis",
    "Other medical condition",
  ],

  "Surgical": [
    "Acute abdomen",
    "Appendicitis",
    "Intestinal obstruction",
    "Perforation",
    "Complicated hernia",
    "Abscess",
    "Wound complication",
    "Other surgical condition",
  ],

  "Emergency & Trauma": [
    "Road traffic injury",
    "Head injury",
    "Fracture",
    "Burns",
    "Severe bleeding",
    "Poisoning",
    "Snake bite",
    "Other emergency condition",
  ],

  "Other": [
    "Diagnosis not established",
    "Other condition",
  ],
};
/* =========================================================
   REFLINK INVESTIGATION CATALOGUE
   ========================================================= */

const INVESTIGATION_CATEGORIES = {
  "Point-of-Care / Bedside": [
    "Temperature",
    "Blood pressure",
    "Pulse rate",
    "Respiratory rate",
    "Oxygen saturation (SpO₂)",
    "Blood glucose",
    "Malaria RDT",
    "Pregnancy test",
    "Urinalysis",
  ],

  "Haematology": [
    "Full blood count (FBC)",
    "Haemoglobin / PCV",
    "White blood cell count",
    "Platelet count",
    "Blood group",
    "Cross-match",
    "Sickle cell test",
  ],

  "Chemistry": [
    "Urea",
    "Electrolytes",
    "Creatinine",
    "Liver function test",
    "Serum glucose",
  ],

  "Microbiology / Infectious Disease": [
    "Malaria microscopy",
    "Blood culture",
    "Urine microscopy/culture",
    "Stool microscopy",
    "Sputum examination",
    "TB investigation",
    "HIV test",
    "Hepatitis B test",
    "Hepatitis C test",
  ],

  "Obstetric / Maternal": [
    "Obstetric ultrasound",
    "Pregnancy test",
    "Fetal heart rate assessment",
    "Urinalysis",
    "Haemoglobin / PCV",
    "Blood group",
    "Cross-match",
  ],

  "Imaging": [
    "Ultrasound",
    "X-ray",
    "CT scan",
    "MRI",
  ],

  "Other": [
    "Other investigation",
    "No investigation performed",
  ],
};
function InvestigationResultEditor({ item, onChange, onFileChange }) {
  const config = getInvestigationResultConfig(item?.investigation);
  const layoutClass = ["quantitative", "blood_pressure", "electrolytes", "fbc_panel"].includes(config.type)
    ? "is-quantitative"
    : "is-textual";

  return (
    <div className={`referral-investigation-result-editor ${layoutClass}`}>
      <select value={item.result_status || "pending"} onChange={(e) => onChange({ result_status: e.target.value })} aria-label={`Result status for ${item.investigation}`}>
        {config.statuses.map((status) => <option key={status} value={status}>{getInvestigationResultLabel(status)}</option>)}
      </select>

      {config.type === "blood_group" && (
        <select value={item.result_value || ""} aria-label="Blood group ABO Rh" onChange={(e) => onChange({ result_value: e.target.value, result_status: e.target.value ? "result_recorded" : "pending" })}>
          <option value="">Select blood group</option>
          {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
      )}

      {config.type === "blood_pressure" && (
        <>
          <input inputMode="decimal" value={item.systolic || ""} onChange={(e) => onChange({ systolic: e.target.value })} placeholder="Systolic (mmHg)" aria-label="Systolic blood pressure" />
          <input inputMode="decimal" value={item.diastolic || ""} onChange={(e) => onChange({ diastolic: e.target.value })} placeholder="Diastolic (mmHg)" aria-label="Diastolic blood pressure" />
        </>
      )}

      {config.type === "electrolytes" && (
        <>
          <input inputMode="decimal" value={item.sodium || ""} onChange={(e) => onChange({ sodium: e.target.value })} placeholder="Sodium Na⁺ (mmol/L)" aria-label="Sodium" />
          <input inputMode="decimal" value={item.potassium || ""} onChange={(e) => onChange({ potassium: e.target.value })} placeholder="Potassium K⁺ (mmol/L)" aria-label="Potassium" />
          <input inputMode="decimal" value={item.chloride || ""} onChange={(e) => onChange({ chloride: e.target.value })} placeholder="Chloride Cl⁻ (mmol/L)" aria-label="Chloride" />
          <input inputMode="decimal" value={item.bicarbonate || ""} onChange={(e) => onChange({ bicarbonate: e.target.value })} placeholder="Bicarbonate HCO₃⁻ (mmol/L)" aria-label="Bicarbonate" />
        </>
      )}

      {config.type === "fbc_panel" && (
        <>
          <input inputMode="decimal" value={item.haemoglobin || ""} onChange={(e) => onChange({ haemoglobin: e.target.value })} placeholder="Haemoglobin (g/dL)" aria-label="Haemoglobin" />
          <input inputMode="decimal" value={item.pcv || ""} onChange={(e) => onChange({ pcv: e.target.value })} placeholder="PCV (%)" aria-label="PCV" />
          <input inputMode="decimal" value={item.wbc || ""} onChange={(e) => onChange({ wbc: e.target.value })} placeholder="WBC (10^9/L)" aria-label="White blood cell count" />
          <input inputMode="decimal" value={item.platelets || ""} onChange={(e) => onChange({ platelets: e.target.value })} placeholder="Platelets (10^9/L)" aria-label="Platelet count" />
          <textarea value={item.result_value || ""} onChange={(e) => onChange({ result_value: e.target.value })} placeholder="Additional FBC report details" rows={2} aria-label="Additional FBC report details" />
        </>
      )}

      {config.type === "quantitative" && (
        <>
          <input inputMode="decimal" value={item.result_value || ""} onChange={(e) => onChange({ result_value: e.target.value })} placeholder="Measured value" aria-label={`Measured value for ${item.investigation}`} />
          <input value={item.result_unit || config.defaultUnit || ""} onChange={(e) => onChange({ result_unit: e.target.value })} placeholder={config.defaultUnit || "Unit"} aria-label={`Unit for ${item.investigation}`} />
          <input value={item.reference_range || ""} onChange={(e) => onChange({ reference_range: e.target.value })} placeholder="Laboratory reference range" aria-label={`Reference range for ${item.investigation}`} />
        </>
      )}

      {config.type === "panel" && <textarea value={item.result_value || ""} onChange={(e) => onChange({ result_value: e.target.value })} placeholder="Panel findings, e.g. pH, protein, glucose, blood, nitrite and leukocytes" rows={2} aria-label={`Panel findings for ${item.investigation}`} />}

      {(config.type === "qualitative" || config.type === "microbiology" || config.type === "imaging") && <textarea value={item.result_value || ""} onChange={(e) => onChange({ result_value: e.target.value })} placeholder={config.type === "imaging" ? "Imaging report details" : "Additional result details"} rows={2} aria-label={`Result details for ${item.investigation}`} />}

      <label className="upload-result-button compact-upload">📎 Upload<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv" onChange={(e) => onFileChange(e.target.files?.[0] || null)} /></label>
    </div>
  );
}

function NewReferralForm({ onBack, offlineVaultKey, offlineVaultOwner, onRequestVault }) {
  const { t } = useLanguage();

  const [form, setForm] = useState({
  patient_identifier: "",
  patient_age_months: "",
  patient_age_unit: "years",
  patient_sex: "",

  // NEW PATIENT CONTACT INFORMATION
  patient_phone: "",
  patient_address: "",

  // NEW RELATIVE / CAREGIVER INFORMATION
  relative_name: "",
  relative_relationship: "",
  relative_phone: "",

  // CLINICAL INFORMATION
  chief_complaint: "",
  chief_complaint_category: "",
  chief_complaint_other: "",
  clinical_summary: "",
  physical_findings: "",
  physical_findings_structured: [],
  physical_findings_other: "",

  // DIAGNOSIS
diagnosis_status: "",
diagnosis_category: "",
provisional_diagnosis: "",

  // INVESTIGATIONS
  investigation_category: "",
  investigations: "",

  // STRUCTURED TREATMENT WITH OPTIONAL OTHER
  treatment_given: "",
  treatment_given_structured: [],
  treatment_given_other: "",

  // REFERRAL
  referral_reason: "",
  urgency: "routine",
  receiving_facility_id: "",
});

  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Multiple diagnosis entries: each diagnosis carries its own status and category.
  const [diagnosisEntries, setDiagnosisEntries] = useState([]);
  const [diagnosisDraft, setDiagnosisDraft] = useState({
    status: "",
    category: "",
    diagnosis: "",
  });

  // Multiple investigation categories and investigations.
  const [selectedInvestigationCategories, setSelectedInvestigationCategories] =
    useState([]);
  const [selectedInvestigations, setSelectedInvestigations] = useState([]);
  const [printDraft, setPrintDraft] = useState(null);
  const [savedReferralInfo, setSavedReferralInfo] = useState(null);
  const [pendingOfflineReferral, setPendingOfflineReferral] = useState(null);

  useEffect(() => {
    if (!pendingOfflineReferral || !offlineVaultKey
      || String(pendingOfflineReferral.referring_user_id) !== String(offlineVaultOwner)) return undefined;
    let active = true;
    const persistPendingReferral = async () => {
      try {
        await queueEncryptedReferral(pendingOfflineReferral, offlineVaultOwner, offlineVaultKey);
        if (!active) return;
        setMessage(`Saved securely in the offline queue. Referral ${pendingOfflineReferral.referral_number} will sync when connected.`);
        setSavedReferralInfo({
          referralNumber: pendingOfflineReferral.referral_number,
          patientIdentifier: pendingOfflineReferral.patient_identifier,
        });
        setPendingOfflineReferral(null);
      } catch (queueError) {
        if (active) setError(queueError?.message || "The referral could not be encrypted and saved. It has not been stored.");
      }
    };
    persistPendingReferral();
    return () => { active = false; };
  }, [pendingOfflineReferral, offlineVaultKey, offlineVaultOwner]);

  useEffect(() => {
    loadFacilities();
  }, []);

  const loadFacilities = async () => {

    const { data, error } = await supabase
      .from("facilities")
      .select(
        "id, name, facility_type, state, lga, is_active"
      )
      .eq("is_active", true)
      .order("name");

    if (error) {
      const cachedFacilities = await getCachedValue("facilities", []);
      if (Array.isArray(cachedFacilities) && cachedFacilities.length) {
        setFacilities(cachedFacilities);
        setError("You are offline. Using your last saved facility list.");
        return;
      }
      setError("Unable to load receiving facilities.");
      console.error(error);
      return;
    }

    setFacilities(data || []);
    try { await cacheValue("facilities", data || []); } catch (cacheError) { console.warn("REFLINK facility cache skipped", cacheError); }
  };

  const handleChange = (e) => {

    const {
      name,
      value,
    } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };


  const addDiagnosisEntry = () => {
    const { status, category, diagnosis } = diagnosisDraft;

    if (!status || !category || !diagnosis) {
      setError(
        "Select a diagnosis status, diagnosis category and diagnosis before adding it."
      );
      return;
    }

    const duplicate = diagnosisEntries.some(
      (item) =>
        item.status === status &&
        item.category === category &&
        item.diagnosis === diagnosis
    );

    if (duplicate) {
      setError("That diagnosis has already been added.");
      return;
    }

    setDiagnosisEntries((previous) => [
      ...previous,
      {
        status,
        category,
        diagnosis,
      },
    ]);

    setDiagnosisDraft({
      status: "",
      category: "",
      diagnosis: "",
    });

    setError("");
  };

  const removeDiagnosisEntry = (index) => {
    setDiagnosisEntries((previous) =>
      previous.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const toggleInvestigationCategory = (category) => {
    setSelectedInvestigationCategories((previous) => {
      const exists = previous.includes(category);

      if (exists) {
        setSelectedInvestigations((items) =>
          items.filter((item) => item.category !== category)
        );

        return previous.filter((item) => item !== category);
      }

      return [...previous, category];
    });
  };

  const toggleInvestigation = (category, investigation) => {
    setSelectedInvestigations((previous) => {
      const exists = previous.some(
        (item) =>
          item.category === category &&
          item.investigation === investigation
      );

      if (exists) {
        return previous.filter(
          (item) =>
            !(
              item.category === category &&
              item.investigation === investigation
            )
        );
      }

      return [
        ...previous,
        {
          category,
          investigation,
          result_status: "pending",
          result_value: "",
          result_unit: getInvestigationResultConfig(investigation).defaultUnit || "",
          reference_range: "",
          interpretation: "",
          result_notes: "",
          result_file_path: "",
          result_file_name: "",
          result_file_type: "",
          result_file_size: null,
        },
      ];
    });
  };

  const updateInvestigationResult = (index, patch) => {
    setSelectedInvestigations((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const handleInvestigationFileSelection = (index, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Investigation result file must not exceed 10 MB."); return; }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv"];
    if (file.type && !allowed.includes(file.type)) { setError("Unsupported investigation result file type."); return; }
    updateInvestigationResult(index, { result_file: file, result_file_name: file.name, result_file_type: file.type, result_file_size: file.size });
    setError("");
  };

  const printDraftReferral = () => {
    const draftReferral = {
      referral_number: "DRAFT REFERRAL",
      patient_identifier: form.patient_identifier,
      patient_age_months: normalizePatientAgeToMonths(
        form.patient_age_months,
        form.patient_age_unit
      ),
      patient_sex: form.patient_sex,
      patient_phone: form.patient_phone,
      patient_address: form.patient_address,
      relative_name: form.relative_name,
      relative_relationship: form.relative_relationship,
      relative_phone: form.relative_phone,
      chief_complaint: form.chief_complaint,
      clinical_summary: form.clinical_summary,
      physical_findings: form.physical_findings,
      diagnosis_records: diagnosisEntries,
      investigation_categories: selectedInvestigationCategories,
      investigation_records: selectedInvestigations,
      treatment_given: form.treatment_given,
      referral_reason: form.referral_reason,
      urgency: form.urgency,
      status: "sent",
      created_at: new Date().toISOString(),
    };

    setPrintDraft(draftReferral);
    window.setTimeout(() => window.print(), 80);
  };

  const generateReferralNumber = () => {

    const year =
      new Date().getFullYear();

    const randomPart =
      Math.floor(
        100000 +
        Math.random() * 900000
      );

    return `RF-${year}-${randomPart}`;
  };

  const toggleStructuredValue = (field, value) => {
    setForm((previous) => {
      const current = Array.isArray(previous[field]) ? previous[field] : [];
      return { ...previous, [field]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] };
    });
  };

  const validateReferralEntry = () => {
    if (!form.patient_identifier.trim()) return "Patient identifier is required.";
    if (form.patient_age_months === "") return "Patient age is required.";
    if (!form.patient_sex) return "Patient sex is required.";
    if (!form.chief_complaint_category && !form.chief_complaint.trim()) return "Chief complaint is required.";
    if (!form.urgency) return "Referral urgency is required.";
    if (!form.receiving_facility_id) return "Receiving facility is required.";
    if (form.urgency === "emergency" && !form.physical_findings.trim() && form.physical_findings_structured.length === 0) return "Emergency referrals require clinical findings.";
    return "";
  };

  const buildStructuredText = (items, other, fallback = "") => {
    const values = [...(Array.isArray(items) ? items : [])];
    if (other?.trim()) values.push(`Other: ${other.trim()}`);
    return values.join(", ") || fallback || null;
  };

  const notifyReferralBySms = async (referralId, type = "referral_sent") => {
    try {
      if (type === "referral_sent" && form.urgency === "routine") return;
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) return;
      const response = await fetch("/api/referral-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ referralId, type }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) console.warn("REFLINK SMS notification:", result?.error || response.statusText);
    } catch (smsError) {
      console.warn("REFLINK SMS notification unavailable", smsError);
    }
  };

  const handleSubmit = async (e) => {

    e.preventDefault();

    setError("");
    setSavedReferralInfo(null);
    setMessage("");
    const validationError = validateReferralEntry();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (diagnosisEntries.length === 0) {
      const proceed = window.confirm("No diagnosis category has been selected. This will reduce referral analytics quality. Continue?");
      if (!proceed) return;
    }
    setLoading(true);

    try {
      const createdAt = new Date().toISOString();
      const offlineClientId = createClientId();
      const structuredChiefComplaint = form.chief_complaint_category === "Other"
        ? (form.chief_complaint_other.trim() || "Other")
        : (form.chief_complaint_category || form.chief_complaint.trim());
      const structuredPhysicalFindings = Array.isArray(form.physical_findings_structured) ? form.physical_findings_structured : [];
      const structuredTreatment = Array.isArray(form.treatment_given_structured) ? form.treatment_given_structured : [];

      if (!navigator.onLine) {
        const { data: { session } } = await supabase.auth.getSession();
        const cachedProfile = session?.user?.id ? await getCachedValue(`profile:${session.user.id}`, null) : null;
        if (!cachedProfile?.facility_id || !session?.user?.id) {
          throw new Error("You are offline and your signed-in facility profile is not available on this device yet. Connect once to initialize offline mode.");
        }
        const offlinePayload = {
          referral_number: generateReferralNumber(),
          offline_client_id: offlineClientId,
          sync_source: "offline",
          is_test: import.meta.env.DEV || import.meta.env.VITE_REFLINK_TEST_MODE === "true",
          created_at: createdAt,
          patient_identifier: form.patient_identifier.trim(),
          patient_age_months: normalizePatientAgeToMonths(form.patient_age_months, form.patient_age_unit),
          patient_sex: form.patient_sex,
          patient_phone: form.patient_phone?.trim() || null,
          patient_address: form.patient_address?.trim() || null,
          relative_name: form.relative_name?.trim() || null,
          relative_relationship: form.relative_relationship || null,
          relative_phone: form.relative_phone?.trim() || null,
          chief_complaint: structuredChiefComplaint,
          chief_complaint_category: form.chief_complaint_category || null,
          chief_complaint_other: form.chief_complaint_other?.trim() || null,
          clinical_summary: form.clinical_summary || null,
          physical_findings: buildStructuredText(structuredPhysicalFindings, form.physical_findings_other, form.physical_findings),
          physical_findings_structured: structuredPhysicalFindings,
          diagnosis_records: diagnosisEntries,
          diagnosis_status: [...new Set(diagnosisEntries.map((item) => item.status))].join(", ") || null,
          diagnosis_category: [...new Set(diagnosisEntries.map((item) => item.category))].join(", ") || null,
          diagnosis_category_other: diagnosisDraft.category === "Other" ? diagnosisDraft.diagnosis : null,
          provisional_diagnosis: diagnosisEntries.map((item) => `${item.status}: ${item.diagnosis}`).join(" • ") || null,
          investigation_categories: selectedInvestigationCategories,
          investigation_records: selectedInvestigations.map(({ result_file, ...item }) => item),
          investigations: selectedInvestigations.map((item) => `${item.investigation} (${item.category})`).join(" • ") || null,
          treatment_given: buildStructuredText(structuredTreatment, form.treatment_given_other, form.treatment_given),
          treatment_given_structured: structuredTreatment,
          referral_reason: form.referral_reason || null,
          urgency: form.urgency,
          referring_facility_id: cachedProfile.facility_id,
          receiving_facility_id: form.receiving_facility_id,
          referring_user_id: session.user.id,
          status: "sent",
        };
        if (offlineVaultKey && String(offlineVaultOwner) === String(session.user.id)) {
          await queueEncryptedReferral(offlinePayload, session.user.id, offlineVaultKey);
          setMessage(`Saved securely in the offline queue. Referral ${offlinePayload.referral_number} will sync when connected.`);
          setSavedReferralInfo({ referralNumber: offlinePayload.referral_number, patientIdentifier: form.patient_identifier });
        } else {
          setPendingOfflineReferral(offlinePayload);
          onRequestVault?.();
          setMessage("Unlock or create your offline vault to encrypt and save this referral. The referral has not yet been stored.");
        }
        setLoading(false);
        return;
      }

      try { await syncQueuedReferrals(supabase, offlineVaultKey); } catch (syncError) { console.warn("REFLINK pre-submit offline sync", syncError); }

      const {
        data: {
          user,
        },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "id, facility_id, role"
        )
        .eq("id", user.id)
        .single();

      if (
        profileError ||
        !profile
      ) {
        throw new Error(
          "Your REFLINK profile could not be found."
        );
      }

      if (!profile.facility_id) {
        throw new Error(
          "Your account has not been assigned to a healthcare facility yet."
        );
      }

      const referralNumber =
        generateReferralNumber();
// REFLINK V2: Verify the destination against live Supabase data.
const cachedDestination = facilities.find(
  (facility) =>
    String(facility.id) === String(form.receiving_facility_id)
);

if (!form.receiving_facility_id) {
  throw new Error("Please select a receiving facility.");
}

const {
  data: verifiedDestination,
  error: destinationCheckError,
} = await supabase
  .from("facilities")
  .select("id, name, is_active")
  .eq("id", form.receiving_facility_id)
  .maybeSingle();

if (destinationCheckError) {
  throw new Error(
    `Could not verify the receiving facility: ${destinationCheckError.message}`
  );
}

if (!verifiedDestination || verifiedDestination.is_active === false) {
  throw new Error(
    "The selected receiving facility is unavailable. Refresh the page and select a facility again."
  );
}

if (
  !cachedDestination ||
  cachedDestination.name.trim() !== verifiedDestination.name.trim()
) {
  throw new Error(
    `Receiving facility mismatch. The local selection is "${cachedDestination?.name ?? "Unknown"}", but Supabase identifies it as "${verifiedDestination.name}". Refresh the page and select the correct facility. No referral was submitted.`
  );
}

const confirmDestination = window.confirm(
  `Please confirm the receiving facility:\n\n${verifiedDestination.name}\n\nUrgency: ${form.urgency.toUpperCase()}\n\nContinue with referral submission?`
);

if (!confirmDestination) {
  return;
}
      const referralPayload = {
  referral_number:
    referralNumber,

  patient_identifier:
    form.patient_identifier,

  patient_age_months:
    normalizePatientAgeToMonths(
      form.patient_age_months,
      form.patient_age_unit
    ),

  patient_sex:
    form.patient_sex ||
    null,

  created_at: createdAt,
  offline_client_id: offlineClientId,
  sync_source: "online",
  is_test: import.meta.env.DEV || import.meta.env.VITE_REFLINK_TEST_MODE === "true",

  // NEW PATIENT CONTACT INFORMATION
  patient_phone:
    form.patient_phone?.trim() ||
    null,

  patient_address:
    form.patient_address?.trim() ||
    null,

  // NEW RELATIVE / CAREGIVER INFORMATION
  relative_name:
    form.relative_name?.trim() ||
    null,

  relative_relationship:
    form.relative_relationship ||
    null,

  relative_phone:
    form.relative_phone?.trim() ||
    null,

  chief_complaint:
    structuredChiefComplaint ||
    null,

  chief_complaint_category:
    form.chief_complaint_category || null,

  chief_complaint_other:
    form.chief_complaint_other?.trim() || null,

  clinical_summary:
    form.clinical_summary ||
    null,

  physical_findings:
    buildStructuredText(structuredPhysicalFindings, form.physical_findings_other, form.physical_findings) || null,

  physical_findings_structured: structuredPhysicalFindings,

  // MULTIPLE DIAGNOSES
  diagnosis_records:
    diagnosisEntries,

  // Keep legacy fields populated for compatibility with existing records/views.
  diagnosis_status:
    [...new Set(diagnosisEntries.map((item) => item.status))]
      .join(", ") || null,

  diagnosis_category:
    [...new Set(diagnosisEntries.map((item) => item.category))]
      .join(", ") || null,

  diagnosis_category_other:
    diagnosisEntries.some((item) => item.category === "Other")
      ? diagnosisEntries.find((item) => item.category === "Other")?.diagnosis || null
      : null,

  provisional_diagnosis:
    diagnosisEntries
      .map(
        (item) =>
          `${item.status}: ${item.diagnosis}`
      )
      .join(" • ") || null,

  // MULTIPLE INVESTIGATIONS
  investigation_categories:
    selectedInvestigationCategories,

  investigation_records:
    selectedInvestigations.map(({ result_file, ...item }) => item),

  investigations:
    selectedInvestigations
      .map(
        (item) =>
          `${item.investigation} (${item.category})`
      )
      .join(" • ") || null,

  // KEEP THIS AS IT CURRENTLY WORKS
  treatment_given:
    buildStructuredText(structuredTreatment, form.treatment_given_other, form.treatment_given) || null,

  treatment_given_structured: structuredTreatment,

        referral_reason:
          form.referral_reason ||
          null,

        urgency:
          form.urgency ||
          "routine",

        referring_facility_id:
          profile.facility_id,

        receiving_facility_id:
          form.receiving_facility_id,

        referring_user_id:
          user.id,

        status:
          "sent",
      };

      const {
        data: insertedReferral,
        error: referralError,
      } = await supabase
        .from("referrals")
        .insert(referralPayload)
        .select("id")
        .single();

      if (referralError) {
        console.error(
          "REFERRAL INSERT ERROR:",
          referralError
        );

        throw referralError;
      }

      if (insertedReferral?.id && ["emergency", "urgent"].includes(form.urgency)) {
        void notifyReferralBySms(insertedReferral.id, "referral_sent");
      }

      let savedInvestigationRecords = selectedInvestigations.map(({ result_file, ...item }) => item);
      if (insertedReferral?.id) {
        for (let i = 0; i < selectedInvestigations.length; i += 1) {
          const file = selectedInvestigations[i]?.result_file;
          if (!file) continue;
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${insertedReferral.id}/${Date.now()}-${i}-${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from("referral-investigation-results")
            .upload(path, file, { upsert: false, contentType: file.type || undefined });
          if (uploadError) throw uploadError;
          savedInvestigationRecords = savedInvestigationRecords.map((item, itemIndex) =>
            itemIndex === i ? { ...item, result_file_path: path, result_file_name: file.name, result_file_type: file.type, result_file_size: file.size } : item
          );
        }
        if (savedInvestigationRecords.length) {
          const { error: resultMetaError } = await supabase.from("referrals").update({ investigation_records: savedInvestigationRecords }).eq("id", insertedReferral.id);
          if (resultMetaError) throw resultMetaError;
        }
      }

      const referringFacility = facilities.find(
        (facility) => facility.id === profile.facility_id
      );
      const receivingFacility = facilities.find(
        (facility) => facility.id === form.receiving_facility_id
      );

      const savedReferral = {
        ...referralPayload,
        id: insertedReferral?.id,
        investigation_records: savedInvestigationRecords,
        referral_number: referralNumber,
        created_at: new Date().toISOString(),
        referring_facility_name: referringFacility?.name || "Not recorded",
        receiving_facility_name: receivingFacility?.name || "Not recorded",
      };

      setSavedReferralInfo({
        referralId: insertedReferral?.id || null,
        referralNumber,
        patientIdentifier: form.patient_identifier,
      });
      setPrintDraft(savedReferral);

      setMessage(
        `Referral saved successfully. Patient: ${form.patient_identifier || "Not recorded"} • REFLINK ID: ${referralNumber}`
      );

      setForm({
  patient_identifier: "",
  patient_age_months: "",
  patient_age_unit: "years",
  patient_sex: "",

  patient_phone: "",
  patient_address: "",

  relative_name: "",
  relative_relationship: "",
  relative_phone: "",

  chief_complaint: "",
  chief_complaint_category: "",
  chief_complaint_other: "",
  clinical_summary: "",
  physical_findings: "",
  physical_findings_structured: [],
  physical_findings_other: "",

  diagnosis_status: "",
  diagnosis_category: "",
  provisional_diagnosis: "",

  investigation_category: "",
  investigations: "",
  treatment_given: "",
  treatment_given_structured: [],
  treatment_given_other: "",

  referral_reason: "",
  urgency: "routine",
  receiving_facility_id: "",
});

      setDiagnosisEntries([]);
      setDiagnosisDraft({
        status: "",
        category: "",
        diagnosis: "",
      });
      setSelectedInvestigationCategories([]);
      setSelectedInvestigations([]);

    } catch (err) {

      console.error(
        "Referral creation error:",
        err
      );

      setError(
        err.message ||
        "Unable to create referral."
      );

    } finally {

      setLoading(false);

    }
  };

  return (
    <div className="dashboard-card referral-form-card">

      <div className="form-header">

        <div>

          <span className="eyebrow">
            DIGITAL REFERRAL
          </span>

          <h2>
            {t("newReferral")}
          </h2>

          <p>
            Create a secure referral to a receiving facility.
          </p>

        </div>

        <div className="form-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={printDraftReferral}
          >
            🖨 Print Draft
          </button>

          <button
            type="button"
            className="back-button"
            onClick={onBack}
          >
            ← {t("back")}
          </button>
        </div>

      </div>

      {message && (
        <div className="success-message referral-save-success">
          <div>
            <strong>{message}</strong>
            {savedReferralInfo && (
              <span className="saved-referral-id-line">
                Patient: {savedReferralInfo.patientIdentifier || "Not recorded"}
                <br />
                REFLINK ID: <strong>{savedReferralInfo.referralNumber}</strong>
              </span>
            )}
          </div>

          {savedReferralInfo && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => printReferralForm(printDraft, "REFERRING FACILITY COPY", (count) => setPrintDraft((previous) => ({ ...previous, print_count: count })))}
            >
              🖨 Print Saved Form
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="login-error">
          {error}
        </div>
      )}

      <form
  className="new-referral-form"
  onSubmit={handleSubmit}
>

        <h3>
          {t("patientInformation")}
        </h3>

        <label>
          Patient Identifier *
        </label>

        <input
          name="patient_identifier"
          value={form.patient_identifier}
          onChange={handleChange}
          placeholder="e.g. PT-001"
          required
        />

        <div className="patient-information-grid">

  {/* Patient Age */}
  <div className="form-group">
    <label htmlFor="patient_age_months">
      Patient Age
    </label>

    <div className="age-input-row">
      <input
        id="patient_age_months"
        type="number"
        name="patient_age_months"
        value={form.patient_age_months}
        onChange={handleChange}
        min="0"
        step="1"
        placeholder={
          form.patient_age_unit === "months"
            ? "e.g. 8"
            : "e.g. 22"
        }
        aria-label="Patient age value"
      />

      <select
        name="patient_age_unit"
        value={form.patient_age_unit}
        onChange={handleChange}
        aria-label="Patient age unit"
      >
        <option value="months">Months</option>
        <option value="years">Years</option>
      </select>
    </div>

    <div className="form-help-text">
      Use months for infants and young children; use years for older
      children and adults. REFLINK stores the normalized value in
      months for consistent analytics.
    </div>

    <div className="form-help-text age-normalized-preview">
      {form.patient_age_months !== ""
        ? `Recorded as: ${formatPatientAge(
            normalizePatientAgeToMonths(
              form.patient_age_months,
              form.patient_age_unit
            )
          )}`
        : "Recorded age will appear here."}
    </div>
  </div>


  {/* Sex */}
  <div className="form-group">
    <label htmlFor="patient_sex">
      Sex
    </label>

    <select
      id="patient_sex"
      name="patient_sex"
      value={form.patient_sex}
      onChange={handleChange}
    >
      <option value="">
        Select sex
      </option>

      <option value="male">
        Male
      </option>

      <option value="female">
        Female
      </option>

      <option value="other">
        Other
      </option>
    </select>
  </div>


  {/* Patient Phone */}
  <div className="form-group">
    <label htmlFor="patient_phone">
      Patient Phone Number
    </label>

    <input
      id="patient_phone"
      type="tel"
      name="patient_phone"
      value={form.patient_phone}
      onChange={handleChange}
      placeholder="e.g. 08012345678"
    />
  </div>


  {/* Patient Address */}
  <div className="form-group">
    <label htmlFor="patient_address">
      Patient Address
    </label>

    <textarea
      id="patient_address"
      name="patient_address"
      value={form.patient_address}
      onChange={handleChange}
      rows={2}
      placeholder="Enter patient's address"
    />
  </div>

</div>


{/* Relative / Caregiver Information */}
<div className="form-section caregiver-section">

  <h4>
    Relative / Caregiver Information
  </h4>

  <div className="caregiver-grid">

    <div className="form-group">
      <label htmlFor="relative_name">
        Relative / Caregiver Name
      </label>

      <input
        id="relative_name"
        type="text"
        name="relative_name"
        value={form.relative_name}
        onChange={handleChange}
        placeholder="Enter name"
      />
    </div>


    <div className="form-group">
      <label htmlFor="relative_relationship">
        Relationship to Patient
      </label>

      <select
        id="relative_relationship"
        name="relative_relationship"
        value={form.relative_relationship}
        onChange={handleChange}
      >
        <option value="">
          Select relationship
        </option>

        <option value="parent">
          Parent
        </option>

        <option value="spouse">
          Spouse
        </option>

        <option value="child">
          Child
        </option>

        <option value="sibling">
          Sibling
        </option>

        <option value="guardian">
          Guardian
        </option>

        <option value="other">
          Other
        </option>
      </select>
    </div>


    <div className="form-group">
      <label htmlFor="relative_phone">
        Relative / Caregiver Phone Number
      </label>

      <input
        id="relative_phone"
        type="tel"
        name="relative_phone"
        value={form.relative_phone}
        onChange={handleChange}
        placeholder="e.g. 08012345678"
      />
    </div>

  </div>

</div>

        <h3>
          {t("clinicalInformation")}
        </h3>

        <label>
          Chief Complaint *
        </label>
        <select
          value={form.chief_complaint_category}
          onChange={(e) => setForm((previous) => ({ ...previous, chief_complaint_category: e.target.value, chief_complaint: e.target.value === "Other" ? previous.chief_complaint_other : e.target.value }))}
          required
        >
          <option value="">Select chief complaint</option>
          {CHIEF_COMPLAINT_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        {form.chief_complaint_category === "Other" && (
          <input name="chief_complaint_other" value={form.chief_complaint_other} onChange={(e) => setForm((previous) => ({ ...previous, chief_complaint_other: e.target.value, chief_complaint: e.target.value }))} placeholder="Describe the chief complaint" required />
        )}

        <label>
          Clinical Summary
        </label>

        <textarea
          name="clinical_summary"
          value={form.clinical_summary}
          onChange={handleChange}
          placeholder="Brief clinical history and relevant information"
        />

        <label>
          Physical Findings {form.urgency === "emergency" ? "*" : ""}
        </label>
        <div className="checkbox-grid reflink-clinical-checks">
          {PHYSICAL_FINDING_OPTIONS.map((item) => (
            <label key={item} className={`selection-checkbox ${form.physical_findings_structured.includes(item) ? "is-selected" : ""}`}>
              <input type="checkbox" checked={form.physical_findings_structured.includes(item)} onChange={() => toggleStructuredValue("physical_findings_structured", item)} />
              <span>{item}</span>
            </label>
          ))}
        </div>
        {form.physical_findings_structured.includes("Other") && (
          <input name="physical_findings_other" value={form.physical_findings_other} onChange={handleChange} placeholder="Other physical finding" />
        )}
        <textarea name="physical_findings" value={form.physical_findings} onChange={handleChange} placeholder="Additional clinical findings / narrative context" />

      <div className="form-section clinical-selection-section">
        <div className="section-heading-inline">
          <div>
            <h4>Diagnosis</h4>
            <p>
              Add as many suspected, provisional or confirmed diagnoses as clinically appropriate.
              Each diagnosis keeps its own status and category.
            </p>
          </div>
        </div>

        <div className="clinical-entry-grid">
          <div className="form-group">
            <label htmlFor="diagnosis_status">
              Diagnosis Status
            </label>

            <select
              id="diagnosis_status"
              value={diagnosisDraft.status}
              onChange={(e) =>
                setDiagnosisDraft((previous) => ({
                  ...previous,
                  status: e.target.value,
                }))
              }
            >
              <option value="">Select status</option>
              <option value="suspected">Suspected</option>
              <option value="provisional">Provisional</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="diagnosis_category">
              Diagnosis Category
            </label>

            <select
              id="diagnosis_category"
              value={diagnosisDraft.category}
              onChange={(e) =>
                setDiagnosisDraft((previous) => ({
                  ...previous,
                  category: e.target.value,
                  diagnosis: "",
                }))
              }
            >
              <option value="">Select category</option>

              {Object.keys(DIAGNOSIS_CATEGORIES).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="provisional_diagnosis">
              Diagnosis
            </label>

            <select
              id="provisional_diagnosis"
              value={diagnosisDraft.diagnosis}
              onChange={(e) =>
                setDiagnosisDraft((previous) => ({
                  ...previous,
                  diagnosis: e.target.value,
                }))
              }
              disabled={!diagnosisDraft.category}
            >
              <option value="">
                {diagnosisDraft.category
                  ? "Select diagnosis"
                  : "Select category first"}
              </option>

              {diagnosisDraft.category &&
                DIAGNOSIS_CATEGORIES[diagnosisDraft.category]?.map(
                  (diagnosis) => (
                    <option key={diagnosis} value={diagnosis}>
                      {diagnosis}
                    </option>
                  )
                )}
            </select>
          </div>

          <div className="form-group clinical-entry-action">
            <label>&nbsp;</label>

            <button
              type="button"
              className="primary-button"
              onClick={addDiagnosisEntry}
            >
              + Add Diagnosis
            </button>
          </div>
        </div>

        <div className="selection-help">
          You can add multiple diagnoses with different statuses. For example:
          <strong> Confirmed malaria</strong>,
          <strong> Provisional pneumonia</strong>, and
          <strong> Suspected sepsis</strong>.
        </div>

        {diagnosisEntries.length > 0 ? (
          <div className="clinical-selection-list">
            {diagnosisEntries.map((item, index) => (
              <div className="clinical-selection-item" key={`${item.status}-${item.category}-${item.diagnosis}-${index}`}>
                <div>
                  <span className={`clinical-status-pill status-${item.status}`}>
                    {item.status}
                  </span>
                  <strong>{item.diagnosis}</strong>
                  <small>{item.category}</small>
                </div>

                <button
                  type="button"
                  className="remove-selection-button"
                  onClick={() => removeDiagnosisEntry(index)}
                  aria-label={`Remove ${item.diagnosis}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-selection-state">
            No diagnoses added yet.
          </div>
        )}
      </div>

      <div className="form-section clinical-selection-section">
        <div className="section-heading-inline">
          <div>
            <h4>Investigations</h4>
            <p>
              Select multiple investigation categories and multiple investigations.
              Investigations from different categories can be selected in the same referral.
            </p>
          </div>
        </div>

        <div className="multi-selection-group">
          <label>Investigation Categories</label>

          <div className="checkbox-grid">
            {Object.keys(INVESTIGATION_CATEGORIES).map((category) => (
              <label
                key={category}
                className={`selection-checkbox ${
                  selectedInvestigationCategories.includes(category)
                    ? "is-selected"
                    : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedInvestigationCategories.includes(category)}
                  onChange={() => toggleInvestigationCategory(category)}
                />
                <span>{category}</span>
              </label>
            ))}
          </div>
        </div>

        {selectedInvestigationCategories.length > 0 ? (
          <div className="investigation-options-grid">
            {selectedInvestigationCategories.map((category) => (
              <div className="investigation-category-panel" key={category}>
                <div className="investigation-category-header">
                  <strong>{category}</strong>
                  <span>
                    {
                      selectedInvestigations.filter(
                        (item) => item.category === category
                      ).length
                    } selected
                  </span>
                </div>

                <div className="checkbox-list">
                  {INVESTIGATION_CATEGORIES[category]?.map(
                    (investigation) => {
                      const checked = selectedInvestigations.some(
                        (item) =>
                          item.category === category &&
                          item.investigation === investigation
                      );

                      return (
                        <label
                          key={investigation}
                          className={`selection-checkbox ${
                            checked ? "is-selected" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleInvestigation(
                                category,
                                investigation
                              )
                            }
                          />
                          <span>{investigation}</span>
                        </label>
                      );
                    }
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-selection-state">
            Select one or more investigation categories to display their investigations.
          </div>
        )}

        {selectedInvestigations.length > 0 && (
          <div className="selected-summary">
            <strong>
              {selectedInvestigations.length} investigation(s) selected
            </strong>

            <div className="referral-investigation-edit-list">
              {selectedInvestigations.map((item, index) => (
                <div
                  className="referral-investigation-edit-row"
                  key={`${item.category}-${item.investigation}-${index}`}
                >
                  <div>
                    <strong>{item.investigation}</strong>
                    <small>{item.category}</small>
                  </div>
                  <InvestigationResultEditor
                    item={item}
                    onChange={(patch) => updateInvestigationResult(index, patch)}
                    onFileChange={(file) => handleInvestigationFileSelection(index, file)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

        <label>
          Treatment Given
        </label>
        <div className="checkbox-grid reflink-clinical-checks">
          {TREATMENT_OPTIONS.map((item) => (
            <label key={item} className={`selection-checkbox ${form.treatment_given_structured.includes(item) ? "is-selected" : ""}`}>
              <input type="checkbox" checked={form.treatment_given_structured.includes(item)} onChange={() => toggleStructuredValue("treatment_given_structured", item)} />
              <span>{item}</span>
            </label>
          ))}
        </div>
        {form.treatment_given_structured.includes("Other") && (
          <input name="treatment_given_other" value={form.treatment_given_other} onChange={handleChange} placeholder="Other treatment/intervention" />
        )}
        <textarea name="treatment_given" value={form.treatment_given} onChange={handleChange} placeholder="Additional treatment details / dose / timing" />

        <h3>
          {t("referralInformation")}
        </h3>

        <label>
          Reason for Referral
        </label>

        <textarea
          name="referral_reason"
          value={form.referral_reason}
          onChange={handleChange}
          placeholder="Why is the patient being referred?"
        />

        <label>
          Urgency *
        </label>

        <select
          name="urgency"
          value={form.urgency}
          onChange={handleChange}
          required
        >
          <option value="routine">Routine — acknowledgement target 24 hours</option>
          <option value="urgent">Urgent — acknowledgement target 2 hours</option>
          <option value="emergency">Emergency — acknowledgement target 15 minutes</option>
        </select>
        <div className={`reflink-urgency-help ${urgencyMeta(form.urgency).className}`}>
          <strong>{urgencyMeta(form.urgency).label}</strong> · {urgencyMeta(form.urgency).sla}. Emergency and urgent referrals trigger SMS + dashboard notifications when configured.
        </div>

        <label>
          Receiving Facility *
        </label>

        <select
          name="receiving_facility_id"
          value={form.receiving_facility_id}
          onChange={handleChange}
          required
        >

          <option value="">
            Select receiving facility
          </option>

          {facilities.map(
            (facility) => (
              <option
                key={facility.id}
                value={facility.id}
              >
                {facility.name}
              </option>
            )
          )}

        </select>

        <button
          type="submit"
          className="primary-button full-width"
          disabled={loading}
        >
          {loading
            ? "Creating Referral..."
            : t("createReferral")}
        </button>

      </form>

      {printDraft && (
        <PrintReferralSheet
          referral={printDraft}
          copyLabel="DRAFT REFERRAL"
        />
      )}

    </div>
  );
}
/* =========================================================
   PHC STAFF DASHBOARD
   LIVE REFERRALS + REALTIME UPDATES
   ========================================================= */

function PHCStaffDashboard({ onNewReferral }) {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [facilityUserCount, setFacilityUserCount] = useState(null);

  const [selectedReferral, setSelectedReferral] =
    useState(null);

  const [activeFilter, setActiveFilter] =
    useState("all");

  const [searchQuery, setSearchQuery] = useState("");

  /* =========================================================
     LOAD MY REFERRALS
     ========================================================= */

  const loadMyReferrals = async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "id, full_name, role, facility_id"
        )
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        throw new Error(
          "Your REFLINK profile could not be found."
        );
      }

      if (!profile.facility_id) {
        throw new Error(
          "Your account is not assigned to a healthcare facility."
        );
      }

      const {
        data: userCount,
        error: userCountError,
      } = await supabase.rpc(
        "get_facility_user_count",
        {
          p_facility_id: profile.facility_id,
        }
      );

      if (userCountError) {
        console.warn(
          "FACILITY USER COUNT ERROR:",
          userCountError
        );
        setFacilityUserCount(null);
      } else {
        setFacilityUserCount(
          Number(userCount ?? 0)
        );
      }

      const {
        data,
        error: referralError,
      } = await supabase
        .from("referrals")
        .select(`
          id,
          referral_number,
          patient_identifier,
          patient_age_months,
          patient_sex,
          patient_phone,
          patient_address,
          relative_name,
          relative_relationship,
          relative_phone,
          diagnosis_status,
          diagnosis_category,
          diagnosis_records,
          investigation_categories,
          investigation_records,
          chief_complaint,
          clinical_summary,
          physical_findings,
          provisional_diagnosis,
          investigations,
          treatment_given,
          referral_reason,
          urgency,
          ack_due_at,
          status,
          created_at,

          acknowledged_at,
          patient_arrived_at,

          assessment_findings,
          final_diagnosis,
          treatment_provided,
          procedures_performed,
          clinical_feedback,
          disposition,
          assessment_completed_at,

          admission_at,
          ward_unit,
          admission_diagnosis,
          clinical_progress,
          inpatient_treatment,

          discharge_diagnosis,
          condition_at_discharge,
          discharge_medications,
          follow_up_plan,
          discharged_at,

          referring_facility_id,
          receiving_facility_id,
          counter_referral:counter_referrals(*)
        `)
        .eq(
          "referring_facility_id",
          profile.facility_id
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (referralError) {
        throw referralError;
      }

setReferrals(data || []);
    } catch (err) {
      console.error(
        "PHC DASHBOARD ERROR:",
        err
      );

      setError(
        err?.message ||
          "Unable to load your referrals."
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     INITIAL LOAD
     ========================================================= */

  useEffect(() => {
    loadMyReferrals();
  }, []);

  /* =========================================================
     REALTIME REFERRAL UPDATES
     ========================================================= */

  useEffect(() => {
    let channel = null;

    const setupRealtime = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return;
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select("facility_id")
          .eq("id", user.id)
          .single();

        if (
          profileError ||
          !profile?.facility_id
        ) {
          console.error(
            "PHC REALTIME PROFILE ERROR:",
            profileError
          );

          return;
        }

        const channelName =
          `phc-referrals-${profile.facility_id}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

        channel = supabase.channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "referrals",
              filter:
                `referring_facility_id=eq.${profile.facility_id}`,
            },
            (payload) => {
loadMyReferrals();
            }
          )
          .subscribe((status) => {
});
      } catch (err) {
        console.error(
          "PHC REALTIME ERROR:",
          err
        );
      }
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  /* =========================================================
     STATISTICS
     ========================================================= */

  const newReferrals =
    referrals.filter(
      (referral) =>
        referral.status === "sent"
    ).length;

  const acknowledgedReferrals =
    referrals.filter(
      (referral) =>
        referral.status === "acknowledged"
    ).length;

  const patientsReceived =
    referrals.filter(
      (referral) =>
        referral.status === "patient_arrived"
    ).length;

  const underAssessment =
    referrals.filter(
      (referral) =>
        referral.status === "under_assessment"
    ).length;

  const admitted =
    referrals.filter(
      (referral) =>
        referral.status === "admitted"
    ).length;

  const discharged =
    referrals.filter(
      (referral) =>
        referral.status === "discharged"
    ).length;

  const completedReferrals = referrals.filter((referral) => referral.status === "completed").length;
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const referralsThisMonth = referrals.filter((referral) => new Date(referral.created_at).getTime() >= monthStart.getTime()).length;
  const ackTimes = referrals
    .filter((referral) => referral.acknowledged_at && referral.created_at)
    .map((referral) => (new Date(referral.acknowledged_at).getTime() - new Date(referral.created_at).getTime()) / 60000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
    .sort((a,b) => a-b);
  const medianAckMinutes = ackTimes.length ? ackTimes[Math.floor((ackTimes.length - 1) / 2)] : null;
  const overdueAcknowledgements = referrals.filter(isAckOverdue).length;

  /* =========================================================
     FILTERED REFERRALS
     ========================================================= */

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredReferrals = referrals.filter((referral) => {
    const matchesStatus = activeFilter === "all" || referral.status === activeFilter;
    if (!matchesStatus) return false;
    if (!normalizedSearch) return true;

    const searchableValues = [
      referral.referral_number,
      referral.patient_identifier,
      referral.chief_complaint,
      referral.provisional_diagnosis,
      formatDiagnosisRecords(referral.diagnosis_records),
      referral.urgency,
      getStatusLabel(referral.status),
    ];
    return searchableValues.some((value) =>
      String(value || "").toLocaleLowerCase().includes(normalizedSearch)
    );
  });

  /* =========================================================
     FILTER LABEL
     ========================================================= */

  const filterLabels = {
    all: "All Referrals",
    sent: "New Referrals",
    acknowledged:
      "Awaiting Patient Arrival",
    patient_arrived:
      "Patients Received",
    under_assessment:
      "Under Assessment",
    admitted:
      "Admitted Patients",
    discharged:
      "Discharged Patients",
  };

  const activeFilterLabel =
    filterLabels[activeFilter] ||
    "Referrals";

  /* =========================================================
     STATUS LABEL
     ========================================================= */

  /* =========================================================
     OPEN REFERRAL
     ========================================================= */

  const openReferral = (referral) => {
    setSelectedReferral(referral);
    void supabase.rpc("log_referral_read", { p_referral_id: referral.id });
  };

  /* =========================================================
     FILTER
     ========================================================= */

  const handleFilterClick = (
    filter
  ) => {
    setActiveFilter(filter);
  };

  /* =========================================================
     RETURN
     ========================================================= */

  return (
    <>
      {/* =====================================================
          ACTIONS
          ===================================================== */}

      <div className="dashboard-actions">

        <button
          type="button"
          className="primary-button"
          onClick={onNewReferral}
        >
          + New Referral
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={
            loadMyReferrals
          }
          disabled={loading}
        >
          {loading
            ? "Refreshing..."
            : "Refresh Referrals"}
        </button>

      </div>

      {/* =====================================================
          MESSAGES
          ===================================================== */}

      {message && (
        <div className="success-message">
          {message}
        </div>
      )}

      {error && (
        <div className="login-error">
          {error}
        </div>
      )}

      {/* =====================================================
          STATISTICS
          ===================================================== */}

      <div className="stats-grid">

        {/* ALL */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "all"
            )
          }
        >
          <span>
            All Referrals
          </span>

          <strong>
            {referrals.length}
          </strong>
        </button>

        {/* NEW */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "sent"
            )
          }
        >
          <span>
            New Referrals
          </span>

          <strong>
            {newReferrals}
          </strong>
        </button>

        {/* ACKNOWLEDGED */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "acknowledged"
            )
          }
        >
          <span>
            Awaiting Patient Arrival
          </span>

          <strong>
            {acknowledgedReferrals}
          </strong>
        </button>

        {/* PATIENT ARRIVED */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "patient_arrived"
            )
          }
        >
          <span>
            Patients Received
          </span>

          <strong>
            {patientsReceived}
          </strong>
        </button>

        {/* UNDER ASSESSMENT */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "under_assessment"
            )
          }
        >
          <span>
            Under Assessment
          </span>

          <strong>
            {underAssessment}
          </strong>
        </button>

        {/* ADMITTED */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "admitted"
            )
          }
        >
          <span>
            Admitted
          </span>

          <strong>
            {admitted}
          </strong>
        </button>

        {/* THIS MONTH */}

        <div className="stat-card">
          <span>Referrals This Month</span>
          <strong>{referralsThisMonth}</strong>
        </div>

        <div className="stat-card">
          <span>Median Time to Acknowledge</span>
          <strong>{medianAckMinutes === null ? "—" : `${medianAckMinutes < 60 ? Math.round(medianAckMinutes) + " min" : (medianAckMinutes / 60).toFixed(1) + " h"}`}</strong>
        </div>

        <div className={`stat-card ${overdueAcknowledgements > 0 ? "stat-card-alert" : ""}`}>
          <span>Awaiting Beyond Target</span>
          <strong>{overdueAcknowledgements}</strong>
        </div>

        {/* DISCHARGED */}

        <button
          type="button"
          className="stat-card"
          onClick={() =>
            handleFilterClick(
              "discharged"
            )
          }
        >
          <span>
            Discharged
          </span>

          <strong>
            {discharged}
          </strong>
        </button>

      </div>

      {/* =====================================================
          REFERRAL LIST
          ===================================================== */}

      <div className="dashboard-card">

        <div className="form-header">

          <div>

            <span className="eyebrow">
              LIVE REFERRAL NETWORK
            </span>

            <h3>
              {activeFilterLabel}
            </h3>

            <p>
              Referrals created by your
              healthcare facility.
            </p>

          </div>

          <div className="dashboard-card-header-actions">

            <label className="referral-search-field">
              <span className="sr-only">Search your referrals</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search referral ID, patient or complaint"
                aria-label="Search your referrals by referral ID, patient identifier, complaint or diagnosis"
              />
            </label>

            <strong>
              {
                filteredReferrals.length
              }{" "}
              record(s)
            </strong>

            {activeFilter !==
              "all" && (
              <button
                type="button"
                className="back-button"
                onClick={() =>
                  setActiveFilter(
                    "all"
                  )
                }
              >
                Clear Filter
              </button>
            )}

          </div>

        </div>

        {/* LOADING */}

        {loading && (
          <p>
            Loading referrals...
          </p>
        )}

        {/* NO RESULTS */}

        {!loading &&
          filteredReferrals.length ===
            0 && (
            <p>
              {normalizedSearch
                ? "No referrals match your search. Try another term or clear the search."
                : activeFilter === "all"
                  ? "No referrals found."
                  : "No referrals found for this filter."}
            </p>
          )}

        {/* REFERRALS */}

        {!loading &&
          filteredReferrals.length >
            0 && (

            <div className="referral-list">

              {filteredReferrals.map(
                (referral) => (

                  <button
                    key={
                      referral.id
                    }
                    type="button"
                    className="referral-item"
                    onClick={() =>
                      openReferral(
                        referral
                      )
                    }
                    style={{
                      width:
                        "100%",
                      textAlign:
                        "left",
                      cursor:
                        "pointer",
                      border:
                        "none",
                    }}
                  >

                    {/* BASIC INFORMATION */}

                    <div>

                      <strong>
                        {
                          referral.referral_number
                        }
                      </strong>

                      <p>
                        Patient:{" "}
                        {
                          referral.patient_identifier ||
                          "Not recorded"
                        }
                      </p>

                      <p
                        className={`referral-urgency urgency-${String(
                          referral.urgency || "unknown"
                        ).toLowerCase()}`}
                      >
                        Urgency:{" "}
                        {String(
                          referral.urgency || "Not specified"
                        )}
                      </p>
                      {referral.status === "sent" && referral.ack_due_at && (
                        <small className={isAckOverdue(referral) ? "urgency-overdue" : ""}>
                          {isAckOverdue(referral) ? "ACK OVERDUE" : `Ack target: ${new Date(referral.ack_due_at).toLocaleString()}`}
                        </small>
                      )}

                      <small>
                        Created:{" "}
                        {referral.created_at
                          ? new Date(
                              referral.created_at
                            ).toLocaleString()
                          : "Not recorded"}
                      </small>

                    </div>

                    {/* CLINICAL INFORMATION */}

                    <div>

                      <strong>
                        {formatDiagnosisSummary(
                          referral.diagnosis_records,
                          referral.provisional_diagnosis
                        )}
                      </strong>

                      <p>
                        {
                          referral.chief_complaint ||
                          "No chief complaint provided"
                        }
                      </p>

                    </div>

                    {/* STATUS */}

                    <div>

                      <span
                        className={`status-badge status-${referral.status}`}
                      >
                        {
                          getStatusLabel(
                            referral.status
                          )
                        }
                      </span>

                      <p>
                        Click to view
                        details →
                      </p>

                    </div>

                  </button>

                )
              )}

            </div>

          )}

      </div>

      {/* =====================================================
          REFERRAL DETAILS
          ===================================================== */}

      {selectedReferral && (

        <div className="login-page">

          <div
            className="login-card"
            style={{
              maxWidth:
                "800px",
            }}
          >

            <div className="referral-modal-heading-row">
              <div>
                <span className="eyebrow">REFERRAL DETAILS</span>
                <h2>
                  {selectedReferral.referral_number}
                </h2>
              </div>

              <button
                type="button"
                className="secondary-button print-referral-button"
                onClick={() => printReferralForm(selectedReferral, "REFERRING FACILITY COPY", (count) => setSelectedReferral((previous) => ({ ...previous, print_count: count })))}
              >
                🖨 Print Patient Referral Form
              </button>
            </div>

            <p>
              <strong>
                Patient:
              </strong>{" "}
              {
                selectedReferral.patient_identifier ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Status:
              </strong>{" "}
              {
                getStatusLabel(
                  selectedReferral.status
                )
              }
            </p>

            <p>
              <strong>
                Urgency:
              </strong>{" "}
              {
                selectedReferral.urgency ||
                "Not specified"
              }
            </p>

            <div className="patient-contact-grid">
              <div>
                <span>Patient Phone</span>
                <strong>{selectedReferral.patient_phone || "Not recorded"}</strong>
              </div>
              <div>
                <span>Patient Address</span>
                <strong>{selectedReferral.patient_address || "Not recorded"}</strong>
              </div>
              <div>
                <span>Relative / Caregiver</span>
                <strong>{selectedReferral.relative_name || "Not recorded"}</strong>
              </div>
              <div>
                <span>Relationship</span>
                <strong>{selectedReferral.relative_relationship || "Not recorded"}</strong>
              </div>
              <div>
                <span>Relative Phone</span>
                <strong>{selectedReferral.relative_phone || "Not recorded"}</strong>
              </div>
              <div>
                <span>Diagnosis Status</span>
                <strong>
                {formatDiagnosisRecords(
                  selectedReferral.diagnosis_records,
                  selectedReferral.provisional_diagnosis
                )}
              </strong>
              </div>
            </div>

            <ReferralTimeline referral={selectedReferral} />

            {selectedReferral.counter_referral && (
              <div className="dashboard-card counter-referral-card">
                <span className="eyebrow">COUNTER-REFERRAL FEEDBACK</span>
                <h3>Receiving Facility Outcome</h3>
                <p><strong>Final diagnosis:</strong> {selectedReferral.counter_referral.final_diagnosis}</p>
                <p><strong>Outcome:</strong> {formatClinicalLabel(selectedReferral.counter_referral.outcome)}</p>
                <p><strong>Follow-up:</strong> {selectedReferral.counter_referral.follow_up_instructions || "Not recorded"}</p>
              </div>
            )}

            <hr />

            <ReferralSourceDetails referral={selectedReferral} />

            <ReferralTimeline referral={selectedReferral} />

            <hr />

            {/* RECEIVING FACILITY */}



            <h3 className="receiving-updates-heading">
              Receiving Facility Updates
            </h3>

            <p>
              <strong>
                Final Diagnosis:
              </strong>{" "}
              {
                selectedReferral.final_diagnosis ||
                "Not yet recorded"
              }
            </p>

            <p>
              <strong>
                Assessment Findings:
              </strong>{" "}
              {
                selectedReferral.assessment_findings ||
                "Not yet recorded"
              }
            </p>

            <p>
              <strong>
                Treatment Provided:
              </strong>{" "}
              {
                selectedReferral.treatment_provided ||
                "Not yet recorded"
              }
            </p>

            <p>
              <strong>
                Procedures Performed:
              </strong>{" "}
              {
                selectedReferral.procedures_performed ||
                "Not yet recorded"
              }
            </p>

            <p>
              <strong>
                Clinical Feedback:
              </strong>{" "}
              {
                selectedReferral.clinical_feedback ||
                "No feedback yet"
              }
            </p>

            <p>
              <strong>
                Disposition:
              </strong>{" "}
              {
                selectedReferral.disposition ||
                "Not yet recorded"
              }
            </p>

            <hr />

            {/* INPATIENT */}

            <h3>
              Inpatient Information
            </h3>

            <p>
              <strong>
                Ward / Unit:
              </strong>{" "}
              {
                selectedReferral.ward_unit ||
                "Not admitted"
              }
            </p>

            <p>
              <strong>
                Admission Diagnosis:
              </strong>{" "}
              {
                selectedReferral.admission_diagnosis ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Admission Date:
              </strong>{" "}
              {
                selectedReferral.admission_at
                  ? new Date(
                      selectedReferral.admission_at
                    ).toLocaleString()
                  : "Not recorded"
              }
            </p>

            <p>
              <strong>
                Clinical Progress:
              </strong>{" "}
              {
                selectedReferral.clinical_progress ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Inpatient Treatment:
              </strong>{" "}
              {
                selectedReferral.inpatient_treatment ||
                "Not recorded"
              }
            </p>

            <hr />

            {/* DISCHARGE */}

            <h3>
              Discharge Information
            </h3>

            <p>
              <strong>
                Discharge Diagnosis:
              </strong>{" "}
              {
                selectedReferral.discharge_diagnosis ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Condition at Discharge:
              </strong>{" "}
              {
                selectedReferral.condition_at_discharge ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Discharge Medications:
              </strong>{" "}
              {
                selectedReferral.discharge_medications ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Follow-up Plan:
              </strong>{" "}
              {
                selectedReferral.follow_up_plan ||
                "Not recorded"
              }
            </p>

            <p>
              <strong>
                Discharged At:
              </strong>{" "}
              {
                selectedReferral.discharged_at
                  ? new Date(
                      selectedReferral.discharged_at
                    ).toLocaleString()
                  : "Not discharged"
              }
            </p>

            <hr />

            {/* BACK */}

            <button
              type="button"
              className="back-button"
              onClick={() =>
                setSelectedReferral(
                  null
                )
              }
            >
              ← Back to Referrals
            </button>

            <PrintReferralSheet
              referral={selectedReferral}
              copyLabel="REFERRING FACILITY COPY"
            />

          </div>

        </div>

      )}

    </>
  );
}
/* =========================================================
   RECEIVING FACILITY DASHBOARD
   ========================================================= */

function ReceivingDashboard() {

  const investigationSaveQueueRef = useRef(Promise.resolve());

  const [referrals, setReferrals] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [receivingSearch, setReceivingSearch] = useState("");
  const [receivingStatusFilter, setReceivingStatusFilter] = useState("active");
  const [receivingUrgencyFilter, setReceivingUrgencyFilter] = useState("all");

  const [facilityUserCount, setFacilityUserCount] =
    useState(null);

  const [selectedReferral, setSelectedReferral] =
    useState(null);

  const [
    selectedInpatientReferral,
    setSelectedInpatientReferral,
  ] = useState(null);

  const [actionLoading, setActionLoading] =
    useState(null);

  /* =======================================================
     STRUCTURED DIAGNOSIS CATEGORIES
     ======================================================= */

  const [diagnosisCategories, setDiagnosisCategories] =
    useState([]);

  const [diagnosisCategoriesLoading, setDiagnosisCategoriesLoading] =
    useState(false);

  /* =======================================================
     ASSESSMENT FORM
     ======================================================= */

  const [assessmentForm, setAssessmentForm] =
    useState({
      assessment_findings: "",
      final_diagnosis: "",
      diagnosis_category: "",
      diagnosis_status: "",
      treatment_provided: "",
      procedures_performed: "",
      clinical_feedback: "",
      disposition: "",
    });

  /* =======================================================
     ADMISSION FORM
     ======================================================= */

  const [admissionForm, setAdmissionForm] =
    useState({
      admission_at: "",
      ward_unit: "",
      admission_diagnosis: "",
      clinical_progress: "",
      inpatient_treatment: "",
      discharge_diagnosis: "",
      condition_at_discharge: "",
      discharge_medications: "",
      follow_up_plan: "",
    });

  const handleInvestigationFileUpload = async (index, file) => {
    if (!selectedReferral || !file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Investigation result file must not exceed 10 MB."); return; }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv"];
    if (file.type && !allowed.includes(file.type)) { setError("Unsupported investigation result file type."); return; }
    const current = getInvestigationRecords(selectedReferral).map(normalizeInvestigationRecord);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${selectedReferral.id}/${Date.now()}-${index}-${safeName}`;
    setActionLoading(`${selectedReferral.id}-investigation-file-${index}`);
    try {
      const { error: uploadError } = await supabase.storage.from("referral-investigation-results").upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      const updated = current.map((item, itemIndex) => itemIndex === index ? { ...item, result_file_path: path, result_file_name: file.name, result_file_type: file.type, result_file_size: file.size } : item);
      const { error } = await supabase.from("referrals").update({ investigation_records: updated }).eq("id", selectedReferral.id);
      if (error) throw error;
      const updatedReferral = { ...selectedReferral, investigation_records: updated };
      setSelectedReferral(updatedReferral);
      setReferrals((previous) => previous.map((item) => item.id === selectedReferral.id ? updatedReferral : item));
      setMessage(`${updated[index].investigation} result document uploaded successfully.`);
    } catch (err) { console.error("INVESTIGATION FILE UPLOAD ERROR:", err); setError(err.message || "Unable to upload investigation result."); }
    finally { setActionLoading(null); }
  };

  const handleInvestigationResultChange = async (index, patch) => {
    if (!selectedReferral) return;

    const referralAtChange = selectedReferral;
    const currentInvestigations = getInvestigationRecords(referralAtChange).map(normalizeInvestigationRecord);
    const updatedInvestigations = currentInvestigations.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    );
    const statusWasChanged =
  Object.prototype.hasOwnProperty.call(patch, "result_status");

if (
  statusWasChanged &&
  NUMERIC_RESULT_CLASSIFICATION_STATUSES.has(
    String(patch.result_status || "")
  )
) {
  const validationMessage =
    getInvestigationValidationMessage(updatedInvestigations[index]);

  if (validationMessage) {
    setError(validationMessage);
    return;
  }
}
    const updatedReferral = {
      ...referralAtChange,
      investigation_records: updatedInvestigations,
    };

    setSelectedReferral(updatedReferral);
    setReferrals((previous) => previous.map((item) =>
      item.id === referralAtChange.id ? updatedReferral : item
    ));

    const loadingKey = `${referralAtChange.id}-investigation-${index}`;
    setActionLoading(loadingKey);

    // Serialize full-array JSONB writes so rapid typing cannot finish out of order.
    const saveTask = investigationSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const { error } = await supabase
          .from("referrals")
          .update({ investigation_records: updatedInvestigations })
          .eq("id", referralAtChange.id);
        if (error) throw error;
      });
    investigationSaveQueueRef.current = saveTask;

    try {
      await saveTask;
      setMessage(
        `${updatedInvestigations[index].investigation} result saved: ${getInvestigationResultLabel(updatedInvestigations[index].result_status)}.`
      );
      setError("");
    } catch (err) {
      console.error("INVESTIGATION RESULT UPDATE ERROR:", err);
      setError(err.message || "Unable to save the investigation result. Check connectivity and retry.");
    } finally {
      setActionLoading((current) => current === loadingKey ? null : current);
    }
  };

  /* =======================================================
     LOAD DIAGNOSIS CATEGORIES
     ======================================================= */

  const loadDiagnosisCategories =
    async () => {

      setDiagnosisCategoriesLoading(true);

      try {

        const {
          data,
          error,
        } = await supabase
          .from("diagnosis_categories")
          .select("id, name")
          .eq("is_active", true)
          .order("name", {
            ascending: true,
          });

        if (error) {
          console.error(
            "DIAGNOSIS CATEGORIES ERROR:",
            error
          );
          throw error;
        }

        setDiagnosisCategories(
          data || []
        );

      } catch (err) {

        console.error(
          "Unable to load diagnosis categories:",
          err
        );

        setDiagnosisCategories([]);

      } finally {

        setDiagnosisCategoriesLoading(false);

      }
    };

  /* =======================================================
     LOAD INCOMING REFERRALS
     ======================================================= */

  const loadIncomingReferrals =
    async () => {

      setLoading(true);
      setError("");

      try {

        const {
          data: {
            user,
          },
          error: userError,
        } = await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          throw new Error(
            "Your session has expired. Please sign in again."
          );
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select(
            "id, full_name, role, facility_id"
          )
          .eq(
            "id",
            user.id
          )
          .single();

        if (
          profileError ||
          !profile
        ) {
          throw new Error(
            "Your REFLINK profile could not be found."
          );
        }

        if (
          !profile.facility_id
        ) {
          throw new Error(
            "Your account is not assigned to a receiving facility."
          );
        }

        const {
          data: userCount,
          error: userCountError,
        } = await supabase.rpc(
          "get_facility_user_count",
          {
            p_facility_id: profile.facility_id,
          }
        );

        if (userCountError) {
          console.warn(
            "FACILITY USER COUNT ERROR:",
            userCountError
          );
          setFacilityUserCount(null);
        } else {
          setFacilityUserCount(
            Number(userCount ?? 0)
          );
        }

        const {
          data,
          error: referralError,
        } = await supabase
          .from("referrals")
          .select(`
            id,
            referral_number,
            patient_identifier,
            patient_age_months,
            patient_sex,
            patient_phone,
            patient_address,
            relative_name,
            relative_relationship,
            relative_phone,
            diagnosis_status,
            diagnosis_category,
            diagnosis_records,
            investigation_categories,
            investigation_records,
            chief_complaint,
            clinical_summary,
            physical_findings,
            provisional_diagnosis,
            investigations,
            treatment_given,
            referral_reason,
            urgency,
            status,
            ack_due_at,
            created_at,
            acknowledged_at,
            patient_arrived_at,
            completed_at,

            assessment_findings,
            final_diagnosis,
            treatment_provided,
            procedures_performed,
            clinical_feedback,
            disposition,
            assessment_completed_at,

            admission_at,
            ward_unit,
            admission_diagnosis,
            clinical_progress,
            inpatient_treatment,

            discharge_diagnosis,
            condition_at_discharge,
            discharge_medications,
            follow_up_plan,
            discharged_at,

            referring_facility_id,
            receiving_facility_id,
            counter_referral:counter_referrals(*) ,

            referring_facility:facilities!referrals_referring_facility_id_fkey (
              id,
              name,
              facility_type,
              state,
              lga,
              is_active
            )
          `)
          .eq(
            "receiving_facility_id",
            profile.facility_id
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

        if (referralError) {
          throw referralError;
        }

setReferrals(
          data || []
        );

      } catch (err) {

        console.error(
          "Receiving dashboard error:",
          err
        );

        setError(
          err.message ||
          "Unable to load incoming referrals."
        );

      } finally {

        setLoading(false);

      }
    };

  /* =======================================================
     ADMISSION FORM CHANGE
     ======================================================= */

  const handleAdmissionChange =
    (e) => {

      const {
        name,
        value,
      } = e.target;

      setAdmissionForm(
        (previous) => ({
          ...previous,
          [name]: value,
        })
      );
    };

  /* =======================================================
     ASSESSMENT FORM CHANGE
     ======================================================= */

  const handleAssessmentChange =
    (e) => {

      const {
        name,
        value,
      } = e.target;

      setAssessmentForm(
        (previous) => ({
          ...previous,
          [name]: value,
        })
      );
    };

  /* =======================================================
     VIEW REFERRAL DETAILS
     ======================================================= */

  const openReferralDetails = (referral) => {
    setSelectedReferral(referral);
    void supabase.rpc("log_referral_read", { p_referral_id: referral.id });

    setAssessmentForm({
      assessment_findings:
        referral.assessment_findings || "",

      final_diagnosis:
        referral.final_diagnosis || "",

      diagnosis_category:
        referral.diagnosis_category || "",

      diagnosis_status:
        referral.diagnosis_status || "",

      treatment_provided:
        referral.treatment_provided || "",

      procedures_performed:
        referral.procedures_performed || "",

      clinical_feedback:
        referral.clinical_feedback || "",

      disposition:
        referral.disposition || "",
    });
  };

  /* =======================================================
     OPEN INPATIENT MANAGEMENT
     ======================================================= */

  const openInpatientManagement =
    (referral) => {

      setSelectedInpatientReferral(
        referral
      );

      setAdmissionForm({

        admission_at:
          referral.admission_at
            ? referral.admission_at.slice(
                0,
                16
              )
            : "",

        ward_unit:
          referral.ward_unit ||
          "",

        admission_diagnosis:
          referral.admission_diagnosis ||
          referral.final_diagnosis ||
          "",

        clinical_progress:
          referral.clinical_progress ||
          "",

        inpatient_treatment:
          referral.inpatient_treatment ||
          "",

        discharge_diagnosis:
          referral.discharge_diagnosis ||
          "",

        condition_at_discharge:
          referral.condition_at_discharge ||
          "",

        discharge_medications:
          referral.discharge_medications ||
          "",

        follow_up_plan:
          referral.follow_up_plan ||
          "",
      });
    };

  /* =======================================================
     SAVE ADMISSION
     ======================================================= */

  const handleSaveAdmission =
    async (e) => {

      e.preventDefault();

      if (
        !selectedInpatientReferral
      ) {
        return;
      }

      setError("");
      setMessage("");

      setActionLoading(
        selectedInpatientReferral.id
      );

      try {

        if (
          !admissionForm.ward_unit.trim()
        ) {
          throw new Error(
            "Ward or clinical unit is required."
          );
        }

        if (
          !admissionForm.admission_diagnosis.trim()
        ) {
          throw new Error(
            "Admission diagnosis is required."
          );
        }

        const admissionAt =
          admissionForm.admission_at
            ? new Date(
                admissionForm.admission_at
              ).toISOString()
            : new Date().toISOString();

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update({

            admission_at:
              admissionAt,

            ward_unit:
              admissionForm.ward_unit,

            admission_diagnosis:
              admissionForm.admission_diagnosis,

            clinical_progress:
              admissionForm.clinical_progress ||
              null,

            inpatient_treatment:
              admissionForm.inpatient_treatment ||
              null,

            status:
              "admitted",
          })
          .eq(
            "id",
            selectedInpatientReferral.id
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Admission information for ${data.referral_number} saved successfully.`
        );

        setSelectedInpatientReferral(
          null
        );

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          "SAVE ADMISSION ERROR:",
          err
        );

        setError(
          err.message ||
          "Unable to save admission information."
        );

      } finally {

        setActionLoading(null);

      }
    };

  /* =======================================================
     DISCHARGE PATIENT
     ======================================================= */

  const handleDischargePatient =
    async (e) => {

      e.preventDefault();

      if (
        !selectedInpatientReferral
      ) {
        return;
      }

      setError("");
      setMessage("");

      setActionLoading(
        selectedInpatientReferral.id
      );

      try {

        if (
          !admissionForm.discharge_diagnosis.trim()
        ) {
          throw new Error(
            "Discharge diagnosis is required."
          );
        }

        if (
          !admissionForm.condition_at_discharge.trim()
        ) {
          throw new Error(
            "Condition at discharge is required."
          );
        }

        if (
          !admissionForm.follow_up_plan.trim()
        ) {
          throw new Error(
            "Follow-up plan is required."
          );
        }

        const dischargedAt =
          new Date().toISOString();

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update({

            discharge_diagnosis:
              admissionForm.discharge_diagnosis,

            condition_at_discharge:
              admissionForm.condition_at_discharge,

            discharge_medications:
              admissionForm.discharge_medications ||
              null,

            follow_up_plan:
              admissionForm.follow_up_plan,

            discharged_at:
              dischargedAt,

            status:
              "discharged",
          })
          .eq(
            "id",
            selectedInpatientReferral.id
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Referral ${data.referral_number} discharged successfully.`
        );

        setSelectedInpatientReferral(
          null
        );

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          "DISCHARGE ERROR:",
          err
        );

        setError(
          err.message ||
          "Unable to discharge patient."
        );

      } finally {

        setActionLoading(null);

      }
    };

  /* =======================================================
     ACKNOWLEDGE REFERRAL
     ======================================================= */

  const handleAcknowledgeReferral =
    async (referralId) => {

      setError("");
      setMessage("");
      setActionLoading(
        referralId
      );

      try {

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update({

            status:
              "acknowledged",

            acknowledged_at:
              new Date().toISOString(),

          })
          .eq(
            "id",
            referralId
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Referral ${data.referral_number} acknowledged successfully.`
        );
        void requestReferralSms(data.id, "referral_acknowledged");

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          err
        );

        setError(
          err.message ||
          "Unable to acknowledge referral."
        );

      } finally {

        setActionLoading(
          null
        );

      }
    };

  /* =======================================================
     PATIENT ARRIVAL
     ======================================================= */

  const handlePatientArrived =
    async (referralId) => {

      setError("");
      setMessage("");
      setActionLoading(
        referralId
      );

      try {

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update({

            status:
              "patient_arrived",

            patient_arrived_at:
              new Date().toISOString(),

          })
          .eq(
            "id",
            referralId
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Patient for ${data.referral_number} marked as arrived.`
        );

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          err
        );

        setError(
          err.message ||
          "Unable to record patient arrival."
        );

      } finally {

        setActionLoading(
          null
        );

      }
    };

 /* =======================================================
   START ASSESSMENT
   ======================================================= */

const handleStartAssessment = async (referralId) => {
  setError("");
  setMessage("");
  setActionLoading(referralId);

  try {
    const {
      data,
      error,
    } = await supabase
      .from("referrals")
      .update({
        status: "under_assessment",
      })
      .eq("id", referralId)
      .select()
      .single();

    if (error) {
      console.error("START ASSESSMENT ERROR:", error);
      throw error;
    }

    setMessage(
      `Clinical assessment started for ${data.referral_number}.`
    );

    await loadIncomingReferrals();

  } catch (err) {
    console.error("Start assessment error:", err);

    setError(
      err.message ||
        "Unable to start clinical assessment."
    );

  } finally {
    setActionLoading(null);
  }
};

  /* =======================================================
     SAVE CLINICAL ASSESSMENT
     ======================================================= */

  const handleSaveAssessment =
    async (e) => {

      e.preventDefault();

      if (!selectedReferral) {
        return;
      }

      setError("");
      setMessage("");

      setActionLoading(
        selectedReferral.id
      );

      try {

        if (
          !assessmentForm.assessment_findings.trim()
        ) {
          throw new Error(
            "Assessment findings are required."
          );
        }

        if (
          !assessmentForm.final_diagnosis.trim()
        ) {
          throw new Error(
            "Clinical diagnosis is required."
          );
        }

        if (
          !assessmentForm.diagnosis_status
        ) {
          throw new Error(
            "Please select the diagnosis status."
          );
        }

        if (
          !assessmentForm.diagnosis_category
        ) {
          throw new Error(
            "Please select the diagnosis category."
          );
        }

        if (
          !assessmentForm.disposition
        ) {
          throw new Error(
            "Please select a clinical disposition."
          );
        }

        let newStatus =
          assessmentForm.disposition;

        if (
          assessmentForm.disposition ===
          "observation"
        ) {
          newStatus =
            "under_assessment";
        }

        const updateData = {

          assessment_findings:
            assessmentForm.assessment_findings,

          final_diagnosis:
            assessmentForm.final_diagnosis,

          diagnosis_category:
            assessmentForm.diagnosis_category ||
            null,

          diagnosis_status:
            assessmentForm.diagnosis_status ||
            null,

          treatment_provided:
            assessmentForm.treatment_provided ||
            null,

          procedures_performed:
            assessmentForm.procedures_performed ||
            null,

          clinical_feedback:
            assessmentForm.clinical_feedback ||
            null,

          disposition:
            assessmentForm.disposition,

          assessment_completed_at:
            new Date().toISOString(),

          status:
            newStatus,
        };

        if (
          assessmentForm.disposition ===
          "discharged"
        ) {

          updateData.discharged_at =
            new Date().toISOString();

        }

        if (
          assessmentForm.disposition ===
          "admitted"
        ) {

          updateData.admission_at =
            new Date().toISOString();

        }

        const {
          data,
          error,
        } = await supabase
          .from("referrals")
          .update(updateData)
          .eq(
            "id",
            selectedReferral.id
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Clinical assessment for ${data.referral_number} saved successfully.`
        );

        /*
         * If admitted, immediately open
         * inpatient management.
         */
        if (
          assessmentForm.disposition ===
          "admitted"
        ) {

          const updatedReferral = {
            ...selectedReferral,
            ...data,
          };

          setSelectedReferral(
            null
          );

          setAssessmentForm({
            assessment_findings: "",
            final_diagnosis: "",
            diagnosis_category: "",
            diagnosis_status: "",
            treatment_provided: "",
            procedures_performed: "",
            clinical_feedback: "",
            disposition: "",
          });

          setSelectedInpatientReferral(
            updatedReferral
          );

          setAdmissionForm({

            admission_at:
              updatedReferral.admission_at
                ? updatedReferral.admission_at.slice(
                    0,
                    16
                  )
                : "",

            ward_unit:
              updatedReferral.ward_unit ||
              "",

            admission_diagnosis:
              updatedReferral.admission_diagnosis ||
              updatedReferral.final_diagnosis ||
              "",

            clinical_progress:
              updatedReferral.clinical_progress ||
              "",

            inpatient_treatment:
              updatedReferral.inpatient_treatment ||
              "",

            discharge_diagnosis:
              updatedReferral.discharge_diagnosis ||
              "",

            condition_at_discharge:
              updatedReferral.condition_at_discharge ||
              "",

            discharge_medications:
              updatedReferral.discharge_medications ||
              "",

            follow_up_plan:
              updatedReferral.follow_up_plan ||
              "",
          });

        } else {

          setSelectedReferral(
            null
          );

          setAssessmentForm({
            assessment_findings: "",
            final_diagnosis: "",
            diagnosis_category: "",
            diagnosis_status: "",
            treatment_provided: "",
            procedures_performed: "",
            clinical_feedback: "",
            disposition: "",
          });
        }

        await loadIncomingReferrals();

      } catch (err) {

        console.error(
          "ASSESSMENT ERROR:",
          err
        );

        setError(
          err.message ||
          "Unable to save clinical assessment."
        );

      } finally {

        setActionLoading(
          null
        );

      }
    };

  /* =======================================================
     INITIAL LOAD
     ======================================================= */

  useEffect(() => {
    loadIncomingReferrals();
    loadDiagnosisCategories();
  }, []);

  /* =======================================================
     DASHBOARD STATISTICS
     ======================================================= */

  const newReferrals =
    referrals.filter(
      (referral) =>
        referral.status ===
        "sent"
    ).length;

  const awaitingAssessment =
    referrals.filter(
      (referral) =>
        referral.status ===
        "acknowledged"
    ).length;

  const patientsReceived =
    referrals.filter(
      (referral) =>
        referral.status ===
        "patient_arrived"
    ).length;

  const completed =
    referrals.filter(
      (referral) =>
        referral.status ===
          "completed" ||
        referral.status ===
          "discharged"
    ).length;
      /* =======================================================
     FILTERED REFERRALS
     ======================================================= */

  const receivingQuery = receivingSearch.trim().toLocaleLowerCase();
  const filteredReferrals = referrals
    .filter((referral) => {
      const isOpen = isOpenIncomingReferral(referral);
      const matchesStatus = receivingStatusFilter === "all" ||
        (receivingStatusFilter === "active" ? isOpen : referral.status === receivingStatusFilter);
      const matchesUrgency = receivingUrgencyFilter === "all" ||
        String(referral.urgency || "routine").toLowerCase() === receivingUrgencyFilter;
      const searchValues = [
        referral.referral_number,
        referral.patient_identifier,
        referral.chief_complaint,
        referral.provisional_diagnosis,
        formatDiagnosisSummary(referral.diagnosis_records, referral.provisional_diagnosis),
        referral.referring_facility?.name,
      ];
      const matchesSearch = !receivingQuery || searchValues.some((value) =>
        String(value || "").toLocaleLowerCase().includes(receivingQuery)
      );
      return matchesStatus && matchesUrgency && matchesSearch;
    })
    .sort((a, b) => sortIncomingReferralsByPriority([a, b])[0] === a ? -1 : 1);

  const overdueIncomingAcknowledgements = referrals.filter(isAckOverdue).length;
  const emergencyIncomingReferrals = referrals.filter((referral) =>
    referral.urgency === "emergency" && referral.status !== "completed"
  ).length;

  const assessmentRequiredFields = [
    { key: "assessment_findings", label: "Assessment findings" },
    { key: "final_diagnosis", label: "Final diagnosis" },
    { key: "diagnosis_status", label: "Diagnosis status" },
    { key: "diagnosis_category", label: "Diagnosis category" },
    { key: "disposition", label: "Clinical disposition" },
  ];
  const completedAssessmentFields = assessmentRequiredFields.filter(({ key }) =>
    String(assessmentForm[key] || "").trim().length > 0
  ).length;
  const assessmentProgress = Math.round(
    (completedAssessmentFields / assessmentRequiredFields.length) * 100
  );

  /* =======================================================
     USER INTERFACE
     ======================================================= */

  return (
    <>

      <div className="dashboard-actions">

        <button
          type="button"
          className="secondary-button"
          onClick={
            loadIncomingReferrals
          }
          disabled={loading}
        >
          {loading
            ? "Refreshing..."
            : "Refresh Referrals"}
        </button>

      </div>

      {message && (
        <div className="success-message">
          {message}
        </div>
      )}

      {error && (
        <div className="login-error">
          {error}
        </div>
      )}

      {/* ===================================================
          STATISTICS
          =================================================== */}

      <div className="stats-grid">
        <div className="stat-card facility-user-stat">
          <span>Registered Users</span>
          <strong>
            {facilityUserCount ?? 0}
          </strong>
          <small>Users assigned to your facility</small>
        </div>


        <div className="stat-card">
          <span>
            New Referrals
          </span>

          <strong>
            {newReferrals}
          </strong>
        </div>

        <div className="stat-card">
          <span>
            Awaiting Assessment
          </span>

          <strong>
            {awaitingAssessment}
          </strong>
        </div>

        <div className="stat-card">
          <span>
            Patients Received
          </span>

          <strong>
            {patientsReceived}
          </strong>
        </div>

        <div className="stat-card">
          <span>Emergency referrals</span>
          <strong>{emergencyIncomingReferrals}</strong>
          <small>Requires immediate clinical prioritisation</small>
        </div>

        <div className={`stat-card ${overdueIncomingAcknowledgements > 0 ? "stat-card-alert" : ""}`}>
          <span>Acknowledgements overdue</span>
          <strong>{overdueIncomingAcknowledgements}</strong>
          <small>Past the recorded acknowledgement target</small>
        </div>

        <div className="stat-card">
          <span>
            Completed
          </span>

          <strong>
            {completed}
          </strong>
        </div>

      </div>

      {/* ===================================================
          INCOMING REFERRALS
          =================================================== */}

      <div className="dashboard-card">

        <div className="form-header">

          <div>

            <span className="eyebrow">
              REFERRAL MANAGEMENT
            </span>

            <h3>
              Incoming Referrals
            </h3>

            <p>
              Referrals assigned to your receiving facility.
            </p>

          </div>

          <div className="receiving-referral-filters" role="search" aria-label="Filter incoming referrals">
            <label>
              <span>Search referrals</span>
              <input
                type="search"
                value={receivingSearch}
                onChange={(event) => setReceivingSearch(event.target.value)}
                placeholder="Referral ID, patient, complaint or facility"
                aria-label="Search incoming referrals"
              />
            </label>
            <label>
              <span>Referral status</span>
              <select value={receivingStatusFilter} onChange={(event) => setReceivingStatusFilter(event.target.value)}>
                <option value="active">Active referrals</option>
                <option value="all">All statuses</option>
                <option value="sent">New</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="patient_arrived">Patient arrived</option>
                <option value="under_assessment">Under assessment</option>
                <option value="admitted">Admitted</option>
                <option value="discharged">Discharged</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>
              <span>Urgency</span>
              <select value={receivingUrgencyFilter} onChange={(event) => setReceivingUrgencyFilter(event.target.value)}>
                <option value="all">All urgency levels</option>
                <option value="emergency">Emergency</option>
                <option value="urgent">Urgent</option>
                <option value="routine">Routine</option>
              </select>
            </label>
            <div className="receiving-filter-result" aria-live="polite">
              Showing {filteredReferrals.length} of {referrals.length} referrals
            </div>
          </div>

        </div>

        {loading && (
          <p>
            Loading incoming referrals...
          </p>
        )}

        {!loading &&
          referrals.length === 0 &&
          !error && (
            <p>
              No incoming referrals found.
            </p>
          )}

        {!loading && referrals.length > 0 && filteredReferrals.length === 0 && (
          <p className="empty-selection-state">No incoming referrals match these filters. Adjust the search or select a different status.</p>
        )}

        {!loading &&
          filteredReferrals.length > 0 && (

            <div className="referral-list">

              {filteredReferrals.map(
                (referral) => (

                  <div
                    key={referral.id}
                    className="referral-item"
                  >

                    <div>

                      <strong>
                        {
                          referral.referral_number
                        }
                      </strong>

                      <p>
                        Patient:{" "}
                        {
                          referral.patient_identifier
                        }
                      </p>

                      <span
                        className={`referral-status status-${String(
                          referral.status || "unknown"
                        ).toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        Status:{" "}
                        {getStatusLabel(referral.status)}
                      </span>

                      <span
                        className={`referral-urgency urgency-${String(
                          referral.urgency || "unknown"
                        ).toLowerCase()}`}
                      >
                        Urgency:{" "}
                        {String(referral.urgency || "Not specified")}
                      </span>
                      {referral.status === "sent" && referral.ack_due_at && (
                        <small className={isAckOverdue(referral) ? "urgency-overdue" : ""}>
                          {isAckOverdue(referral) ? "Acknowledgement target missed" : `Acknowledgement target: ${new Date(referral.ack_due_at).toLocaleString()}`}
                        </small>
                      )}

                      <small>
                        Received:{" "}
                        {new Date(
                          referral.created_at
                        ).toLocaleString()}
                      </small>

                    </div>

                    <div>

                      <strong>
                        {formatDiagnosisSummary(
                          referral.diagnosis_records,
                          referral.provisional_diagnosis
                        )}
                      </strong>

                      <p>
                        {
                          referral.chief_complaint ||
                          "No chief complaint provided"
                        }
                      </p>

                    </div>

                    {/* =================================================
                        ACTIONS
                        ================================================= */}

                    <div className="referral-actions">

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          openReferralDetails(referral)
                        }
                      >
                        View Full Referral
                      </button>

                      {/* SENT */}

                      {referral.status ===
                        "sent" && (

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            handleAcknowledgeReferral(
                              referral.id
                            )
                          }
                          disabled={
                            actionLoading ===
                            referral.id
                          }
                        >
                          {actionLoading ===
                          referral.id
                            ? "Acknowledging..."
                            : "Acknowledge Referral"}
                        </button>

                      )}

                      {/* ACKNOWLEDGED */}

                      {referral.status ===
                        "acknowledged" && (

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            handlePatientArrived(
                              referral.id
                            )
                          }
                          disabled={
                            actionLoading ===
                            referral.id
                          }
                        >
                          {actionLoading ===
                          referral.id
                            ? "Updating..."
                            : "Mark Patient Arrived"}
                        </button>

                      )}

                      {/* PATIENT ARRIVED */}

                      {referral.status ===
                        "patient_arrived" && (

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            handleStartAssessment(
                              referral.id
                            )
                          }
                          disabled={
                            actionLoading ===
                            referral.id
                          }
                        >
                          {actionLoading ===
                          referral.id
                            ? "Starting..."
                            : "Start Assessment"}
                        </button>

                      )}

                      {/* UNDER ASSESSMENT */}

                      {referral.status ===
                        "under_assessment" && (

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => {

                            setSelectedReferral(
                              referral
                            );

                            setAssessmentForm({

                              assessment_findings:
                                referral.assessment_findings ||
                                "",

                              final_diagnosis:
                                referral.final_diagnosis ||
                                "",

                              diagnosis_category:
                                referral.diagnosis_category ||
                                "",

                              diagnosis_status:
                                referral.diagnosis_status ||
                                "",

                              treatment_provided:
                                referral.treatment_provided ||
                                "",

                              procedures_performed:
                                referral.procedures_performed ||
                                "",

                              clinical_feedback:
                                referral.clinical_feedback ||
                                "",

                              disposition:
                                referral.disposition ||
                                "",

                            });

                          }}
                        >
                          Continue Clinical Assessment
                        </button>

                      )}

                      {/* =================================================
                          ADMITTED
                          IMPORTANT: only ONE button here.
                          No nested button.
                          ================================================= */}

                      {referral.status ===
                        "admitted" && (

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            openInpatientManagement(
                              referral
                            )
                          }
                        >
                          Open Inpatient Management
                        </button>

                      )}

                    </div>

                  </div>

                )
              )}

            </div>

          )}

      </div>

      {/* =====================================================
          INPATIENT MANAGEMENT
          ===================================================== */}

      {selectedInpatientReferral && (

        <div className="login-page">

          <div
            className="login-card"
            style={{
              maxWidth: "760px",
            }}
          >

            <span className="eyebrow">
              INPATIENT CARE
            </span>

            <h2>
              Inpatient Management
            </h2>

            <p>
              Referral{" "}
              <strong>
                {
                  selectedInpatientReferral.referral_number
                }
              </strong>
            </p>

            <p>
              Patient:{" "}
              <strong>
                {
                  selectedInpatientReferral.patient_identifier
                }
              </strong>
            </p>

            {/* =================================================
                ADMISSION
                ================================================= */}

            <form
              onSubmit={
                handleSaveAdmission
              }
            >

              <h3>
                Admission Documentation
              </h3>

              <label>
                Admission Date & Time
              </label>

              <input
                type="datetime-local"
                name="admission_at"
                value={
                  admissionForm.admission_at
                }
                onChange={
                  handleAdmissionChange
                }
              />

              <label>
                Ward / Clinical Unit *
              </label>

              <input
                type="text"
                name="ward_unit"
                value={
                  admissionForm.ward_unit
                }
                onChange={
                  handleAdmissionChange
                }
                placeholder="e.g. Paediatric Ward"
                required
              />

              <label>
                Admission Diagnosis *
              </label>

              <textarea
                name="admission_diagnosis"
                value={
                  admissionForm.admission_diagnosis
                }
                onChange={
                  handleAdmissionChange
                }
                rows="4"
                placeholder="Enter the admission diagnosis..."
                required
              />

              <label>
                Clinical Progress
              </label>

              <textarea
                name="clinical_progress"
                value={
                  admissionForm.clinical_progress
                }
                onChange={
                  handleAdmissionChange
                }
                rows="5"
                placeholder="Document clinical progress, response to treatment, vital clinical changes and relevant observations..."
              />

              <label>
                Inpatient Treatment
              </label>

              <textarea
                name="inpatient_treatment"
                value={
                  admissionForm.inpatient_treatment
                }
                onChange={
                  handleAdmissionChange
                }
                rows="5"
                placeholder="Document medications, IV fluids, procedures, monitoring and other inpatient interventions..."
              />

              <button
                type="submit"
                className="primary-button full-width"
                disabled={
                  actionLoading ===
                  selectedInpatientReferral.id
                }
              >
                {actionLoading ===
                selectedInpatientReferral.id
                  ? "Saving..."
                  : "Save Admission Information"}
              </button>

            </form>

            <hr />

            {/* =================================================
                DISCHARGE
                ================================================= */}

            <form
              onSubmit={
                handleDischargePatient
              }
            >

              <h3>
                Discharge Summary
              </h3>

              <label>
                Discharge Diagnosis *
              </label>

              <textarea
                name="discharge_diagnosis"
                value={
                  admissionForm.discharge_diagnosis
                }
                onChange={
                  handleAdmissionChange
                }
                rows="4"
                placeholder="Enter the final diagnosis at discharge..."
                required
              />

              <label>
                Condition at Discharge *
              </label>

              <textarea
                name="condition_at_discharge"
                value={
                  admissionForm.condition_at_discharge
                }
                onChange={
                  handleAdmissionChange
                }
                rows="4"
                placeholder="e.g. Clinically stable, afebrile, tolerating oral feeds..."
                required
              />

              <label>
                Discharge Medications
              </label>

              <textarea
                name="discharge_medications"
                value={
                  admissionForm.discharge_medications
                }
                onChange={
                  handleAdmissionChange
                }
                rows="5"
                placeholder="Medication name, dose, route, frequency and duration..."
              />

              <label>
                Follow-up Plan *
              </label>

              <textarea
                name="follow_up_plan"
                value={
                  admissionForm.follow_up_plan
                }
                onChange={
                  handleAdmissionChange
                }
                rows="5"
                placeholder="Follow-up appointment, laboratory monitoring, repeat investigations and referral instructions..."
                required
              />

              <button
                type="submit"
                className="primary-button full-width"
                disabled={
                  actionLoading ===
                  selectedInpatientReferral.id
                }
              >
                {actionLoading ===
                selectedInpatientReferral.id
                  ? "Processing..."
                  : "Discharge Patient"}
              </button>

              <button
                type="button"
                className="back-button"
                onClick={() =>
                  setSelectedInpatientReferral(
                    null
                  )
                }
              >
                ← Back to Referrals
              </button>

            </form>

          </div>

        </div>

      )}

      {/* =====================================================
          CLINICAL ASSESSMENT
          ===================================================== */}

      {/* =====================================================
          CLINICAL ASSESSMENT
          ===================================================== */}

      {selectedReferral && (

        <div className="login-page">

          <div
            className="login-card referral-review-card"
            style={{
              maxWidth: "980px",
            }}
          >

            <div className="referral-modal-heading-row">
              <div>
                <span className="eyebrow">RECEIVING FACILITY • REFERRAL REVIEW</span>
                <h2>Referral Review</h2>
              </div>

              <button
                type="button"
                className="secondary-button print-referral-button"
                onClick={() => printReferralForm(selectedReferral, "RECEIVING FACILITY COPY", (count) => setSelectedReferral((previous) => ({ ...previous, print_count: count })))}
              >
                🖨 Print Patient Referral Form
              </button>
            </div>

            <div className="referral-review-header">
              <div>
                <strong>
                  {selectedReferral.referral_number}
                </strong>

                <span>
                  Patient:{" "}
                  {selectedReferral.patient_identifier ||
                    "Not recorded"}
                </span>
              </div>

              <div className="referral-review-statuses">
                <span
                  className={`status-badge status-${String(
                    selectedReferral.status || "unknown"
                  ).toLowerCase()}`}
                >
                  {getStatusLabel(selectedReferral.status)}
                </span>

                <span
                  className={`referral-urgency urgency-${String(
                    selectedReferral.urgency || "unknown"
                  ).toLowerCase()}`}
                >
                  {formatClinicalLabel(selectedReferral.urgency)}
                </span>
              </div>
            </div>

            {selectedReferral.referring_facility?.name && (
              <div className="referring-facility-banner">
                <span>Referring Facility</span>
                <strong>
                  {selectedReferral.referring_facility.name}
                </strong>
              </div>
            )}

            <ReferralSourceDetails
              referral={selectedReferral}
              editableInvestigationResults
              onInvestigationResultChange={
                handleInvestigationResultChange
              }
            />

            <hr />

            {selectedReferral.status === "under_assessment" ? (
              <>
                <div className="clinical-assessment-intro">
                  <span className="eyebrow">
                    CLINICAL DOCUMENTATION
                  </span>

                  <h3>
                    Receiving Facility Clinical Assessment
                  </h3>

                  <p>
                    Review the complete PHC referral information above before
                    documenting your receiving-facility assessment and outcome.
                  </p>
                </div>

                <section className="assessment-completion-panel" aria-label="Required assessment documentation progress">
                  <div className="assessment-completion-heading">
                    <strong>Required documentation</strong>
                    <span>{completedAssessmentFields} of {assessmentRequiredFields.length} completed</span>
                  </div>
                  <div
                    className="assessment-completion-track"
                    role="progressbar"
                    aria-label="Required assessment fields completed"
                    aria-valuemin={0}
                    aria-valuemax={assessmentRequiredFields.length}
                    aria-valuenow={completedAssessmentFields}
                  >
                    <span style={{ width: `${assessmentProgress}%` }} />
                  </div>
                  <ul className="assessment-completion-list">
                    {assessmentRequiredFields.map(({ key, label }) => (
                      <li key={key} className={String(assessmentForm[key] || "").trim() ? "is-complete" : ""}>
                        <span aria-hidden="true">{String(assessmentForm[key] || "").trim() ? "✓" : "○"}</span>
                        {label}
                      </li>
                    ))}
                  </ul>
                  <small>This checklist tracks required form fields only; it does not assess clinical adequacy or replace professional judgement.</small>
                </section>

                <form
                  onSubmit={
                    handleSaveAssessment
                  }
                >

                  <label>
                    Assessment Findings *
                  </label>

                  <textarea
                    name="assessment_findings"
                    value={
                      assessmentForm.assessment_findings
                    }
                    onChange={
                      handleAssessmentChange
                    }
                    rows="4"
                    placeholder="Document relevant clinical assessment findings..."
                    required
                  />

                  <label>
                    Final Diagnosis / Clinical Impression *
                  </label>

                  <textarea
                    name="final_diagnosis"
                    value={
                      assessmentForm.final_diagnosis
                    }
                    onChange={
                      handleAssessmentChange
                    }
                    rows="3"
                    placeholder="Enter final diagnosis or clinical impression..."
                    required
                  />

                  <label>
                    Diagnosis Status *
                  </label>

                  <select
                    name="diagnosis_status"
                    value={
                      assessmentForm.diagnosis_status
                    }
                    onChange={
                      handleAssessmentChange
                    }
                    required
                  >
                    <option value="">
                      Select diagnosis status
                    </option>

                    <option value="suspected">
                      Suspected
                    </option>

                    <option value="provisional">
                      Provisional
                    </option>

                    <option value="confirmed">
                      Confirmed
                    </option>
                  </select>

                  <label>
                    Diagnosis Category *
                  </label>

                  <select
                    name="diagnosis_category"
                    value={
                      assessmentForm.diagnosis_category
                    }
                    onChange={
                      handleAssessmentChange
                    }
                    required
                    disabled={
                      diagnosisCategoriesLoading
                    }
                  >
                    <option value="">
                      {diagnosisCategoriesLoading
                        ? "Loading diagnosis categories..."
                        : "Select diagnosis category"}
                    </option>

                    {diagnosisCategories.map(
                      (category) => (
                        <option
                          key={category.id}
                          value={category.name}
                        >
                          {category.name}
                        </option>
                      )
                    )}
                  </select>

                  <small className="form-help-text">
                    Select the clinical category that best describes
                    the receiving-facility diagnosis.
                  </small>

                  <label>
                    Treatment / Interventions Administered
                  </label>

                  <textarea
                    name="treatment_provided"
                    value={
                      assessmentForm.treatment_provided
                    }
                    onChange={
                      handleAssessmentChange
                    }
                    rows="4"
                    placeholder="Document medications, fluid therapy, procedures, or other interventions..."
                  />

                  <label>
                    Procedures Performed
                  </label>

                  <textarea
                    name="procedures_performed"
                    value={
                      assessmentForm.procedures_performed
                    }
                    onChange={
                      handleAssessmentChange
                    }
                    rows="3"
                    placeholder="Document procedures performed, if any..."
                  />

                  <label>
                    Clinical Feedback to Referring Facility
                  </label>

                  <textarea
                    name="clinical_feedback"
                    value={
                      assessmentForm.clinical_feedback
                    }
                    onChange={
                      handleAssessmentChange
                    }
                    rows="4"
                    placeholder="Provide relevant clinical feedback and follow-up recommendations..."
                  />

                  <label>
                    Clinical Disposition *
                  </label>

                  <select
                    name="disposition"
                    value={
                      assessmentForm.disposition
                    }
                    onChange={
                      handleAssessmentChange
                    }
                    required
                  >
                    <option value="">
                      Select disposition
                    </option>

                    <option value="admitted">
                      Admitted
                    </option>

                    <option value="discharged">
                      Discharged
                    </option>

                    <option value="referred_again">
                      Re-referred
                    </option>

                    <option value="observation">
                      Observation
                    </option>
                  </select>

                  <button
                    type="submit"
                    className="primary-button full-width"
                    disabled={
                      actionLoading ===
                      selectedReferral.id
                    }
                  >
                    {actionLoading ===
                    selectedReferral.id
                      ? "Saving Assessment..."
                      : "Save Clinical Assessment"}
                  </button>

                </form>
              </>
            ) : (
              <div className="referral-review-next-step">
                <span className="eyebrow">
                  CURRENT STATUS
                </span>

                <h3>
                  {getStatusLabel(selectedReferral.status)}
                </h3>

                <p>
                  The complete information from the referring PHC is shown
                  above. The receiving-facility clinical assessment form will
                  become available when the referral reaches
                  <strong> Under Assessment</strong>.
                </p>
              </div>
            )}

            {selectedReferral.status === "discharged" && (
              <CounterReferralForm
                referral={selectedReferral}
                onCompleted={(updatedReferral) => {
                  setSelectedReferral(updatedReferral);
                  loadIncomingReferrals();
                }}
              />
            )}

            <button
              type="button"
              className="back-button"
              onClick={() =>
                setSelectedReferral(
                  null
                )
              }
            >
              ← Back to Referrals
            </button>

            <PrintReferralSheet
              referral={selectedReferral}
              copyLabel="RECEIVING FACILITY COPY"
            />

          </div>

        </div>

      )}

    </>
  );
}

/* =======================================================
   ADMINISTRATOR-ONLY ROUTE PROTECTION
   ======================================================= */


/* =========================================================
   STRUCTURED COUNTER-REFERRAL
   ========================================================= */
function CounterReferralForm({ referral, onCompleted }) {
  const [form, setForm] = useState({
    final_diagnosis: referral?.discharge_diagnosis || referral?.final_diagnosis || "",
    treatment_provided: referral?.treatment_provided || "",
    outcome: "",
    follow_up_instructions: referral?.follow_up_plan || "",
    referred_further_to: "",
    additional_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const counterReferralRequiredFields = [
    { key: "final_diagnosis", label: "Final diagnosis" },
    { key: "outcome", label: "Patient outcome" },
    ...(form.outcome === "referred_further"
      ? [{ key: "referred_further_to", label: "Further referral destination" }]
      : []),
  ];
  const completedCounterReferralFields = counterReferralRequiredFields.filter(({ key }) =>
    String(form[key] || "").trim().length > 0
  ).length;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!referral?.id) {
      setError("The referral record could not be identified.");
      return;
    }
    if (!form.final_diagnosis.trim()) {
      setError("Final diagnosis is required.");
      return;
    }
    if (!form.outcome) {
      setError("Please select the patient's outcome.");
      return;
    }
    if (form.outcome === "referred_further" && !form.referred_further_to.trim()) {
      setError("Specify the facility or service receiving the further referral.");
      return;
    }

    setSaving(true);
    try {
      const { data: result, error: submitError } = await supabase.rpc(
        "submit_counter_referral",
        {
          p_referral_id: referral.id,
          p_final_diagnosis: form.final_diagnosis.trim(),
          p_treatment_provided: form.treatment_provided.trim() || null,
          p_outcome: form.outcome,
          p_follow_up_instructions: form.follow_up_instructions.trim() || null,
          p_referred_further_to: form.outcome === "referred_further"
            ? form.referred_further_to.trim()
            : null,
          p_additional_notes: form.additional_notes.trim() || null,
        }
      );

      if (submitError) throw submitError;
      const completion = Array.isArray(result) ? result[0] : result;
      if (!completion?.counter_referral_id || completion.referral_status !== "completed") {
        throw new Error("REFLINK could not confirm completion. Refresh the referral status before retrying.");
      }

      const counterReferralPayload = {
        id: completion.counter_referral_id,
        referral_id: referral.id,
        final_diagnosis: form.final_diagnosis.trim(),
        treatment_provided: form.treatment_provided.trim() || null,
        outcome: form.outcome,
        follow_up_instructions: form.follow_up_instructions.trim() || null,
        referred_further_to: form.outcome === "referred_further" ? form.referred_further_to.trim() : null,
        additional_notes: form.additional_notes.trim() || null,
      };

      setMessage("Counter-referral submitted and referral successfully completed.");
      if (onCompleted) {
        onCompleted({
          ...referral,
          status: completion.referral_status,
          completed_at: completion.completed_at,
          counter_referral: counterReferralPayload,
        });
      }
    } catch (submitError) {
      setError(submitError?.message || "Unable to submit the counter-referral. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="dashboard-card counter-referral-card" aria-labelledby="counter-referral-heading">
      <span className="eyebrow">CLOSED-LOOP REFERRAL</span>
      <h3 id="counter-referral-heading">Counter-Referral Feedback</h3>
      <p>Record the receiving facility's final outcome and follow-up information for referral <strong>{referral?.referral_number || "record"}</strong>. Submitting this form closes the referral episode and sends the documented outcome back through the referral record.</p>
      <div className="counter-referral-completion" aria-live="polite">
        <strong>{completedCounterReferralFields} of {counterReferralRequiredFields.length} required items completed</strong>
        <ul>
          {counterReferralRequiredFields.map(({ key, label }) => (
            <li key={key} className={String(form[key] || "").trim() ? "is-complete" : ""}>
              <span aria-hidden="true">{String(form[key] || "").trim() ? "✓" : "○"}</span> {label}
            </li>
          ))}
        </ul>
      </div>
      <div className="counter-referral-finality-note" role="note">
        Before submitting, verify the diagnosis, outcome and follow-up instructions. This action marks the referral as completed.
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="form-success" role="status">{message}</div>}

      <form onSubmit={handleSubmit}>
        <label htmlFor="counter-final-diagnosis">Final diagnosis *</label>
        <textarea id="counter-final-diagnosis" name="final_diagnosis" value={form.final_diagnosis} onChange={handleChange} rows="3" maxLength="4000" required />

        <label htmlFor="counter-treatment">Treatment provided</label>
        <textarea id="counter-treatment" name="treatment_provided" value={form.treatment_provided} onChange={handleChange} rows="3" maxLength="6000" />

        <label htmlFor="counter-outcome">Patient outcome *</label>
        <select id="counter-outcome" name="outcome" value={form.outcome} onChange={handleChange} required>
          <option value="">Select outcome</option>
          <option value="recovered">Recovered</option>
          <option value="improved">Improved</option>
          <option value="referred_further">Referred for further care</option>
          <option value="died">Died</option>
          <option value="other">Other / outcome documented in notes</option>
        </select>

        {form.outcome === "referred_further" && (
          <>
            <label htmlFor="counter-referred-to">Further referral destination *</label>
            <input id="counter-referred-to" name="referred_further_to" value={form.referred_further_to} onChange={handleChange} maxLength="500" required />
          </>
        )}

        <label htmlFor="counter-follow-up">Follow-up instructions for referring facility</label>
        <textarea id="counter-follow-up" name="follow_up_instructions" value={form.follow_up_instructions} onChange={handleChange} rows="3" maxLength="4000" />

        <label htmlFor="counter-additional-notes">Additional clinical notes</label>
        <textarea id="counter-additional-notes" name="additional_notes" value={form.additional_notes} onChange={handleChange} rows="3" maxLength="4000" />

        <button type="submit" className="primary-button full-width" disabled={saving}>
          {saving ? "Submitting Counter-Referral..." : "Submit Counter-Referral & Complete Referral"}
        </button>
      </form>
    </section>
  );
}

function AdministratorRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const verifyAdministrator = async () => {
      setChecking(true);
      setAuthorized(false);

      try {
        // Always verify the currently authenticated Supabase user.
        // Do not trust only the React role state for administrator access.
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error(
            "Your session has expired. Please sign in again."
          );
        }

        // Read the role from the user's REFLINK profile.
        const { data: userProfile, error: profileError } =
          await supabase
            .from("profiles")
            .select("id, role")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        const normalizedRole = String(
          userProfile?.role || ""
        )
          .trim()
          .toLowerCase();

        if (!cancelled) {
          setAuthorized(
            normalizedRole === "administrator"
          );
          setChecking(false);
        }
      } catch (error) {
        console.error(
          "ADMINISTRATOR ROUTE CHECK ERROR:",
          error
        );

        if (!cancelled) {
          setAuthorized(false);
          setChecking(false);
        }
      }
    };

    verifyAdministrator();

    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <div className="dashboard-card">
        <span className="eyebrow">
          ACCESS CONTROL
        </span>

        <h3>
          Verifying administrator access...
        </h3>

        <p>
          Please wait while REFLINK verifies your administrator permissions.
        </p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="dashboard-card">
        <span className="eyebrow">
          ACCESS DENIED
        </span>

        <h3>
          Administrator Access Required
        </h3>

        <p>
          You do not have permission to access the REFLINK Administration area.
        </p>

        <p>
          Your administrator permissions are verified directly against your REFLINK profile.
        </p>
      </div>
    );
  }

  return children;
}





export default App;
