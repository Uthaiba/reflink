import { useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import "./CounterReferralForm.css";

const outcomeLabels = {
  recovered: "Recovered",
  improved: "Improved",
  referred_further: "Referred for further care",
  died: "Died",
  other: "Other",
};

export default function CounterReferralForm({ referral, onCompleted }) {
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
  const [fieldErrors, setFieldErrors] = useState({});
  const fieldRefs = useRef({});

  const requiredFields = [
    { key: "final_diagnosis", label: "Final diagnosis" },
    { key: "outcome", label: "Patient outcome" },
    ...(form.outcome === "referred_further"
      ? [{ key: "referred_further_to", label: "Further referral destination" }]
      : []),
  ];
  const completedFields = requiredFields.filter(({ key }) =>
    String(form[key] || "").trim().length > 0
  ).length;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!referral?.id) {
      setError("The referral record could not be identified.");
      return;
    }

    const nextErrors = {};
    if (!form.final_diagnosis.trim()) {
      nextErrors.final_diagnosis = "Final diagnosis is required.";
    }
    if (!form.outcome) {
      nextErrors.outcome = "Select the patient's outcome.";
    }
    if (form.outcome === "referred_further" && !form.referred_further_to.trim()) {
      nextErrors.referred_further_to = "Specify the further referral destination.";
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      fieldRefs.current[Object.keys(nextErrors)[0]]?.focus();
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("submit_counter_referral", {
        p_referral_id: referral.id,
        p_final_diagnosis: form.final_diagnosis.trim(),
        p_treatment_provided: form.treatment_provided.trim() || null,
        p_outcome: form.outcome,
        p_follow_up_instructions: form.follow_up_instructions.trim() || null,
        p_referred_further_to: form.outcome === "referred_further"
          ? form.referred_further_to.trim()
          : null,
        p_additional_notes: form.additional_notes.trim() || null,
      });
      if (rpcError) throw rpcError;

      const completion = Array.isArray(data) ? data[0] : data;
      if (!completion?.counter_referral_id || completion.referral_status !== "completed") {
        throw new Error("REFLINK could not confirm completion. Refresh the referral before retrying.");
      }

      const counterReferral = {
        id: completion.counter_referral_id,
        referral_id: referral.id,
        final_diagnosis: form.final_diagnosis.trim(),
        treatment_provided: form.treatment_provided.trim() || null,
        outcome: form.outcome,
        follow_up_instructions: form.follow_up_instructions.trim() || null,
        referred_further_to: form.outcome === "referred_further" ? form.referred_further_to.trim() : null,
        additional_notes: form.additional_notes.trim() || null,
      };

      setMessage("Counter-referral submitted. The referral episode is now completed.");
      onCompleted?.({
        ...referral,
        status: completion.referral_status,
        completed_at: completion.completed_at,
        counter_referral: counterReferral,
      });
    } catch (submitError) {
      setError(submitError?.message || "Unable to submit the counter-referral. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="dashboard-card counter-referral-card" aria-labelledby="counter-referral-heading">
      <span className="eyebrow">CLOSED-LOOP REFERRAL</span>
      <h3 id="counter-referral-heading">Counter-referral feedback</h3>
      <p>
        Record the receiving facility's final outcome and follow-up information for referral{" "}
        <strong>{referral?.referral_number || "record"}</strong>. Submission completes the referral
        and makes the clinical feedback available to the referring facility.
      </p>

      <div className="counter-referral-completion" aria-live="polite">
        <strong>{completedFields} of {requiredFields.length} required items completed</strong>
        <ul>
          {requiredFields.map(({ key, label }) => (
            <li key={key} className={String(form[key] || "").trim() ? "is-complete" : ""}>
              <span aria-hidden="true">{String(form[key] || "").trim() ? "✓" : "○"}</span> {label}
            </li>
          ))}
        </ul>
      </div>

      <p className="counter-referral-finality-note" role="note">
        Verify the diagnosis, outcome and follow-up instructions before submitting. This action
        completes the referral episode and cannot be used to reopen it.
      </p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="form-success" role="status">{message}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="counter-final-diagnosis">Final diagnosis *</label>
        <textarea
          ref={(element) => { fieldRefs.current.final_diagnosis = element; }}
          id="counter-final-diagnosis"
          name="final_diagnosis"
          value={form.final_diagnosis}
          onChange={handleChange}
          rows={3}
          maxLength={4000}
          required
          aria-invalid={Boolean(fieldErrors.final_diagnosis)}
        />
        {fieldErrors.final_diagnosis && <p className="form-error">{fieldErrors.final_diagnosis}</p>}

        <label htmlFor="counter-treatment">Treatment provided</label>
        <textarea id="counter-treatment" name="treatment_provided" value={form.treatment_provided} onChange={handleChange} rows={3} maxLength={6000} />

        <label htmlFor="counter-outcome">Patient outcome *</label>
        <select
          ref={(element) => { fieldRefs.current.outcome = element; }}
          id="counter-outcome"
          name="outcome"
          value={form.outcome}
          onChange={handleChange}
          required
          aria-invalid={Boolean(fieldErrors.outcome)}
        >
          <option value="">Select outcome</option>
          {Object.entries(outcomeLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {fieldErrors.outcome && <p className="form-error">{fieldErrors.outcome}</p>}

        {form.outcome === "referred_further" && (
          <>
            <label htmlFor="counter-referred-to">Further referral destination *</label>
            <input
              ref={(element) => { fieldRefs.current.referred_further_to = element; }}
              id="counter-referred-to"
              name="referred_further_to"
              value={form.referred_further_to}
              onChange={handleChange}
              maxLength={500}
              required
              aria-invalid={Boolean(fieldErrors.referred_further_to)}
            />
            {fieldErrors.referred_further_to && <p className="form-error">{fieldErrors.referred_further_to}</p>}
          </>
        )}

        <label htmlFor="counter-follow-up">Follow-up instructions for referring facility</label>
        <textarea id="counter-follow-up" name="follow_up_instructions" value={form.follow_up_instructions} onChange={handleChange} rows={3} maxLength={4000} />

        <label htmlFor="counter-additional-notes">Additional clinical notes</label>
        <textarea id="counter-additional-notes" name="additional_notes" value={form.additional_notes} onChange={handleChange} rows={3} maxLength={4000} />

        <button type="submit" className="primary-button full-width" disabled={saving}>
          {saving ? "Submitting counter-referral…" : "Submit counter-referral & complete referral"}
        </button>
      </form>
    </section>
  );
}
