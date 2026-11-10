import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";

function monthBounds(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const start = `${match[1]}-${match[2]}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function displayCount(value, suppressed) {
  if (suppressed || value === null || value === undefined) return "Suppressed";
  return Number(value).toLocaleString();
}

function displayMinutes(value, suppressed) {
  if (suppressed || value === null || value === undefined) return "Not reportable";
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return "Not available";
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  return `${(minutes / 60).toFixed(1)} hr`;
}

function ReportTable({ title, description, loading, error, rows, columns, emptyText }) {
  return (
    <section className="dashboard-card">
      <div className="form-header">
        <div>
          <span className="eyebrow">ADMINISTRATOR AGGREGATE</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      {loading ? (
        <p role="status">Loading report…</p>
      ) : error ? (
        <div className="error-message" role="alert">{error}</div>
      ) : !rows.length ? (
        <p className="empty-selection-state">{emptyText}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} style={{ textAlign: "left", padding: "12px", whiteSpace: "nowrap" }}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {columns.map((column) => (
                    <td key={column.key} style={{ padding: "12px", borderTop: "1px solid #e8eeeb" }}>
                      {column.render ? column.render(row) : (row[column.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminPublicHealthReporting() {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [reports, setReports] = useState({
    volume: [], facilities: [], lgas: [], coverage: [], pathways: [], delays: [],
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);

  const loadReports = useCallback(async () => {
    const bounds = monthBounds(month);
    if (!bounds) {
      setLoading(false);
      setErrors({ period: "Select a valid reporting month." });
      return;
    }

    const currentRequest = ++requestVersion.current;
    setLoading(true);
    setErrors({});
    const datedArgs = {
      p_start_date: bounds.start,
      p_end_date: bounds.end,
    };

    const requests = [
      ["volume", supabase.rpc("get_admin_referral_volume", datedArgs)],
      ["facilities", supabase.rpc("get_admin_facility_referral_summary", datedArgs)],
      ["lgas", supabase.rpc("get_admin_lga_referral_summary", datedArgs)],
      ["coverage", supabase.rpc("get_admin_facility_reporting_coverage", datedArgs)],
      ["pathways", supabase.rpc("get_admin_referral_pathway_summary", datedArgs)],
      ["delays", supabase.rpc("get_admin_acknowledgement_delay_alerts")],
    ];

    const results = await Promise.all(
      requests.map(async ([key, request]) => {
        try {
          const result = await request;
          return [key, result?.data, result?.error?.message || ""];
        } catch {
          return [key, null, "This report could not be loaded. Verify administrator access and the staging database migration."];
        }
      })
    );

    if (currentRequest !== requestVersion.current) return;

    const nextReports = {};
    const nextErrors = {};
    for (const [key, data, error] of results) {
      nextReports[key] = key === "volume"
        ? (Array.isArray(data) ? data.slice(0, 1) : data ? [data] : [])
        : (Array.isArray(data) ? data : []);
      if (error) nextErrors[key] = error;
    }
    setReports(nextReports);
    setErrors(nextErrors);
    setLoading(false);
  }, [month]);

  useEffect(() => {
    loadReports();
    return () => {
      requestVersion.current += 1;
    };
  }, [loadReports]);

  const volume = reports.volume[0] || null;
  const volumeSuppressed = Boolean(volume?.small_cell_suppressed);

  return (
    <div className="admin-public-health-reporting">
      <div className="dashboard-actions" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: "6px", fontWeight: 600 }}>
          Reporting month
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            aria-label="Reporting month"
          />
        </label>
        <button type="button" className="secondary-button" onClick={loadReports} disabled={loading}>
          {loading ? "Refreshing…" : "↻ Refresh reports"}
        </button>
      </div>

      {errors.period && <div className="error-message" role="alert">{errors.period}</div>}

      <section className="dashboard-card">
        <span className="eyebrow">PRIVACY-PRESERVING PUBLIC HEALTH REPORTING</span>
        <h3>Referral network overview</h3>
        <p>
          Administrator-only aggregate reporting for {month}. The reports exclude patient-level records,
          use complete Africa/Lagos calendar months and suppress small groups to reduce disclosure risk.
        </p>
        <div className="stats-grid">
          <div className="stat-card">
            <span>Referrals initiated</span>
            <strong>{volume ? displayCount(volume.referral_count, volumeSuppressed) : "—"}</strong>
          </div>
          <div className="stat-card">
            <span>Acknowledged</span>
            <strong>{volume ? displayCount(volume.acknowledged_count, volume.acknowledged_count_suppressed) : "—"}</strong>
          </div>
          <div className="stat-card">
            <span>Arrival confirmed</span>
            <strong>{volume ? displayCount(volume.arrival_confirmed_count, volume.arrival_count_suppressed) : "—"}</strong>
          </div>
          <div className="stat-card">
            <span>Assessment completed</span>
            <strong>{volume ? displayCount(volume.assessment_completed_count, volume.assessment_count_suppressed) : "—"}</strong>
          </div>
          <div className="stat-card">
            <span>Referral completed</span>
            <strong>{volume ? displayCount(volume.referral_completed_count, volume.completion_count_suppressed) : "—"}</strong>
          </div>
          <div className="stat-card">
            <span>Chronology anomalies</span>
            <strong>{volume ? displayCount(volume.chronology_anomaly_count, volume.chronology_anomaly_suppressed) : "—"}</strong>
          </div>
        </div>
        {errors.volume && <div className="error-message" role="alert">{errors.volume}</div>}
      </section>

      <ReportTable
        title="Facility referral distribution"
        description="Sending and receiving facility activity. Facility identifiers are not returned; small and complementary groups are suppressed."
        loading={loading}
        error={errors.facilities}
        rows={reports.facilities}
        emptyText="No reportable facility activity for this month."
        columns={[
          { key: "referral_direction", label: "Direction" },
          { key: "facility_label", label: "Facility group" },
          { key: "facility_type", label: "Facility type" },
          { key: "lga", label: "LGA" },
          { key: "state", label: "State" },
          { key: "referral_count", label: "Referrals", render: (row) => displayCount(row.referral_count, row.small_cell_suppressed || row.complementary_suppressed) },
        ]}
      />

      <ReportTable
        title="LGA referral activity"
        description="Sending and receiving activity grouped by LGA. Referral volume is not a measure of population need, incidence or care quality."
        loading={loading}
        error={errors.lgas}
        rows={reports.lgas}
        emptyText="No reportable LGA activity for this month."
        columns={[
          { key: "referral_direction", label: "Direction" },
          { key: "lga_label", label: "LGA" },
          { key: "state", label: "State" },
          { key: "referral_count", label: "Referrals", render: (row) => displayCount(row.referral_count, row.small_cell_suppressed || row.complementary_suppressed) },
        ]}
      />

      <ReportTable
        title="Facility registry and reporting coverage"
        description="Current registry status, recorded referral participation and geography completeness. No recorded activity does not prove a facility failed to report."
        loading={loading}
        error={errors.coverage}
        rows={reports.coverage}
        emptyText="No facility coverage groups are available."
        columns={[
          { key: "coverage_group", label: "Coverage group" },
          { key: "facility_count", label: "Facilities", render: (row) => displayCount(row.facility_count, row.small_cell_suppressed || row.complementary_suppressed) },
        ]}
      />

      <ReportTable
        title="Referral pathways and workflow intervals"
        description="Aggregated facility-type pathways and recorded acknowledgement/arrival intervals. Interval statistics require at least five valid timestamps."
        loading={loading}
        error={errors.pathways}
        rows={reports.pathways}
        emptyText="No reportable referral pathways for this month."
        columns={[
          { key: "sending_facility_type", label: "Sending type" },
          { key: "receiving_facility_type", label: "Receiving type" },
          { key: "referral_count", label: "Referrals", render: (row) => displayCount(row.referral_count, row.small_cell_suppressed || row.complementary_suppressed) },
          { key: "median_acknowledgement_minutes", label: "Median acknowledgement", render: (row) => displayMinutes(row.median_acknowledgement_minutes, row.acknowledgement_interval_suppressed) },
          { key: "p90_acknowledgement_minutes", label: "P90 acknowledgement", render: (row) => displayMinutes(row.p90_acknowledgement_minutes, row.acknowledgement_interval_suppressed) },
          { key: "median_arrival_minutes", label: "Median arrival", render: (row) => displayMinutes(row.median_arrival_minutes, row.arrival_interval_suppressed) },
          { key: "p90_arrival_minutes", label: "P90 arrival", render: (row) => displayMinutes(row.p90_arrival_minutes, row.arrival_interval_suppressed) },
        ]}
      />

      <ReportTable
        title="Acknowledgement delay alerts"
        description="Live aggregate snapshot of referrals awaiting acknowledgement beyond their stored target and acknowledgements recorded after target. This does not replace clinical escalation."
        loading={loading}
        error={errors.delays}
        rows={reports.delays}
        emptyText="No reportable acknowledgement delay categories."
        columns={[
          { key: "alert_label", label: "Alert category" },
          { key: "alert_count", label: "Count", render: (row) => displayCount(row.alert_count, row.small_cell_suppressed || row.complementary_suppressed) },
        ]}
      />

      <p className="admin-method-note">
        These are operational observations, not validated clinical targets or causal performance rankings.
        Suppressed values must not be reverse-engineered by comparing overlapping cohorts. Access is restricted
        by the database administrator checks; no patient-level administrator access is introduced.
      </p>
    </div>
  );
}
