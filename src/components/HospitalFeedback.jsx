import {useEffect, useRef, useState} from "react";
import {supabase} from "../lib/supabase.js";

export default function HospitalFeedback({referral, onComplete}) {
  const [record,setRecord]=useState(null);
  const [ready,setReady]=useState(false);
  const [message,setMessage]=useState("");
  const [outcome,setOutcome]=useState("");
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{
    let active=true;
    supabase.from("counter_referrals").select("final_diagnosis,outcome,treatment_provided,follow_up_instructions,referred_further_to,created_at")
      .eq("referral_id",referral.id).maybeSingle().then(({data,error})=>{
        if(!active) return;
        if(error) setMessage("Final feedback could not be loaded. Reopen the referral to retry.");
        else {setRecord(data);setReady(true);}
      });
    return ()=>{active=false;};
  },[referral.id,referral.status]);
  async function submit(event){
    event.preventDefault();
    if(lock.current) return;
    lock.current=true;setBusy(true);
    const f=new FormData(event.currentTarget);
    try {
      const {data,error}=await supabase.rpc("submit_counter_referral",{
        p_referral_id:referral.id,p_final_diagnosis:f.get("diagnosis").trim(),p_outcome:outcome,
        p_treatment_provided:f.get("treatment"),p_follow_up_instructions:f.get("plan"),
        p_referred_further_to:f.get("destination"),p_additional_notes:null
      });
      if(error || data?.[0]?.referral_status!=="completed") throw Error();
      setMessage("Final hospital feedback sent.");onComplete(data[0].completed_at);
    } catch {setMessage("Submission could not be confirmed. Reopen the referral to check the saved feedback before retrying.");}
    finally {lock.current=false;setBusy(false);}
  }
  return <section aria-label="Final hospital feedback"><h3>Final hospital feedback</h3>
    <p role="status">{message}</p>
    {record ? <dl>{Object.entries({Diagnosis:record.final_diagnosis,Outcome:record.outcome?.replaceAll("_"," "),Treatment:record.treatment_provided,"Follow-up instructions":record.follow_up_instructions,Destination:record.referred_further_to,Sent:new Date(record.created_at).toLocaleString()}).filter(([,v])=>v).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> :
      ready && (onComplete && referral.status==="discharged" ? <form onSubmit={submit}><fieldset disabled={busy}>
        <legend>Send the final outcome to the referring PHC</legend>
        <label>Final diagnosis<textarea name="diagnosis" defaultValue={referral.discharge_diagnosis || referral.final_diagnosis} required maxLength={4000}/></label>
        <label>Outcome<select required value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="">Select outcome</option>
          {["recovered","improved","referred_further","died","other"].map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
        {outcome==="referred_further" && <label>Referred to<input required name="destination" maxLength={500}/></label>}
        <label>Treatment provided<textarea name="treatment" maxLength={6000}/></label>
        <label>Follow-up instructions<textarea name="plan" defaultValue={referral.follow_up_plan} maxLength={4000}/></label>
        <button type="submit">Send final feedback and complete hospital handoff</button>
      </fieldset></form> : <p>No final hospital feedback recorded.</p>)}
  </section>;
}
