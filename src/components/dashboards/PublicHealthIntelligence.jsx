import AggregateChart from "./AggregateChart.jsx";
import { createAggregateDraft } from "../../lib/aggregatePresentation.js";
import "../../aggregate-reporting.css";
import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { loadPublicHealthReport } from "../../lib/publicHealthReports.js";
import { escapeCsvCell } from "../../lib/reportingUtils.js";

const label = (key) => key.replaceAll("_", " ");
const display = (value) => value == null ? "Suppressed / unavailable" : String(value);

export default function PublicHealthIntelligence() {
  const [month, setMonth] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const load = async (event) => {
    event.preventDefault();
    const id = ++requestId.current;
    setLoading(true); setError(""); setReport(null);
    try {
      const result = await loadPublicHealthReport(supabase, month);
      if (requestId.current === id) setReport(result);
    } catch (failure) {
      if (requestId.current === id) setError(failure.message);
    } finally { if (requestId.current === id) setLoading(false); }
  };

  const exportAggregate = (dataset) => {
    const rows = [
      ["REFLINK institutional aggregate report", dataset.title],
      ["Period", report.period.start, report.period.end],
      ["Limitations", "Referral activity only; not population incidence or prevalence. Suppressed values must not be reconstructed."],
      dataset.columns.map(label),
      ...dataset.rows.map((row) => dataset.columns.map((column) => display(row[column]))),
    ];
    const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "reflink-aggregate-" + dataset.key + "-" + report.period.start + ".csv";
    anchor.click(); URL.revokeObjectURL(url);
  };

  const downloadDraft = () => {
    const url = URL.createObjectURL(new Blob([createAggregateDraft(report)], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "reflink-monthly-draft-" + report.period.start + ".txt";
    anchor.click(); URL.revokeObjectURL(url);
  };

  return <section className="dashboard-card" aria-labelledby="rphi-title">
    <span className="eyebrow">R-PHI</span>
    <h2 id="rphi-title">REFLINK Public Health Intelligence</h2>
    <p>Institutional aggregate reports for authorized planning. These reports describe recorded referral activity, not population incidence, prevalence or confirmed outbreaks.</p>
    <p>Coverage depends on participating facilities, recording completeness and referral selection. Missing values and suppressed counts are not zero. External sharing requires disclosure review.</p>
    <form onSubmit={load}>
      <label htmlFor="rphi-month">Reporting month (Africa/Lagos)</label>
      <input id="rphi-month" type="month" required value={month} disabled={loading}
        onChange={(event) => { setMonth(event.target.value); setReport(null); }} />
      <button type="submit" className="primary-button" disabled={loading}>{loading ? "Loading aggregates..." : "Generate report"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {!report && !error && !loading && <p>Select a calendar month to retrieve the approved aggregate reports.</p>}
    {report && <>
      <p role="status">Period: {report.period.start} to {report.period.end}. Generated: {report.generatedAt}. Current or future months may be incomplete.</p>
      <section className="aggregate-draft" aria-labelledby="monthly-draft-title">
        <h3 id="monthly-draft-title">Monthly report draft</h3>
        <p>Every numeric statement identifies its source RPC, row and field. This deterministic draft requires human review; it does not infer causes, diagnose or confirm outbreaks.</p>
        <button type="button" className="secondary-button" onClick={downloadDraft}>Download draft for review</button>
        <details><summary>Read the traceable draft</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{createAggregateDraft(report)}</pre></details>
      </section>
      {report.datasets.map((dataset) => <section key={dataset.key}>
        <h3>{dataset.title}</h3>
        <button type="button" className="secondary-button" onClick={() => exportAggregate(dataset)}>Download aggregate CSV</button>
        <AggregateChart dataset={dataset} />
        {!dataset.rows.length ? <p>No aggregate rows are available for this period.</p> :
          <div className="table-wrapper"><table>
            <caption>{dataset.title}; {report.period.start} to {report.period.end}</caption>
            <thead><tr>{dataset.columns.map((column) => <th scope="col" key={column}>{label(column)}</th>)}</tr></thead>
            <tbody>{dataset.rows.map((row, index) => <tr key={index}>{dataset.columns.map((column) => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody>
          </table></div>}
      </section>)}
      <section><h3>Indicator methodology</h3>
        <p>Counts use the server's month boundaries in Africa/Lagos and exclude synthetic referrals. Facility reporting coverage describes system participation, not service availability or catchment population. Positive counts below five, complementary cells and unverified suppression metadata are withheld. Multiple reports can introduce disclosure risks; do not combine outputs to recover suppressed values.</p>
        <p>Changes in volume may reflect recording or participation changes. They require human investigation and do not establish disease outbreaks.</p>
      </section>
    </>}
  </section>;
}
