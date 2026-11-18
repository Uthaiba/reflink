import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function PhcFollowUp({ referralId, dischargedAt }) {
  const [history, setHistory] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const operation = useRef(null);
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    supabase.rpc("phc_follow_up_history", { p_referral: referralId }).then(({data,error}) => {
      if (!active) return;
      if (error) setMessage("Follow-up history is unavailable.");
      else setHistory(data);
    });
    return () => { active = false; };
  }, [referralId]);

  async function save(event) {
    event.preventDefault();
    if (saving.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const encounter = new Date(fields.get("time"));
    if (!Number.isFinite(encounter.getTime()) || encounter > new Date() ||
        (dischargedAt && encounter < new Date(dischargedAt))) {
      setMessage("Choose an encounter time after discharge and no later than now. Check the year.");
      form.elements.namedItem("time").focus();
      return;
    }
    const payload = { p_referral: referralId, p_kind: fields.get("kind"),
      p_encounter: encounter.toISOString(), p_outcome: fields.get("outcome"),
      p_next: fields.get("next") };
    const signature = JSON.stringify(payload);
    if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() };
    saving.current = true;
    setBusy(true);
    try {
      const {data,error} = await supabase.rpc("phc_follow_up_history", {...payload,p_operation:operation.current.id});
      if (error) throw error;
      setHistory(data); form.reset(); operation.current = null;
      setMessage("Follow-up entry saved.");
    } catch { setMessage("Save could not be confirmed. Retry the same entry."); }
    finally { saving.current = false; setBusy(false); }
  }

  return <section><h3>PHC follow-up</h3><p role="status">{message}</p>
    {history && <><p>{history.some(row => row.kind === "performed") ? "Follow-up performed" : "No completed encounter recorded"}</p>
      <ul>{history.map((row,index) => <li key={index}>{new Date(row.encounter_at).toLocaleString()} · {row.kind === "performed" ? "Encounter performed" : "Contact attempted"} · {row.outcome}{row.next_action && <p>Next action: {row.next_action}</p>}</li>)}</ul>
      <form onSubmit={save}><fieldset disabled={busy}><legend>Record PHC contact</legend>
        <label>Contact result<select name="kind" defaultValue="" required><option value="" disabled>Select result</option><option value="attempted">Contact attempted</option><option value="performed">Encounter performed</option></select></label>
        <label>Encounter or attempt time<input type="datetime-local" name="time" required /></label>
        <label>Outcome<textarea name="outcome" required maxLength={2000} /></label>
        <label>Next action (optional)<textarea name="next" maxLength={2000} /></label>
        <button type="submit">Save follow-up entry</button>
      </fieldset></form></>}
  </section>;
}
