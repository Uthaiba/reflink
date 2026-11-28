import {useEffect, useRef, useState} from "react";
import {supabase} from "../lib/supabase.js";

export default function ClinicalAddenda({referralId}) {
  const [entries, setEntries] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(null);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    supabase.rpc("closed_record_addenda", {p_referral: referralId}).then(({data, error}) => {
      if (!active) return;
      if (error || !Array.isArray(data)) setMessage("Addenda could not be loaded.");
      else { setEntries(data); setMessage(""); }
    });
    return () => { active = false; };
  }, [referralId, attempt]);

  async function save(payload, form) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const {data, error} = await supabase.rpc("closed_record_addenda", {p_referral: referralId, ...payload});
      if (error || !Array.isArray(data)) throw Error();
      setEntries(data);
      if (form) { form.reset(); pending.current = null; }
      setMessage(form ? "Request submitted for review." : "Review recorded.");
    } catch {
      setMessage("Save could not be confirmed. Check the addenda before retrying.");
    } finally { lock.current = false; setBusy(false); }
  }

  function request(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const reason = fields.get("reason").trim();
    const amendment = fields.get("amendment").trim();
    if (!reason || !amendment) { setMessage("Enter a reason and proposed addendum."); return; }
    const signature = JSON.stringify([reason, amendment]);
    if (pending.current?.signature !== signature) pending.current = {signature, id: crypto.randomUUID()};
    void save({p_action:"request", p_request:pending.current.id, p_reason:reason, p_amendment:amendment}, form);
  }

  return <section aria-label="Clinical addenda"><h4>Clinical addenda</h4>
    <p role="status">{message}</p>
    {entries && <><ul>{entries.map(entry => <li key={entry.id}>
      <strong>{entry.status === "approved" ? "Approved addendum" : entry.status === "pending" ? "Pending review" : "Declined request"}</strong>
      <p>{entry.amendment}</p><p>Reason: {entry.reason}</p>
      <small>Requested {new Date(entry.requested_at).toLocaleString()}{entry.reviewed_at && " · Reviewed " + new Date(entry.reviewed_at).toLocaleString()}</small>
      {entry.can_review && <div>{["approved","declined"].map(action => <button type="button" disabled={busy} key={action}
        onClick={() => save({p_action:action, p_request:entry.id})}>{action === "approved" ? "Approve addendum" : "Decline request"}</button>)}</div>}
    </li>)}</ul>
    <details><summary>Request an addendum to your facility’s entry</summary>
      <form onSubmit={request}><fieldset disabled={busy}>
        <label>Reason for correction<textarea name="reason" required maxLength={1000}/></label>
        <label>Proposed addendum (identify the original entry)<textarea name="amendment" required maxLength={4000}/></label>
        <button type="submit">Request clinical review</button>
      </fieldset></form></details></>}
    {message && <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>Refresh addenda</button>}
  </section>;
}
