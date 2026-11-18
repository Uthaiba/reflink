import PhcFollowUp from "./components/PhcFollowUp.jsx";

import { createPortal } from "react-dom";
import { referralJourney, filterReceivingReferrals } from "./lib/referralPresentation.js";
import { lazy, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { commitClinicalUpdate } from "./lib/clinicalSaveRecovery.js";
import { assessmentFormFor, inpatientFormFor, hasClinicalFormChanges } from "./lib/clinicalFormState.js";
import { confirmClinicalNavigation, registerClinicalDraft } from "./lib/clinicalDraftNavigation.js";
import EncryptedDraftPanel from "./components/EncryptedDraftPanel.jsx";
import { restoreDraftData } from "./lib/encryptedDrafts.js";
import { createReferralOnce } from "./lib/referralSubmission.js";
import { initialInvestigationRecords, saveInvestigation, uploadInitialInvestigationFiles } from "./lib/investigationUpdates.js";
const atomicInvestigationUpdatesEnabled = import.meta.env.VITE_ATOMIC_INVESTIGATIONS_ENABLED === "true";
import { changeAccountPassword, resolvePasswordChangeMode } from "./lib/passwordChange.js";
import { getLegacyDiagnosisStatus } from "./lib/diagnosisRecords.js";
import { inspectInvestigationAttachment } from "./lib/investigationAttachmentRecovery.js";
import { validateInvestigationFile, validateInvestigationFileContent, createInvestigationFilePath } from "./lib/investigationAttachments.js";
const AdminDashboard = lazy(() => import("./components/dashboards/AdminDashboard.jsx"));
const AnalyticsDashboard = lazy(() => import("./components/dashboards/AnalyticsDashboard.jsx"));
const AnalysisHub = lazy(() => import("./components/dashboards/AnalysisHub.jsx"));
import "./App.css";
import "./reflink-theme-professional.css";
import "./admin-dashboard-modern.css";
import "./reflink-clinical-accessibility.css";
import "./referral-print.css";

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
  const name = String(investigation).toLowerCase();

  if (name.includes("haemoglobin") || name.includes("hemoglobin") || name.includes("pcv")) {
    return {
      type: "quantitative",
      label: "Measurement",
      statuses: ["pending", "within_range", "low", "high", "critical", "invalid"],
      units: name.includes("pcv") ? ["%"] : ["g/dL", "g/L"],
    };
  }

  const quantitativeTerms = [
    "white blood cell", "wbc", "platelet", "urea", "creatinine",
    "glucose", "temperature", "blood pressure", "pulse rate",
    "respiratory rate", "oxygen saturation", "spo2", "sodium", "potassium",
    "chloride", "bicarbonate", "albumin", "bilirubin", "ast", "alt",
    "alkaline phosphatase", "electrolytes", "specific gravity", "ph", "titer"
  ];
  if (quantitativeTerms.some((term) => name.includes(term))) {
    return {
      type: "quantitative",
      label: "Measured value",
      statuses: ["pending", "within_range", "low", "high", "critical", "invalid"],
      units: ["", "%", "g/dL", "mmol/L", "mg/dL", "µmol/L", "10^9/L", "bpm", "°C", "mmHg", "%"]
    };
  }

  if (name.includes("urinalysis") || name.includes("urine analysis")) {
    return {
      type: "panel",
      label: "Panel result",
      statuses: ["pending", "normal", "abnormal", "inconclusive", "not_performed"],
      units: []
    };
  }

  if (name.includes("culture") || name.includes("microbiology") || name.includes("sputum") || name.includes("stool microscopy")) {
    return {
      type: "microbiology",
      label: "Microbiology result",
      statuses: ["pending", "growth_detected", "no_growth", "detected", "not_detected", "contaminated", "inconclusive"],
      units: []
    };
  }

  if (name.includes("ultrasound") || name.includes("x-ray") || name.includes("xray") || name.includes("ct scan") || name.includes("mri") || name.includes("imaging")) {
    return {
      type: "imaging",
      label: "Imaging report",
      statuses: ["pending", "no_significant_abnormality", "abnormal_finding", "inconclusive"],
      units: []
    };
  }

  return {
    type: "qualitative",
    label: "Result",
    statuses: ["pending", "positive", "negative", "reactive", "non_reactive", "indeterminate", "invalid", "not_performed"],
    units: []
  };
}

const INVESTIGATION_STATUS_LABELS = {
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

function getInvestigationResultClass(status) {
  if (["positive", "reactive", "growth_detected", "abnormal", "abnormal_finding", "high", "low", "critical"].includes(status)) return "investigation-result-positive";
  if (["negative", "non_reactive", "no_growth", "not_detected", "normal", "within_range", "no_significant_abnormality"].includes(status)) return "investigation-result-negative";
  return "investigation-result-pending";
}

function normalizeInvestigationRecord(item) {
  if (typeof item === "string") {
    return { category: "", investigation: item, result_status: "pending", result_value: "", result_unit: "", reference_range: "", interpretation: "", result_notes: "", result_file_path: "", result_file_name: "", result_file_type: "", result_file_size: null };
  }
  return {
    ...item,
    category: item?.category || "",
    investigation: item?.investigation || item?.name || "Investigation",
    result_status: item?.result_status || "pending",
    result_value: item?.result_value || "",
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

function InvestigationResultCards({ investigations, editable = false, onResultChange, onFileUpload, expectedSnapshot }) {
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const hasUnsavedChanges = Object.keys(drafts).length > 0;
  useEffect(() => registerClinicalDraft(window, () => hasUnsavedChanges || saving !== null), [hasUnsavedChanges, saving]);
  const changeDraft = (index, patch) => setDrafts((previous) => ({
    ...previous,
    [index]: { patch: { ...previous[index]?.patch, ...patch },
      expected: previous[index]?.expected ?? expectedSnapshot,
      blocked: previous[index]?.blocked ?? false },
  }));
  const saveDraft = async (index) => {
    if (!drafts[index] || saving !== null) return;
    setSaving(index);
    try {
      const saved = await onResultChange?.(index, drafts[index].patch, drafts[index].expected);
      if (!saved) setDrafts((previous) => ({ ...previous, [index]: { ...previous[index], blocked: true } }));
      if (saved) setDrafts((previous) => {
        const next = { ...previous }; delete next[index]; return next;
      });
    } finally { setSaving(null); }
  };
  if (!investigations.length) return <div className="empty-selection-state">No investigation was recorded.</div>;
  const normalized = investigations.map((item, index) => ({ ...normalizeInvestigationRecord(item), ...drafts[index]?.patch }));
  return (
    <div className="investigation-result-list">
      {normalized.map((item, index) => {
        const config = getInvestigationResultConfig(item.investigation);
        return (
          <div className="investigation-result-card" key={`${item.category}-${item.investigation}-${index}`}>
            <div className="investigation-result-main">
              <span className="investigation-checkmark">✓</span>
              <div className="investigation-result-name"><strong>{item.investigation}</strong>{item.category && <small>{item.category}</small>}</div>
            </div>
            <div className="investigation-result-control">
              <span>{config.label}</span>
              {editable ? (
                <select disabled={saving !== null} value={item.result_status} onChange={(e) => changeDraft(index, { result_status: e.target.value })} aria-label={`Result for ${item.investigation}`}>
                  {config.statuses.map((status) => <option value={status} key={status}>{getInvestigationResultLabel(status)}</option>)}
                </select>
              ) : <span className={`investigation-result-badge ${getInvestigationResultClass(item.result_status)}`}>{getInvestigationResultLabel(item.result_status)}</span>}
            </div>
            {editable && (
              <div className="investigation-result-detail-grid">
                {config.type === "quantitative" && <>
                  <label><span>Value</span><input disabled={saving !== null} value={item.result_value} onChange={(e) => changeDraft(index, { result_value: e.target.value })} placeholder="e.g. 32" /></label>
                  <label><span>Unit</span><input disabled={saving !== null} value={item.result_unit} onChange={(e) => changeDraft(index, { result_unit: e.target.value })} placeholder="% / g/dL" /></label>
                  <label><span>Reference range</span><input disabled={saving !== null} value={item.reference_range} onChange={(e) => changeDraft(index, { reference_range: e.target.value })} placeholder="Use performing laboratory range" /></label>
                </>}
                {config.type === "panel" && <label className="investigation-result-notes"><span>Panel findings</span><textarea disabled={saving !== null} value={item.result_value} onChange={(e) => changeDraft(index, { result_value: e.target.value })} placeholder="Record pH, protein, glucose, blood, nitrite, leukocytes, specific gravity and other findings." rows={3} /></label>}
                {(config.type === "qualitative" || config.type === "microbiology" || config.type === "imaging") && <label className="investigation-result-notes"><span>Result / report detail</span><textarea disabled={saving !== null} value={item.result_value} onChange={(e) => changeDraft(index, { result_value: e.target.value })} placeholder={config.type === "imaging" ? "Enter report findings and impression." : "Enter organism, finding or additional result detail."} rows={3} /></label>}
                <label className="investigation-result-notes"><span>Clinical/laboratory note</span><textarea disabled={saving !== null} value={item.result_notes} onChange={(e) => changeDraft(index, { result_notes: e.target.value })} placeholder="Optional note" rows={2} /></label>
              </div>
            )}
            {!editable && item.result_value && <div className="investigation-result-value"><span>Result detail</span><strong>{item.result_value}</strong>{item.result_unit && <small>{item.result_unit}</small>}{item.reference_range && <small>Reference: {item.reference_range}</small>}</div>}
            {editable && drafts[index] && <div role="status">
              Unsaved changes. <button type="button" className="secondary-button"
                disabled={saving !== null || drafts[index].blocked} onClick={() => saveDraft(index)}>Save result</button>
              <button type="button" className="secondary-button" disabled={saving !== null}
                onClick={() => setDrafts((previous) => { const next = { ...previous }; delete next[index]; return next; })}>
                Discard draft
              </button>
            </div>}
            <div className="investigation-file-row">
              <div><span>Original result</span><strong>{item.result_file_name || "No result document attached"}</strong>{item.result_file_size ? <small>{Math.round(item.result_file_size / 1024)} KB</small> : null}</div>
              {editable && <label className="upload-result-button">📎 {item.result_file_name ? "Replace result" : "Upload result"}<input type="file" disabled={saving !== null || Object.keys(drafts).length > 0} accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv" onChange={(e) => onFileUpload?.(index, e.target.files?.[0] || null)} /></label>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PrintReferralSheet({
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

  const referralId =
    referral?.referral_number || "DRAFT REFERRAL";

  const patientIdentifier =
    referral?.patient_identifier || "Not recorded";

  const referringFacility =
    referral?.referring_facility?.name ||
    referral?.referring_facility_name ||
    "Not recorded";

  const receivingFacility =
    referral?.receiving_facility?.name ||
    referral?.receiving_facility_name ||
    "Not recorded";

  return createPortal(
    <div className="printable-referral-sheet">

      {/* =====================================================
          DOCUMENT HEADER
      ===================================================== */}
      <header className="print-document-header">

        <div className="print-brand-block">
          <div className="print-brand-mark">
            <span>R</span>
          </div>

          <div>
            <div className="print-brand">REFLINK</div>

            <div className="print-brand-subtitle">
              DIGITAL REFERRAL & CARE CONTINUITY SYSTEM
            </div>

            <h1>Patient Referral Form</h1>

            <p>
              Secure inter-facility referral • {copyLabel}
            </p>
          </div>
        </div>

        <div className="print-referral-meta">
          <span>REFLINK ID</span>

          <strong>{referralId}</strong>

          <small>
            Created:{" "}
            {formatReferralDateTime(referral?.created_at)}
          </small>
        </div>

      </header>


      {/* =====================================================
          STATUS BAR
      ===================================================== */}
      <section className="print-status-bar">

        <div>
          <span>REFERRAL STATUS</span>
          <strong>
            {getStatusLabel(referral?.status)}
          </strong>
        </div>

        <div>
          <span>URGENCY</span>
          <strong>
            {formatClinicalLabel(referral?.urgency)}
          </strong>
        </div>

        <div>
          <span>DOCUMENT TYPE</span>
          <strong>{copyLabel}</strong>
        </div>

      </section>


      {/* =====================================================
          PATIENT INFORMATION
      ===================================================== */}
      <section className="print-section">

        <div className="print-section-title">
          <h2>Patient Information</h2>
        </div>

        <div className="print-grid print-patient-grid">

          <div>
            <span>Patient Identifier</span>
            <strong>{patientIdentifier}</strong>
          </div>

          <div>
            <span>Age</span>
            <strong>
              {formatPatientAge(
                referral?.patient_age_months
              )}
            </strong>
          </div>

          <div>
            <span>Sex</span>
            <strong>
              {formatClinicalLabel(
                referral?.patient_sex
              )}
            </strong>
          </div>

          <div>
            <span>Patient Phone</span>
            <strong>
              {referral?.patient_phone ||
                "Not recorded"}
            </strong>
          </div>

          <div className="print-grid-span-2">
            <span>Patient Address</span>
            <strong>
              {referral?.patient_address ||
                "Not recorded"}
            </strong>
          </div>

        </div>

      </section>


      {/* =====================================================
          NEXT OF KIN
      ===================================================== */}
      {(referral?.relative_name ||
        referral?.relative_phone ||
        referral?.relative_relationship) && (

        <section className="print-section">

          <div className="print-section-title">
            <h2>Next of Kin / Emergency Contact</h2>
          </div>

          <div className="print-grid">

            <div>
              <span>Name</span>
              <strong>
                {referral?.relative_name ||
                  "Not recorded"}
              </strong>
            </div>

            <div>
              <span>Relationship</span>
              <strong>
                {referral?.relative_relationship ||
                  "Not recorded"}
              </strong>
            </div>

            <div>
              <span>Phone</span>
              <strong>
                {referral?.relative_phone ||
                  "Not recorded"}
              </strong>
            </div>

          </div>

        </section>
      )}


      {/* =====================================================
          REFERRAL PATHWAY
      ===================================================== */}
      <section className="print-section">

        <div className="print-section-title">
          <h2>Referral Pathway</h2>
        </div>

        <div className="referral-pathway">

          <div className="facility-card">
            <span>FROM — REFERRING FACILITY</span>

            <strong>{referringFacility}</strong>

            {referral?.referring_facility?.lga && (
              <small>
                {referral.referring_facility.lga}
                {referral.referring_facility.state
                  ? `, ${referral.referring_facility.state}`
                  : ""}
              </small>
            )}
          </div>

          <div className="pathway-arrow">
            →
          </div>

          <div className="facility-card">
            <span>TO — RECEIVING FACILITY</span>

            <strong>{receivingFacility}</strong>

            {referral?.receiving_facility?.lga && (
              <small>
                {referral.receiving_facility.lga}
                {referral.receiving_facility.state
                  ? `, ${referral.receiving_facility.state}`
                  : ""}
              </small>
            )}
          </div>

        </div>

        <div className="print-grid referral-date-grid">

          <div>
            <span>Referral Date</span>
            <strong>
              {formatReferralDateTime(
                referral?.created_at
              )}
            </strong>
          </div>

          <div>
            <span>Referral Number</span>
            <strong>{referralId}</strong>
          </div>

        </div>

      </section>


      {/* =====================================================
          CLINICAL PRESENTATION
      ===================================================== */}
      <section className="print-section">

        <div className="print-section-title">
          <h2>Clinical Presentation</h2>
        </div>

        <div className="print-narrative-grid">

          <div className="print-narrative-card">
            <span>Chief Complaint</span>
            <p>
              {referral?.chief_complaint ||
                "Not recorded"}
            </p>
          </div>

          <div className="print-narrative-card">
            <span>Clinical Summary</span>
            <p>
              {referral?.clinical_summary ||
                "Not recorded"}
            </p>
          </div>

          <div className="print-narrative-card">
            <span>Physical Findings</span>
            <p>
              {referral?.physical_findings ||
                "Not recorded"}
            </p>
          </div>

          <div className="print-narrative-card">
            <span>Reason for Referral</span>
            <p>
              {referral?.referral_reason ||
                "Not recorded"}
            </p>
          </div>

        </div>

      </section>


      {/* =====================================================
          TREATMENT GIVEN
      ===================================================== */}
      <section className="print-section">

        <div className="print-section-title">
          <h2>Treatment Given Before Referral</h2>
        </div>

        <div className="print-narrative-card">
          <span>Treatment / Interventions</span>

          <p>
            {referral?.treatment_given ||
              "No treatment documented."}
          </p>
        </div>

      </section>


      {/* =====================================================
          DIAGNOSIS
      ===================================================== */}
      <section className="print-section">

        <div className="print-section-title">
          <h2>Diagnosis</h2>
        </div>

        {diagnoses.length ? (

          <table className="print-table">

            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
                <th>Category</th>
                <th>Diagnosis / Clinical Impression</th>
              </tr>
            </thead>

            <tbody>

              {diagnoses.map((item, index) => (

                <tr
                  key={`${item?.diagnosis || index}-${index}`}
                >

                  <td>{index + 1}</td>

                  <td>
                    {formatClinicalLabel(
                      item?.status
                    )}
                  </td>

                  <td>
                    {item?.category ||
                      "Not recorded"}
                  </td>

                  <td>
                    {item?.diagnosis ||
                      item?.name ||
                      "Not recorded"}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        ) : (

          <div className="print-empty-state">
            No diagnosis recorded.
          </div>

        )}

      </section>


      {/* =====================================================
          INVESTIGATIONS
      ===================================================== */}
      <section className="print-section">

        <div className="print-section-title">
          <h2>Investigations & Results</h2>
        </div>

        {investigations.length ? (

          <table className="print-table">

            <thead>
              <tr>
                <th>#</th>
                <th>Category</th>
                <th>Investigation</th>
                <th>Result / Status</th>
              </tr>
            </thead>

            <tbody>

              {investigations.map((item, index) => (

                <tr
                  key={`${item.category}-${item.investigation}-${index}`}
                >

                  <td>{index + 1}</td>

                  <td>
                    {item.category ||
                      "Other"}
                  </td>

                  <td>
                    {item.investigation}
                  </td>

                  <td>
                    {getInvestigationResultLabel(
                      item.result_status
                    )}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        ) : (

          <div className="print-empty-state">
            No investigations recorded.
          </div>

        )}

      </section>


      {/* =====================================================
          RECEIVING FACILITY UPDATE
      ===================================================== */}
      {hasReceivingUpdate && (

        <section className="print-section receiving-update-section">

          <div className="print-section-title">
            <h2>Receiving Facility Update</h2>
          </div>

          <div className="print-narrative-grid">

            {referral?.assessment_findings && (
              <div className="print-narrative-card">
                <span>Assessment Findings</span>
                <p>
                  {referral.assessment_findings}
                </p>
              </div>
            )}

            {referral?.final_diagnosis && (
              <div className="print-narrative-card">
                <span>Final Diagnosis / Clinical Impression</span>
                <p>
                  {referral.final_diagnosis}
                </p>
              </div>
            )}

            {referral?.diagnosis_status && (
              <div>
                <span>Diagnosis Status</span>
                <strong>
                  {formatClinicalLabel(
                    referral.diagnosis_status
                  )}
                </strong>
              </div>
            )}

            {referral?.diagnosis_category && (
              <div>
                <span>Diagnosis Category</span>
                <strong>
                  {referral.diagnosis_category}
                </strong>
              </div>
            )}

            {referral?.treatment_provided && (
              <div className="print-narrative-card">
                <span>Treatment Provided</span>
                <p>
                  {referral.treatment_provided}
                </p>
              </div>
            )}

            {referral?.procedures_performed && (
              <div className="print-narrative-card">
                <span>Procedures Performed</span>
                <p>
                  {referral.procedures_performed}
                </p>
              </div>
            )}

            {referral?.clinical_feedback && (
              <div className="print-narrative-card">
                <span>Clinical Feedback</span>
                <p>
                  {referral.clinical_feedback}
                </p>
              </div>
            )}

            {referral?.disposition && (
              <div>
                <span>Disposition at Assessment</span>
                <strong>
                  {formatClinicalLabel(
                    referral.disposition
                  )}
                </strong>
              </div>
            )}

          </div>

        </section>

      )}


      {[
        { title: "Inpatient Information", fields: [["Admission Date", "admission_at", true], ["Ward / Unit", "ward_unit"], ["Admission Diagnosis", "admission_diagnosis"], ["Clinical Progress", "clinical_progress"], ["Inpatient Treatment", "inpatient_treatment"]] },
        { title: "Discharge Information", fields: [["Discharge Diagnosis", "discharge_diagnosis"], ["Condition at Discharge", "condition_at_discharge"], ["Discharge Medications", "discharge_medications"], ["Follow-up Plan", "follow_up_plan"], ["Discharged At", "discharged_at", true]] },
      ].filter((section) => section.fields.some(([, field]) => referral?.[field])).map((section) => (
        <section className="print-section" key={section.title}>
          <div className="print-section-title"><h2>{section.title}</h2></div>
          <div className="print-narrative-grid">{section.fields.map(([label, field, date]) => (
            <div className="print-narrative-card" key={field}><span>{label}</span>
              <p>{referral?.[field] ? (date ? formatReferralDateTime(referral[field]) : referral[field]) : "Not recorded"}</p>
            </div>
          ))}</div>
        </section>
      ))}

      {/* =====================================================
          REFERRAL CONTINUITY
      ===================================================== */}
      <section className="print-section">

        <div className="print-section-title">
          <h2>Referral Continuity</h2>
        </div>

        <table className="print-table">
          <thead><tr><th>Event</th><th>Date and time (local)</th></tr></thead>
          <tbody>{referralJourney(referral).map((step) => (
            <tr key={step.key}><td>{step.label}</td><td>{step.timestamp ? formatReferralDateTime(step.timestamp) : "Not recorded"}</td></tr>
          ))}</tbody>
        </table>

      </section>


      {/* =====================================================
          SIGNATURES
      ===================================================== */}
      <section className="print-signature-section">

        <div className="signature-block">
          <span>Referring Health Worker</span>
          <div className="signature-line" />
          <small>Signature / Date</small>
        </div>

        <div className="signature-block">
          <span>Receiving Health Worker</span>
          <div className="signature-line" />
          <small>Signature / Date</small>
        </div>

        <div className="signature-block stamp-signature">
          <span>Facility Stamp</span>
          <div className="stamp-box" />
          <small>Official facility stamp</small>
        </div>

      </section>


      {/* =====================================================
          DOCUMENT FOOTER
      ===================================================== */}
      <footer className="print-document-footer">

        <div>
          <strong>REFLINK</strong>
          <span>
            Digital referral for continuity of care
          </span>
        </div>

        <div>
          <span>REFLINK ID:</span>
          <strong>{referralId}</strong>
        </div>

        <p>
          Keep this paper copy with the patient
          referral record. Confidential clinical
          information — handle appropriately.
        </p>

      </footer>

    </div>, document.body
  );
}

function printReferralForm() {
  window.print();
}

function ReferralSourceDetails({ referral, editableInvestigationResults = false, onInvestigationResultChange, onInvestigationFileUpload }) {
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
      const category = item?.category || "Other Investigations";

      if (!groups[category]) {
        groups[category] = [];
      }

      const investigation =
        item?.investigation ||
        item?.name ||
        (typeof item === "string" ? item : "");

      if (investigation) {
        groups[category].push(item);
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
                    key={`${referral.id}:${category}`}
                    investigations={items}
                    editable={editableInvestigationResults}
                    expectedSnapshot={referral.investigation_records}
                    onFileUpload={(localIndex, file) => {
                      const selectedItem = items[localIndex];
                      const globalIndex = investigations.findIndex((entry) => entry === selectedItem);
                      if (globalIndex >= 0) return onInvestigationFileUpload?.(globalIndex, file);
                    }}
                    onResultChange={(localIndex, value, expected) => {
                      const categoryItems = investigations.filter(
                        (entry) =>
                          (entry?.category || "Other Investigations") === category
                      );
                      const selectedItem = categoryItems[localIndex];
                      const globalIndex = investigations.findIndex(
                        (entry) => entry === selectedItem
                      );

                      if (globalIndex >= 0) {
                        return onInvestigationResultChange?.(globalIndex, value, expected);
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
  const steps = referralJourney(referral);

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
                <span>{completed ? formatReferralDateTime(step.timestamp) : "Awaiting update"}</span>
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

function App() {
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
  const [passwordOutcome, setPasswordOutcome] = useState(null);
  const passwordChangeInFlight = useRef(false);
  const passwordChangeLocked = ["confirmed", "account_pending", "unknown"].includes(passwordOutcome);

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
      console.error(
        "Profile loading error:",
        profileError
      );

      setLoginError(
        "Login successful, but your REFLINK profile could not be loaded."
      );

      await supabase.auth.signOut();
      return;
    }

    // 3. Normalize role
    const normalizedRole =
      String(userProfile.role || "")
        .trim()
        .toLowerCase();

    let applicationRole = null;

    if (normalizedRole === "phc_staff") {
      applicationRole = "PHC Staff";
    } else if (
      normalizedRole === "receiving_staff"
    ) {
      applicationRole = "Receiving Facility";
    } else if (
      normalizedRole === "administrator"
    ) {
      applicationRole = "Administrator";
    }

    // 4. Reject unsupported roles
    if (!applicationRole) {
      console.error(
        "Unsupported REFLINK role:",
        userProfile.role
      );

      setLoginError(
        `Your REFLINK account has an unsupported role: "${userProfile.role}". Please contact the system administrator.`
      );

      await supabase.auth.signOut();
      return;
    }

    // 5. Store authenticated profile
    setProfile({
      ...userProfile,
      auth_user_id: user.id,
    });

    setRole(applicationRole);

    if (userProfile.must_change_password) {
      setPasswordOutcome(null);
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setRole(null);
        setProfile(null);
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setScreen("login");
      }
      if (event === "PASSWORD_RECOVERY") {
        setRole(null);
        setProfile(null);
        setPasswordOutcome(null);
        setPasswordError("");
        setPasswordMessage("");
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setScreen("change-password");
      }
    });

    return () => {
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
    if (passwordChangeInFlight.current || passwordChangeLocked) return;
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

    passwordChangeInFlight.current = true;
    setPasswordSaving(true);
    try {
      const mode = resolvePasswordChangeMode(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_PASSWORD_CHANGE_MODE
      );
      const result = await changeAccountPassword(supabase, newPassword, mode);
      setPasswordOutcome(result.status);
      if (result.status === "confirmed") {
        setProfile((previous) => previous?.id === result.userId
          ? { ...previous, must_change_password: false } : null);
        setPasswordMessage("Password and account status confirmed. Sign out, then sign in with your new password.");
      } else if (result.status === "account_pending") {
        setPasswordError("Your password changed, but account access could not be confirmed. Do not submit another password change. Sign out and sign in with the new password; contact an administrator if access remains blocked.");
      } else if (result.status === "unknown") {
        setPasswordError("The password-change outcome could not be confirmed. Do not retry here. Sign out and verify your new password, or use password recovery.");
      } else {
        setPasswordError("Password change was not started. Check your connection and sign-in session. If this continues, contact an administrator.");
      }
    } finally {
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      passwordChangeInFlight.current = false;
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

      {/* =====================================================
          HOME PAGE
          ===================================================== */}

      {screen === "home" && (
  <>
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">R</div>

        <div>
          <h1>REFLINK</h1>
          <p>Connected Referral Care</p>
        </div>
      </div>

      <nav className="home-nav">
        <button
          type="button"
          onClick={() =>
            document
              .getElementById("how-it-works")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          How It Works
        </button>

        <button
          type="button"
          onClick={() =>
            document
              .getElementById("platform")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Platform
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
            DIGITAL HEALTH • CLOSED-LOOP REFERRAL
          </span>

          <h2>
            Every Referral Connected.
            <br />
            <span>Every Patient Followed.</span>
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
              Access REFLINK
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
              <span>Secure Referral</span>
            </div>

            <div>
              <strong>02</strong>
              <span>Real-Time Tracking</span>
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
                LIVE REFERRAL NETWORK
              </div>

              <span className="network-status">
                ACTIVE
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
                <strong>Connected & Tracked</strong>
              </div>

              <span>ACTIVE</span>
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
          <div className="brand-mark">R</div>

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

            <div className="login-logo">
              R
            </div>

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
              className="back-button" data-leave-clinical-workspace
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
            <div className="login-logo">R</div>

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
                disabled={passwordSaving || passwordChangeLocked}
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
                disabled={passwordSaving || passwordChangeLocked}
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
                <div className="login-error" role="alert">
                  {passwordError}
                </div>
              )}

              {passwordMessage && (
                <div className="success-message" role="status">
                  {passwordMessage}
                </div>
              )}

              <button
                type="submit"
                className="primary-button full-width"
                disabled={passwordSaving || passwordChangeLocked}
              >
                {passwordSaving
                  ? "Updating Password..."
                  : "Update Password"}
              </button>
            </form>

            <button
              type="button"
              className="back-button" data-leave-clinical-workspace
              disabled={passwordSaving}
              onClick={() => {
                if (profile?.must_change_password || passwordChangeLocked || !role) {
                  logout();
                  return;
                }
                setPasswordError("");
                setPasswordMessage("");
                setScreen("dashboard");
              }}
            >
              {profile?.must_change_password || passwordChangeLocked || !role ? "Sign Out" : "← Back"}
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

              <div className="brand-mark">
                R
              </div>

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
                  if (!confirmClinicalNavigation(window)) return;
                  setPasswordOutcome(null);
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
                className="logout-button" data-leave-clinical-workspace
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
                  AnalyticsDashboard={AnalyticsDashboard}
                  AnalysisHub={AnalysisHub}
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

              <div className="brand-mark">
                R
              </div>

              <div>
                <h1>REFLINK</h1>
                <p>PHC Staff</p>
              </div>

            </div>

            <button
              type="button"
              className="logout-button" data-leave-clinical-workspace
              onClick={logout}
            >
              Sign Out
            </button>

          </header>

          <main className="dashboard">

            <NewReferralForm
              ownerId={profile?.id}
              referringFacilityId={profile?.facility_id}
              onBack={() => setScreen("dashboard")}
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
  return (
    <div className="referral-investigation-result-editor">
      <select value={item.result_status || "pending"} onChange={(e) => onChange({ result_status: e.target.value })}>
        {config.statuses.map((status) => <option key={status} value={status}>{getInvestigationResultLabel(status)}</option>)}
      </select>
      {config.type === "quantitative" ? <>
        <input value={item.result_value || ""} onChange={(e) => onChange({ result_value: e.target.value })} placeholder="Result value" />
        <input value={item.result_unit || ""} onChange={(e) => onChange({ result_unit: e.target.value })} placeholder="Unit" />
        <input value={item.reference_range || ""} onChange={(e) => onChange({ reference_range: e.target.value })} placeholder="Lab reference range" />
      </> : <textarea value={item.result_value || ""} onChange={(e) => onChange({ result_value: e.target.value })} placeholder={config.type === "panel" ? "Structured panel findings" : "Result/report detail"} rows={2} />}
      <label className="upload-result-button compact-upload">📎 Upload<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv" onChange={(e) => onFileChange(e.target.files?.[0] || null)} /></label>
    </div>
  );
}

function NewReferralForm({ onBack, ownerId, referringFacilityId }) {
  const clientSubmissionId = useRef(crypto.randomUUID());
  const submissionInFlight = useRef(false);
  const [fromDeviceDraft, setFromDeviceDraft] = useState(false);

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
  clinical_summary: "",
  physical_findings: "",

  // DIAGNOSIS
diagnosis_status: "",
diagnosis_category: "",
provisional_diagnosis: "",

  // INVESTIGATIONS
  investigation_category: "",
  investigations: "",

  // KEEPING TREATMENT AS CURRENT FREE-TEXT FIELD
  treatment_given: "",

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
  const hasUnsavedReferral = Object.entries(form).some(([field, value]) =>
    !["patient_age_unit", "urgency"].includes(field) && String(value ?? "").trim() !== ""
  ) || form.urgency !== "routine" || Object.values(diagnosisDraft).some((value) => String(value).trim() !== "")
    || diagnosisEntries.length > 0 || selectedInvestigations.length > 0 || selectedInvestigationCategories.length > 0;
  useEffect(() => registerClinicalDraft(window, () => hasUnsavedReferral || loading), [hasUnsavedReferral, loading]);


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

    console.log(
      "FACILITIES FROM SUPABASE:",
      data
    );

    console.log(
      "FACILITIES ERROR:",
      error
    );

    if (error) {
      setError(
        "Unable to load receiving facilities."
      );

      console.error(error);
      return;
    }

    setFacilities(data || []);
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
          result_unit: "",
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
    try { validateInvestigationFile(file); }
    catch (error) { setError(error.message); return; }
    updateInvestigationResult(index, { result_file: file, result_file_name: file.name, result_file_type: file.type, result_file_size: file.size });
    setError("");
  };

  const printDraftReferral = () => {
    const draftReferral = {
      referral_number: "DRAFT REFERRAL",
      referring_facility: facilities.find((facility) => facility.id === referringFacilityId),
      receiving_facility: facilities.find((facility) => facility.id === form.receiving_facility_id),
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

  const handleSubmit = async (e) => {

    e.preventDefault();
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;

    setError("");
    setSavedReferralInfo(null);
    setPrintDraft(null);
    setMessage("");
    setLoading(true);

    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("Device is offline. Referral was not submitted. Follow the approved facility referral procedure and retry when connected.");
      }


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
    form.chief_complaint ||
    null,

  clinical_summary:
    form.clinical_summary ||
    null,

  physical_findings:
    form.physical_findings ||
    null,

  // MULTIPLE DIAGNOSES
  diagnosis_records:
    diagnosisEntries,

  // Keep legacy fields populated for compatibility with existing records/views.
  diagnosis_status:
    getLegacyDiagnosisStatus(diagnosisEntries),

  diagnosis_category:
    [...new Set(diagnosisEntries.map((item) => item.category))]
      .join(", ") || null,

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
    initialInvestigationRecords(selectedInvestigations),

  investigations:
    selectedInvestigations
      .map(
        (item) =>
          `${item.investigation} (${item.category})`
      )
      .join(" • ") || null,

  // KEEP THIS AS IT CURRENTLY WORKS
  treatment_given:
    form.treatment_given ||
    null,

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

      const insertedReferral = await createReferralOnce(
        supabase, referralPayload, clientSubmissionId.current, fromDeviceDraft
      );

      // Referral is already persisted at this point. A failed optional
      // attachment upload must not be reported as a failed referral.
      let attachmentWarning = "";
      let savedInvestigationRecords = initialInvestigationRecords(selectedInvestigations);
      try {
        savedInvestigationRecords = await uploadInitialInvestigationFiles(
          supabase, insertedReferral.id, selectedInvestigations,
          savedInvestigationRecords, atomicInvestigationUpdatesEnabled
        );
      } catch (attachmentError) {
        if (Array.isArray(attachmentError.confirmedRecords)) savedInvestigationRecords = attachmentError.confirmedRecords;
        attachmentWarning = attachmentError.message === "INVESTIGATION_SERVICE_UNAVAILABLE"
          ? " Investigation attachments were not uploaded because the verified attachment service is unavailable. Preserve the original documents and follow the facility referral procedure."
          : " Attachment registration could not be fully confirmed. The referral remains saved. Preserve the originals and ask an administrator to reconcile the uploads before retrying.";
      }

      const referringFacility = facilities.find(
        (facility) => facility.id === profile.facility_id
      );
      const receivingFacility = facilities.find(
        (facility) => facility.id === form.receiving_facility_id
      );

      const savedReferral = {
        ...referralPayload,
        investigation_records: savedInvestigationRecords,
        referral_number: referralNumber,
        created_at: new Date().toISOString(),
        referring_facility_name: referringFacility?.name || "Not recorded",
        receiving_facility_name: receivingFacility?.name || "Not recorded",
      };

      setSavedReferralInfo({
        referralNumber,
        patientIdentifier: form.patient_identifier,
      });
      setPrintDraft(savedReferral);

      setMessage(
        `Referral saved. REFLINK ID: ${referralNumber}.${attachmentWarning}`
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
  clinical_summary: "",
  physical_findings: "",

  diagnosis_status: "",
  diagnosis_category: "",
  provisional_diagnosis: "",

  investigation_category: "",
  investigations: "",
  treatment_given: "",

  referral_reason: "",
  urgency: "routine",
  receiving_facility_id: "",
});

      clientSubmissionId.current = crypto.randomUUID();
      setFromDeviceDraft(false);
      setDiagnosisEntries([]);
      setDiagnosisDraft({
        status: "",
        category: "",
        diagnosis: "",
      });
      setSelectedInvestigationCategories([]);
      setSelectedInvestigations([]);

    } catch (err) {



      setError(
        err.message ||
        "Unable to create referral."
      );

    } finally {

      submissionInFlight.current = false;
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
            New Referral
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
            className="back-button" data-leave-clinical-workspace
            onClick={onBack}
          >
            ← Back
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
              onClick={() => {
                window.setTimeout(() => window.print(), 80);
              }}
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

      {import.meta.env.VITE_ENCRYPTED_DRAFTS_ENABLED === "true" && <EncryptedDraftPanel
        ownerId={ownerId} draftId={clientSubmissionId.current} disabled={loading}
        getDraft={() => ({
          form, clientSubmissionId: clientSubmissionId.current, diagnosisEntries,
          categories: selectedInvestigationCategories,
          investigations: initialInvestigationRecords(selectedInvestigations),
        })}
        restoreDraft={(data) => {
          const restored = restoreDraftData(data, form);
          setForm(restored.form);
          setDiagnosisEntries(restored.diagnosisEntries);
          setSelectedInvestigationCategories(restored.categories);
          setSelectedInvestigations(restored.investigations);
          clientSubmissionId.current = restored.clientSubmissionId;
          setFromDeviceDraft(true);
          setError(""); setMessage(""); setSavedReferralInfo(null); setPrintDraft(null);
        }}
      />}

      <form onSubmit={handleSubmit}>

        <h3>
          Patient Information
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

        <div className="form-grid">

          <div>

            <label>Patient Age</label>
            <div className="age-input-row">
              <input
                type="number"
                name="patient_age_months"
                value={form.patient_age_months}
                onChange={handleChange}
                min="0"
                step="1"
                placeholder={form.patient_age_unit === "months" ? "e.g. 8" : "e.g. 22"}
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
              Use months for infants and young children; use years for older children and adults.
              REFLINK stores the normalized value in months for consistent analytics.
            </div>
            <div className="form-help-text age-normalized-preview">
              {form.patient_age_months !== ""
                ? `Recorded as: ${formatPatientAge(normalizePatientAgeToMonths(form.patient_age_months, form.patient_age_unit))}`
                : "Recorded age will appear here."}
            </div>
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

<div className="form-section">
  <h4>Relative / Caregiver Information</h4>

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
      <option value="">Select relationship</option>
      <option value="parent">Parent</option>
      <option value="spouse">Spouse</option>
      <option value="child">Child</option>
      <option value="sibling">Sibling</option>
      <option value="guardian">Guardian</option>
      <option value="other">Other</option>
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

          <div>

            <label>
              Sex
            </label>

            <select
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

        </div>

        <h3>
          Clinical Information
        </h3>

        <label>
          Chief Complaint
        </label>

        <textarea
          name="chief_complaint"
          value={form.chief_complaint}
          onChange={handleChange}
          placeholder="Main presenting complaint"
        />

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
          Physical Findings
        </label>

        <textarea
          name="physical_findings"
          value={form.physical_findings}
          onChange={handleChange}
          placeholder="Relevant examination findings"
        />

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

        <textarea
          name="treatment_given"
          value={form.treatment_given}
          onChange={handleChange}
          placeholder="Treatment already provided"
        />

        <h3>
          Referral Information
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

          <option value="routine">
            Routine
          </option>

          <option value="urgent">
            Urgent
          </option>

          <option value="emergency">
            Emergency
          </option>

        </select>

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
            : "Create Referral"}
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

          completed_at,
          referring_facility_id,
          receiving_facility_id,
          referring_facility:facilities!referrals_referring_facility_id_fkey (id, name, lga, state),
          receiving_facility:facilities!referrals_receiving_facility_id_fkey (id, name, lga, state)
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
              // Re-fetch through the authorized query; never log realtime payloads.
              void payload;
              loadMyReferrals();
            }
          )
          .subscribe((status) => {
            console.log(
              "PHC REALTIME STATUS:",
              status
            );
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

  /* =========================================================
     FILTERED REFERRALS
     ========================================================= */

  const filteredReferrals =
    activeFilter === "all"
      ? referrals
      : referrals.filter(
          (referral) =>
            referral.status ===
            activeFilter
        );

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
                className="back-button" data-leave-clinical-workspace
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
              {activeFilter ===
              "all"
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
                        {referral.final_diagnosis || formatDiagnosisSummary(
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
                onClick={printReferralForm}
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
                  {formatClinicalLabel(selectedReferral.diagnosis_status)}
                </strong>
              </div>
            </div>

            <ReferralTimeline referral={selectedReferral} />

            <hr />

            <ReferralSourceDetails referral={selectedReferral} />

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

            {["discharged", "completed"].includes(selectedReferral.status) && <PhcFollowUp key={selectedReferral.id} referralId={selectedReferral.id} />}
            {/* BACK */}

            <button
              type="button"
              className="back-button" data-leave-clinical-workspace
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
  const [referralView, setReferralView] = useState("active");

  const [referrals, setReferrals] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

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

  const hasUnsavedReceivingForm = Boolean(
    (selectedReferral && hasClinicalFormChanges(assessmentForm, assessmentFormFor(selectedReferral))) ||
    (selectedInpatientReferral && hasClinicalFormChanges(admissionForm, inpatientFormFor(selectedInpatientReferral))) ||
    ((selectedReferral || selectedInpatientReferral) && actionLoading)
  );
  useEffect(() => registerClinicalDraft(window, () => hasUnsavedReceivingForm), [hasUnsavedReceivingForm]);

  const clinicalSaveInFlight = useRef(false);
  const [uncertainClinicalReferrals, setUncertainClinicalReferrals] = useState(() => new Set());
  const investigationMutationInFlight = useRef(false);
  const handleInvestigationFileUpload = async (index, file) => {
    if (!atomicInvestigationUpdatesEnabled || investigationMutationInFlight.current) return;
    if (!selectedReferral || !file) return;
    setError("");
    setMessage("");
    const current = getInvestigationRecords(selectedReferral).map(normalizeInvestigationRecord);
    if (!current[index]) {
      setError("Investigation record no longer exists. Refresh before uploading.");
      return;
    }
    investigationMutationInFlight.current = true;
    let path;
    setActionLoading(`${selectedReferral.id}-investigation-file-${index}`);
    let uploadAttempted = false;
    try {
      try {
        await validateInvestigationFileContent(file);
      } catch {
        setError("Investigation document was not uploaded. Check that it is non-empty, no larger than 10 MB, and has a supported format matching its contents.");
        return;
      }
      path = createInvestigationFilePath(selectedReferral.id, file);
      // A lost storage response can hide a successful upload.
      uploadAttempted = true;
      const { error: uploadError } = await supabase.storage
        .from("referral-investigation-results")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const data = await saveInvestigation(
        supabase, selectedReferral.id, selectedReferral.investigation_records, index,
        { result_file_path: path, result_file_name: file.name, result_file_type: file.type, result_file_size: file.size },
        crypto.randomUUID()
      );
      const updatedReferral = { ...selectedReferral, investigation_records: data.investigation_records };
      setSelectedReferral(updatedReferral);
      setReferrals((previous) => previous.map((item) =>
        item.id === selectedReferral.id ? updatedReferral : item
      ));
      setMessage("Investigation result document saved successfully.");
    } catch (err) {
      if (err?.message === "STALE_INVESTIGATION_ATTACHMENT") {
        console.warn("Investigation attachment update blocked due to stale record.");
      } else {
        console.error("INVESTIGATION FILE UPLOAD ERROR:", err?.message || "Upload failed");
      }
      if (uploadAttempted) {
        const recovery = await inspectInvestigationAttachment(
          () => supabase.from("referrals").select("investigation_records")
            .eq("id", selectedReferral.id).single(),
          path
        );
        if (recovery === "referenced") {
          setError("Attachment appears saved in the referral, but confirmation failed. Refresh and verify it before retrying.");
        } else if (recovery === "unreferenced") {
          setError("The uploaded attachment is not currently referenced by the referral. No file was deleted. Ask an administrator to reconcile the upload before retrying.");
        } else {
          setError("Attachment outcome could not be verified. Do not retry until an administrator reconciles the referral and file.");
        }
      } else {
        setError("Investigation document upload failed. No successful upload was confirmed.");
      }
    } finally {
      investigationMutationInFlight.current = false;
      setActionLoading(null);
    }
  };

  const handleInvestigationResultChange = async (index, patch, expectedSnapshot) => {
    if (!selectedReferral || !atomicInvestigationUpdatesEnabled || investigationMutationInFlight.current) return false;
    investigationMutationInFlight.current = true;
    setError("");
    setMessage("");
    setActionLoading(`${selectedReferral.id}-investigation-${index}`);
    try {
      const data = await saveInvestigation(supabase, selectedReferral.id,
        expectedSnapshot, index, patch, crypto.randomUUID());
      const savedReferral = { ...selectedReferral, investigation_records: data.investigation_records };
      setSelectedReferral(savedReferral);
      setReferrals((previous) => previous.map((item) =>
        item.id === selectedReferral.id ? savedReferral : item));
      setMessage("Investigation result saved successfully.");
      return true;
    } catch (error) {
      setError(error.message === "STALE_INVESTIGATION_RECORD"
        ? "Another update changed this referral. Your draft is retained. Refresh and compare before saving again."
        : "The save outcome could not be confirmed. Your draft is retained. Refresh and verify the referral before retrying.");
      return false;
    } finally {
      investigationMutationInFlight.current = false;
      setActionLoading(null);
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

        // UI guard complements (but does not replace) database RLS.
        if (profile.role !== "receiving_staff") {
          throw new Error("Receiving-clinician access is required.");
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

            receiving_facility:facilities!referrals_receiving_facility_id_fkey (id, name, lga, state),
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
    if (!confirmClinicalNavigation(window)) return;
    setSelectedInpatientReferral(null);
    setSelectedReferral(referral);
    setAssessmentForm(assessmentFormFor(referral));
  };

  /* =======================================================
     OPEN INPATIENT MANAGEMENT
     ======================================================= */

  const openInpatientManagement = (referral) => {
    if (!confirmClinicalNavigation(window)) return;
    setSelectedReferral(null);
    setSelectedInpatientReferral(referral);
    setAdmissionForm(inpatientFormFor(referral));
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

      if (clinicalSaveInFlight.current || uncertainClinicalReferrals.has(selectedInpatientReferral.id)) return;
      clinicalSaveInFlight.current = true;
      setError("");
      setMessage("");

      setActionLoading(
        selectedInpatientReferral.id
      );

      try {
        // Compare the form's original clinical record with the latest database
        // state before saving. A database transaction is still needed for
        // fully atomic concurrent-edit protection.
        const { data: latestInpatient, error: inpatientReadError } = await supabase
          .from("referrals")
          .select("admission_at, ward_unit, admission_diagnosis, clinical_progress, inpatient_treatment, discharge_diagnosis, condition_at_discharge, discharge_medications, follow_up_plan, discharged_at, status")
          .eq("id", selectedInpatientReferral.id)
          .single();
        if (inpatientReadError) throw inpatientReadError;
        if (latestInpatient.status !== "admitted" ||
            ["admission_at", "ward_unit", "admission_diagnosis", "clinical_progress", "inpatient_treatment", "discharge_diagnosis", "condition_at_discharge", "discharge_medications", "follow_up_plan", "discharged_at"].some(
              (field) => (latestInpatient[field] ?? null) !== (selectedInpatientReferral[field] ?? null)
            )) {
          throw new Error("INPATIENT_RECORD_CHANGED");
        }

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

        const { data, recovered } = await commitClinicalUpdate(
          supabase, selectedInpatientReferral.id, "admitted", {

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
          }, { atomic: import.meta.env.VITE_ATOMIC_CLINICAL_SAVES_ENABLED === "true",
            kind: "admission", expectedSnapshot: selectedInpatientReferral, operationId: crypto.randomUUID() }
        );

        setMessage(
          `Admission information for ${data.referral_number} saved successfully.`
        );
        if (recovered) setMessage("Matching clinical documentation is present in the referral after confirmation was interrupted. Review the saved record before any further update.");


        setSelectedInpatientReferral(
          null
        );

        await loadIncomingReferrals();

      } catch (err) {
        if (err?.message === "CLINICAL_SAVE_UNCONFIRMED") {
          setUncertainClinicalReferrals((previous) => new Set(previous).add(selectedInpatientReferral.id));
          setError("The clinical save outcome could not be confirmed. Your form is retained. Saving is paused for this referral in this workspace. Review its current record and ask an administrator to reconcile the outcome before retrying.");
        } else {
          setError(["INPATIENT_RECORD_CHANGED", "CLINICAL_RECORD_CONFLICT"].includes(err?.message)
            ? "The clinical record has changed. Your form is retained. Refresh and compare the latest documentation before saving."
            : (err.message || "Clinical documentation could not be saved."));
        }

      } finally {
        clinicalSaveInFlight.current = false;

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

      if (clinicalSaveInFlight.current || uncertainClinicalReferrals.has(selectedInpatientReferral.id)) return;
      clinicalSaveInFlight.current = true;
      setError("");
      setMessage("");

      setActionLoading(
        selectedInpatientReferral.id
      );

      try {
        // Compare the form's original clinical record with the latest database
        // state before saving. A database transaction is still needed for
        // fully atomic concurrent-edit protection.
        const { data: latestInpatient, error: inpatientReadError } = await supabase
          .from("referrals")
          .select("admission_at, ward_unit, admission_diagnosis, clinical_progress, inpatient_treatment, discharge_diagnosis, condition_at_discharge, discharge_medications, follow_up_plan, discharged_at, status")
          .eq("id", selectedInpatientReferral.id)
          .single();
        if (inpatientReadError) throw inpatientReadError;
        if (latestInpatient.status !== "admitted" ||
            ["admission_at", "ward_unit", "admission_diagnosis", "clinical_progress", "inpatient_treatment", "discharge_diagnosis", "condition_at_discharge", "discharge_medications", "follow_up_plan", "discharged_at"].some(
              (field) => (latestInpatient[field] ?? null) !== (selectedInpatientReferral[field] ?? null)
            )) {
          throw new Error("INPATIENT_RECORD_CHANGED");
        }

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

        const { data, recovered } = await commitClinicalUpdate(
          supabase, selectedInpatientReferral.id, "admitted", {

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
          }, { atomic: import.meta.env.VITE_ATOMIC_CLINICAL_SAVES_ENABLED === "true",
            kind: "discharge", expectedSnapshot: selectedInpatientReferral, operationId: crypto.randomUUID() }
        );

        setMessage(
          `Referral ${data.referral_number} discharged successfully.`
        );
        if (recovered) setMessage("Matching clinical documentation is present in the referral after confirmation was interrupted. Review the saved record before any further update.");


        setSelectedInpatientReferral(
          null
        );

        await loadIncomingReferrals();

      } catch (err) {
        if (err?.message === "CLINICAL_SAVE_UNCONFIRMED") {
          setUncertainClinicalReferrals((previous) => new Set(previous).add(selectedInpatientReferral.id));
          setError("The clinical save outcome could not be confirmed. Your form is retained. Saving is paused for this referral in this workspace. Review its current record and ask an administrator to reconcile the outcome before retrying.");
        } else {
          setError(["INPATIENT_RECORD_CHANGED", "CLINICAL_RECORD_CONFLICT"].includes(err?.message)
            ? "The clinical record has changed. Your form is retained. Refresh and compare the latest documentation before saving."
            : (err.message || "Clinical documentation could not be saved."));
        }

      } finally {
        clinicalSaveInFlight.current = false;

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
          .eq("status", "sent")
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMessage(
          `Referral ${data.referral_number} acknowledged successfully.`
        );

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
          .eq("status", "acknowledged")
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
      .eq("status", "patient_arrived")
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

      if (clinicalSaveInFlight.current || uncertainClinicalReferrals.has(selectedReferral.id)) return;
      clinicalSaveInFlight.current = true;
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

        // Do not overwrite clinical documentation from a stale assessment form.
        // This is a preflight check, not an atomic concurrency guarantee.
        const { data: currentAssessment, error: assessmentReadError } = await supabase
          .from("referrals")
          .select("status, assessment_findings, final_diagnosis, diagnosis_category, diagnosis_status, treatment_provided, procedures_performed, clinical_feedback, disposition, assessment_completed_at")
          .eq("id", selectedReferral.id)
          .single();
        if (assessmentReadError) throw assessmentReadError;
        if (currentAssessment.status !== "under_assessment" ||
            ["assessment_findings", "final_diagnosis", "diagnosis_category", "diagnosis_status", "treatment_provided", "procedures_performed", "clinical_feedback", "disposition", "assessment_completed_at"].some(
              (field) => (currentAssessment[field] ?? null) !== (selectedReferral[field] ?? null)
            )) {
          throw new Error("ASSESSMENT_CHANGED");
        }

        const { data, recovered } = await commitClinicalUpdate(
          supabase, selectedReferral.id, "under_assessment", updateData,
          { atomic: import.meta.env.VITE_ATOMIC_CLINICAL_SAVES_ENABLED === "true",
            kind: "assessment", expectedSnapshot: selectedReferral, operationId: crypto.randomUUID() }
        );

        setMessage(
          `Clinical assessment for ${data.referral_number} saved successfully.`
        );
        if (recovered) setMessage("Matching clinical documentation is present in the referral after confirmation was interrupted. Review the saved record before any further update.");


        /*
         * If admitted, immediately open
         * inpatient management.
         */
        if (
          assessmentForm.disposition ===
          "admitted" && data.status === "admitted"
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
        if (err?.message === "CLINICAL_SAVE_UNCONFIRMED") {
          setUncertainClinicalReferrals((previous) => new Set(previous).add(selectedReferral.id));
          setError("The clinical save outcome could not be confirmed. Your form is retained. Saving is paused for this referral in this workspace. Review its current record and ask an administrator to reconcile the outcome before retrying.");
        } else {
          setError(["ASSESSMENT_CHANGED", "CLINICAL_RECORD_CONFLICT"].includes(err?.message)
            ? "The clinical record has changed. Your form is retained. Refresh and compare the latest documentation before saving."
            : (err.message || "Clinical documentation could not be saved."));
        }

      } finally {
        clinicalSaveInFlight.current = false;

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

  const filteredReferrals = filterReceivingReferrals(referrals, referralView);

  /* =======================================================
     USER INTERFACE
     ======================================================= */

  return (
    <>
      {(uncertainClinicalReferrals.has(selectedReferral?.id) || uncertainClinicalReferrals.has(selectedInpatientReferral?.id)) && <p role="alert" className="login-error">
        Saving is paused for this referral because a previous save could not be confirmed. Your form remains available. Review the current referral and arrange reconciliation before retrying.
      </p>}

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
          <span>
            Discharged / Completed
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
              Referrals
            </h3>

            <p>
              Referrals assigned to your receiving facility.
            </p>

          </div>

        </div>

        <label className="referral-view-filter">Show referrals
          <select value={referralView} onChange={(event) => setReferralView(event.target.value)}>
            <option value="active">Active referrals</option>
            <option value="closed">Discharged / completed</option>
            <option value="all">All referrals</option>
          </select>
        </label>

        {loading && (
          <p>
            Loading incoming referrals...
          </p>
        )}

        {!loading &&
          filteredReferrals.length === 0 &&
          !error && (
            <p>
              No referrals in this view.
            </p>
          )}

        {!loading &&
          referrals.length > 0 && (

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
                          onClick={() => openReferralDetails(referral)}
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
                  selectedInpatientReferral.id || uncertainClinicalReferrals.has(selectedInpatientReferral.id)
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
                  selectedInpatientReferral.id || uncertainClinicalReferrals.has(selectedInpatientReferral.id)
                }
              >
                {actionLoading ===
                selectedInpatientReferral.id
                  ? "Processing..."
                  : "Discharge Patient"}
              </button>

              <button
                type="button"
                className="back-button" data-leave-clinical-workspace
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
                onClick={printReferralForm}
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

            {!atomicInvestigationUpdatesEnabled && <p role="status">
              Investigation results are currently read-only. Preserve original documents and follow the facility procedure for updates.
            </p>}
            <ReferralSourceDetails
              referral={selectedReferral}
              editableInvestigationResults={atomicInvestigationUpdatesEnabled && !["completed", "discharged", "cancelled"].includes(selectedReferral.status)}
              onInvestigationFileUpload={handleInvestigationFileUpload}
              onInvestigationResultChange={
                handleInvestigationResultChange
              }
            />

            <ReferralTimeline referral={selectedReferral} />

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
                      selectedReferral.id || uncertainClinicalReferrals.has(selectedReferral.id)
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
                  {["discharged", "completed"].includes(selectedReferral.status)
                    ? "This record is available for review and printing."
                    : "The clinical assessment form is available when the referral is Under Assessment."}
                </p>
              </div>
            )}

            {["discharged", "completed"].includes(selectedReferral.status) && (
              <section aria-label="Saved receiving facility record">
                <h3>Receiving Facility Record</h3>
                {[
                  ["Assessment Findings", "assessment_findings"], ["Final Diagnosis", "final_diagnosis"],
                  ["Clinical Feedback", "clinical_feedback"], ["Disposition at Assessment", "disposition"],
                  ["Ward / Unit", "ward_unit"], ["Admission Diagnosis", "admission_diagnosis"],
                  ["Clinical Progress", "clinical_progress"], ["Inpatient Treatment", "inpatient_treatment"],
                  ["Discharge Diagnosis", "discharge_diagnosis"], ["Condition at Discharge", "condition_at_discharge"],
                  ["Discharge Medications", "discharge_medications"], ["Follow-up Plan", "follow_up_plan"],
                ].map(([label, field]) => <div className="detail-row" key={field}><strong>{label}</strong><p>{selectedReferral[field] || "Not recorded"}</p></div>)}
              </section>
            )}

            <button
              type="button"
              className="back-button" data-leave-clinical-workspace
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

