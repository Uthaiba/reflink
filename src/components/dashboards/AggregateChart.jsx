import { useId, useState } from "react";
import { aggregateSeries, humanLabel } from "../../lib/aggregatePresentation.js";

export default function AggregateChart({ dataset }) {
  const id = useId();
  const metrics = dataset.columns.filter((key) => key.endsWith("_count"));
  const [selected, setSelected] = useState(metrics[0]);
  if (!metrics.length || !dataset.rows.length) return null;
  const items = aggregateSeries(dataset, selected);
  const max = Math.max(1, ...items.map((item) => item.value ?? 0));
  return <section className="aggregate-chart" aria-labelledby={id + "-title"}>
    <h4 id={id + "-title"}>{dataset.title} visualization</h4>
    <label htmlFor={id}>Count indicator</label>
    <select id={id} value={selected} onChange={(event) => setSelected(event.target.value)}>
      {metrics.map((metric) => <option key={metric} value={metric}>{humanLabel(metric)}</option>)}
    </select>
    <p>Bar lengths compare visible counts only. Withheld values have no bar. The complete values remain in the table below.</p>
    <ul className="aggregate-bars" aria-label={humanLabel(selected)}>
      {items.map((item) => <li key={item.row}>
        <span>{item.label}</span>
        <span className="aggregate-bar-track" aria-hidden="true">
          {item.value != null && <span style={{ width: `${100 * item.value / max}%` }} />}
        </span>
        <strong>{item.value == null ? "Withheld / unavailable" : item.value}</strong>
      </li>)}
    </ul>
  </section>;
}
