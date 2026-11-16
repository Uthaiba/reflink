import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { summarizeReferrals } from "../../lib/referralAnalytics.js";

/* =======================================================
   REFLINK ANALYTICS DASHBOARD
   ======================================================= */

function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState({
    loading: true,
    error: "",
    total: 0,
    classified: 0,
    unclassified: 0,
    completed: 0,
    categories: [],
    diagnoses: [],
  });

  const loadAnalytics = async () => {
    setAnalytics((previous) => ({
      ...previous,
      loading: true,
      error: "",
    }));

    try {
      // Supabase/PostgREST can cap each response. Fetch all accessible rows
      // rather than silently treating the first page as the entire population.
      // A bounded limit makes incomplete statistics explicit until a
      // server-side aggregate reporting endpoint is available.
      const pageSize = 500;
      const maxRows = 10000;
      const referrals = [];

      for (let offset = 0; offset <= maxRows; offset += pageSize) {
        const { data, error } = await supabase
          .from("referrals")
          .select("id, is_test, diagnosis_category, final_diagnosis, status")
          .eq("is_test", false)
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        const page = data || [];
        if (offset + page.length > maxRows) {
          throw new Error("Reporting limit exceeded. Use an approved server-side aggregate report.");
        }
        referrals.push(...page);
        if (page.length < pageSize) break;
      }

      const { total, classified, unclassified, completed, categories, diagnoses } = summarizeReferrals(referrals);

      setAnalytics({
        loading: false,
        error: "",
        total,
        classified,
        unclassified,
        completed,
        categories,
        diagnoses,
      });
    } catch (err) {
      console.error("REFLINK ANALYTICS ERROR:", err);

      setAnalytics((previous) => ({
        ...previous,
        loading: false,
        error:
          err?.message ||
          "Unable to load referral analytics.",
      }));
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const coveragePercentage =
    analytics.total > 0
      ? Number(
          (
            (analytics.classified / analytics.total) *
            100
          ).toFixed(1)
        )
      : 0;

  return (
    <>
      <div className="dashboard-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => loadAnalytics()}
          disabled={analytics.loading}
        >
          {analytics.loading
            ? "Refreshing..."
            : "↻ Refresh Analytics"}
        </button>
      </div>

      {analytics.error && (
        <div className="error-message">
          {analytics.error}
        </div>
      )}

      <div className="dashboard-card">
        <span className="eyebrow">
          REFLINK ANALYTICS
        </span>

        <h3>
          Referral Intelligence
        </h3>

        <p>
          Statistical summary of genuine production referrals.
          Records explicitly marked as test data are excluded.
        </p>

        <div className="stats-grid">
          <div className="stat-card">
            <span>Accessible Referrals</span>
            <strong>{analytics.total}</strong>
          </div>

          <div className="stat-card">
            <span>Structured Categories</span>
            <strong>{analytics.classified}</strong>
            <small>{coveragePercentage}% of referrals</small>
          </div>

          <div className="stat-card">
            <span>Unclassified</span>
            <strong>{analytics.unclassified}</strong>
            <small>
              {analytics.total > 0
                ? `${(
                    (analytics.unclassified /
                      analytics.total) *
                    100
                  ).toFixed(1)}% of referrals`
                : "0% of referrals"}
            </small>
          </div>

          <div className="stat-card">
            <span>Completed / Discharged</span>
            <strong>{analytics.completed}</strong>
            <small>
              {analytics.total > 0
                ? `${(
                    (analytics.completed /
                      analytics.total) *
                    100
                  ).toFixed(1)}% of referrals`
                : "0% of referrals"}
            </small>
          </div>
        </div>
      </div>

      <div className="dashboard-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <span className="eyebrow">
              CLINICAL REFERRAL PATTERN
            </span>
            <h3>Referral Categories</h3>
            <p>
              Distribution of referrals by structured clinical
              category.
            </p>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: "999px",
              background: "#f5f7fa",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {analytics.classified} of {analytics.total} classified
          </div>
        </div>

        {analytics.loading ? (
          <p>Loading category analytics...</p>
        ) : analytics.categories.length === 0 ? (
          <p>No accessible non-test referral data available.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "16px",
              marginTop: "24px",
            }}
          >
            {analytics.categories.map((item) => (
              <div key={item.name}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    marginBottom: "7px",
                  }}
                >
                  <strong>{item.name}</strong>
                  <span>
                    {item.count} referral
                    {item.count === 1 ? "" : "s"} •{" "}
                    {item.percentage}%
                  </span>
                </div>

                <div
                  style={{
                    width: "100%",
                    height: "9px",
                    borderRadius: "999px",
                    background: "#e9edf2",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${item.percentage}%`,
                      height: "100%",
                      borderRadius: "999px",
                      background: "currentColor",
                      opacity: 0.85,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-card">
        <span className="eyebrow">
          DATA QUALITY
        </span>

        <h3>
          Structured Diagnosis Coverage
        </h3>

        <p>
          REFLINK separates clinical statistics from incomplete
          classification so that the dashboard does not present
          missing diagnosis categories as clinical conditions.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              padding: "18px",
              border: "1px solid #e5e7eb",
              borderRadius: "14px",
            }}
          >
            <span>Structured</span>
            <h3 style={{ margin: "6px 0" }}>
              {analytics.classified} / {analytics.total}
            </h3>
            <small>
              {coveragePercentage}% have a diagnosis category
            </small>
          </div>

          <div
            style={{
              padding: "18px",
              border: "1px solid #e5e7eb",
              borderRadius: "14px",
            }}
          >
            <span>Unclassified</span>
            <h3 style={{ margin: "6px 0" }}>
              {analytics.unclassified} / {analytics.total}
            </h3>
            <small>
              These records should not be interpreted as a clinical
              category.
            </small>
          </div>
        </div>
      </div>

      <div className="dashboard-card">
        <span className="eyebrow">
          DOCUMENTED CONDITIONS
        </span>

        <h3>
          Most Frequently Documented Final Diagnoses
        </h3>

        <p>
          Based on receiving-facility final diagnoses attached to
          structured diagnosis categories. Test records are excluded.
        </p>

        {analytics.loading ? (
          <p>Loading diagnosis statistics...</p>
        ) : analytics.diagnoses.length === 0 ? (
          <div className="empty-selection-state">
            No structured final diagnoses are available yet.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              marginTop: "18px",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                    }}
                  >
                    Rank
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                    }}
                  >
                    Final Diagnosis
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                    }}
                  >
                    Referrals
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                    }}
                  >
                    Share
                  </th>
                </tr>
              </thead>

              <tbody>
                {analytics.diagnoses.map(
                  (item, index) => (
                    <tr key={item.condition}>
                      <td style={{ padding: "12px" }}>
                        <strong>#{index + 1}</strong>
                      </td>

                      <td style={{ padding: "12px" }}>
                        {item.condition}
                      </td>

                      <td style={{ padding: "12px" }}>
                        {item.count}
                      </td>

                      <td style={{ padding: "12px" }}>
                        {item.percentage}%
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            marginTop: "18px",
            padding: "14px 16px",
            borderRadius: "12px",
            background: "#f8fafc",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        >
          <strong>Interpretation:</strong>{" "}
          diagnosis-level statistics depend on healthcare workers
          entering standardized final diagnoses. REFLINK does not
          silently remove unusual labels; explicit test records are
          excluded using the database{" "}
          <code>is_test</code> field.
        </div>
      </div>
    </>
  );
}
export default AnalyticsDashboard;