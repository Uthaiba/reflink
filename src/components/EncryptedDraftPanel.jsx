import { useState } from "react";
import { decryptDraft, encryptDraft, draftStorageKey, readStoredEnvelope } from "../lib/encryptedDrafts.js";

export default function EncryptedDraftPanel({ ownerId, draftId, getDraft, restoreDraft, disabled }) {
  const [passphrase,setPassphrase]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const perform=async(action)=>{
    if(busy||disabled||!ownerId)return;
    setBusy(true);setError("");setMessage("");
    try{
      if(action==="save"){
        const encrypted=await encryptDraft(ownerId,draftId,getDraft(),passphrase);
        localStorage.setItem(draftStorageKey(ownerId),JSON.stringify(encrypted));
        setMessage("Encrypted draft saved on this device for up to 24 hours. It has not been submitted. Files are excluded.");
      }else if(action==="restore"){
        const encrypted=readStoredEnvelope(localStorage,ownerId);
        const data=await decryptDraft(encrypted,ownerId,passphrase);
        if(window.confirm("Replace the current unsaved form with this saved draft?")){
          restoreDraft(data);
          setMessage("Draft restored. Review all clinical details and submit manually when connected.");
        }
      }else{
        localStorage.removeItem(draftStorageKey(ownerId));
        setMessage("Encrypted draft removed from this browser.");
      }
    }catch{
      setError("Draft action could not be completed. Check the passphrase, account, expiry and available browser storage. Your current form has not been cleared.");
    }finally{setBusy(false);setPassphrase("");}
  };
  return <section className="dashboard-card" aria-labelledby="encrypted-draft-heading">
    <h3 id="encrypted-draft-heading">Encrypted device draft</h3>
    <p>Optional, for a private device. One draft per account; saving replaces its previous device draft. A separate passphrase is required to restore it. Files are excluded, and the draft expires after 24 hours. Remove it after a confirmed submission.</p>
    <p>A device draft is not a referral submission. Use your facility's approved offline procedure when connectivity is unavailable.</p>
    <label htmlFor="draft-passphrase">Separate draft passphrase (at least 12 characters)</label>
    <input id="draft-passphrase" type="password" autoComplete="off" value={passphrase}
      disabled={busy||disabled} onChange={(event)=>setPassphrase(event.target.value)} />
    <div className="dashboard-actions">
      <button type="button" className="secondary-button" disabled={busy||disabled||passphrase.length<12} onClick={()=>perform("save")}>Save encrypted draft</button>
      <button type="button" className="secondary-button" disabled={busy||disabled||passphrase.length<12} onClick={()=>perform("restore")}>Restore draft</button>
      <button type="button" className="secondary-button" disabled={busy||disabled} onClick={()=>perform("delete")}>Delete device draft</button>
    </div>
    {message&&<p role="status">{message}</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
