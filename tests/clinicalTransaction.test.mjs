import test from "node:test";
import assert from "node:assert/strict";
import { commitClinicalUpdate } from "../src/lib/clinicalSaveRecovery.js";
const snapshot = {id:"synthetic",status:"admitted",admission_at:null,ward_unit:null,admission_diagnosis:null,clinical_progress:null,inpatient_treatment:null,discharge_diagnosis:null,condition_at_discharge:null,discharge_medications:null,follow_up_plan:null,discharged_at:null,patient_identifier:"excluded"};
const patch = {discharge_diagnosis:"Synthetic diagnosis",condition_at_discharge:"Synthetic condition",discharge_medications:null,follow_up_plan:"Synthetic plan",status:"discharged",discharged_at:"client timestamp"};
const row = {...snapshot,...patch,referral_number:"SYNTHETIC",discharged_at:"2026-11-17T10:00:00Z"};
const options = {atomic:true,kind:"discharge",expectedSnapshot:snapshot,operationId:"synthetic-operation"};
function fixture(response) {
 const requests=[];
 return {requests,client:{from(){throw Error("Direct table request forbidden");},async rpc(name,body){requests.push({name,body});if(response instanceof Error)throw response;return response;}}};
}
test("atomic save sends projected snapshot and patch exclusively in RPC body",async()=>{
 const f=fixture({data:{status:"saved",revision:"1",referral:row}});
 const result=await commitClinicalUpdate(f.client,snapshot.id,"admitted",patch,options);
 assert.equal(result.recovered,false);assert.equal(result.data.status,"discharged");
 assert.equal(f.requests.length,1);const {name,body}=f.requests[0];
 assert.equal(name,"save_referral_clinical");assert.equal(body.p_operation_id,options.operationId);
 assert.equal(body.p_expected.status,"admitted");
 for(const key of ["status","discharged_at","patient_identifier"])assert.equal(Object.hasOwn(body.p_patch,key),false);
 assert.equal(Object.hasOwn(body.p_expected,"patient_identifier"),false);
 assert.equal(Object.hasOwn(result.data,"patient_identifier"),false);
});
test("atomic replay returns current authorized snapshot for review",async()=>{
 const f=fixture({data:{status:"replayed",revision:"1",referral:row}});
 assert.equal((await commitClinicalUpdate(f.client,snapshot.id,"admitted",patch,options)).recovered,true);
});
test("atomic conflict remains a draft conflict without fallback writes or reads",async()=>{
 const f=fixture({data:{status:"conflict"}});
 await assert.rejects(commitClinicalUpdate(f.client,snapshot.id,"admitted",patch,options),/CLINICAL_RECORD_CONFLICT/);
 assert.equal(f.requests.length,1);
});
test("lost or rejected atomic response remains uncertain without fallback",async()=>{
 for(const response of [new Error("Synthetic offline"),{error:{message:"private details"}},null,{data:null}]) {
  const f=fixture(response);
  await assert.rejects(commitClinicalUpdate(f.client,snapshot.id,"admitted",patch,options),/CLINICAL_SAVE_UNCONFIRMED/);
  assert.equal(f.requests.length,1);
 }
});
test("incomplete or wrong atomic success cannot clear a draft",async()=>{
 const missing={...row};delete missing.follow_up_plan;
 for(const referral of [missing,{...row,id:"other"},{...row,referral_number:null}]) {
  const f=fixture({data:{status:"saved",revision:"1",referral}});
  await assert.rejects(commitClinicalUpdate(f.client,snapshot.id,"admitted",patch,options),/CLINICAL_SAVE_UNCONFIRMED/);
 }
});
test("unknown kind or mismatched editor cannot issue an atomic mutation",async()=>{
 for(const changed of [{...options,kind:"constructor"},{...options,expectedSnapshot:{...snapshot,id:"other"}},{...options,operationId:null}]) {
  const f=fixture({});
  await assert.rejects(commitClinicalUpdate(f.client,snapshot.id,"admitted",patch,changed),/CLINICAL_RECORD_CONFLICT/);
  assert.equal(f.requests.length,0);
 }
});
test("assessment strips client lifecycle timestamps and includes nullable clinical fields",async()=>{
 const assessment={...snapshot,status:"under_assessment",assessment_findings:null,final_diagnosis:null,diagnosis_category:null,diagnosis_status:null,treatment_provided:null,procedures_performed:null,clinical_feedback:null,disposition:null,assessment_completed_at:null};
 const f=fixture({data:{status:"saved",revision:"2",referral:{...assessment,referral_number:"SYNTHETIC"}}});
 await commitClinicalUpdate(f.client,snapshot.id,"under_assessment",{...patch,disposition:"observation",assessment_completed_at:"client"}, {...options,kind:"assessment",expectedSnapshot:assessment});
 const sent=f.requests[0].body.p_patch;
 assert.equal(Object.keys(sent).length,8);assert.equal(sent.clinical_feedback,null);
 assert.equal(Object.hasOwn(sent,"assessment_completed_at"),false);
 assert.equal(Object.hasOwn(sent,"admission_at"),false);
});
test("admission preserves the explicit admission time but excludes client status",async()=>{
 const f=fixture({data:{status:"saved",revision:"3",referral:{...row,status:"admitted"}}});
 await commitClinicalUpdate(f.client,snapshot.id,"admitted",{...patch,admission_at:"2026-11-17T10:00:00Z",ward_unit:"Synthetic ward"}, {...options,kind:"admission"});
 assert.equal(f.requests[0].body.p_patch.admission_at,"2026-11-17T10:00:00Z");
 assert.equal(Object.keys(f.requests[0].body.p_patch).length,5);
});
