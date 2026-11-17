import test from "node:test";
import assert from "node:assert/strict";
import { commitClinicalUpdate } from "../src/lib/clinicalSaveRecovery.js";

const id="synthetic-referral";
const patch={status:"discharged",discharge_diagnosis:"Synthetic diagnosis",discharged_at:"2026-11-17T10:30:00.000Z",discharge_medications:null};
const row={id,referral_number:"SYNTHETIC",...patch};
function fixture(write,read){
  const calls={writes:0,reads:0,filters:[]};
  return {calls,client:{from:(table)=>{
    assert.equal(table,"referrals");let writing=false;
    const query={update:(value)=>{calls.writes++;writing=true;assert.deepEqual(value,patch);return query;},
      eq:(field,value)=>{calls.filters.push([field,value]);return query;},select:()=>query,
      single:async()=>{if(!writing)calls.reads++;const result=writing?write:read;
        if(result instanceof Error)throw result;return result;}};
    return query;
  }}};
}

test("confirmed clinical write needs no recovery request",async()=>{
  const f=fixture({data:row,error:null});
  assert.equal((await commitClinicalUpdate(f.client,id,"admitted",patch)).recovered,false);
  assert.equal(f.calls.writes,1);assert.equal(f.calls.reads,0);
  assert.ok(f.calls.filters.some(([field,value])=>field==="status"&&value==="admitted"));
});

test("lost write response can be verified without a second mutation",async()=>{
  const f=fixture(new Error("Synthetic timeout"),{data:row,error:null});
  const saved=await commitClinicalUpdate(f.client,id,"admitted",patch);
  assert.equal(saved.recovered,true);assert.deepEqual(saved.data,row);
  assert.equal(f.calls.writes,1);assert.equal(f.calls.reads,1);
});

test("equivalent timestamp representations confirm the same saved instant",async()=>{
  const f=fixture({data:null,error:{}},{data:{...row,discharged_at:"2026-11-17T10:30:00+00:00"},error:null});
  assert.equal((await commitClinicalUpdate(f.client,id,"admitted",patch)).recovered,true);
});

test("recovery read failure stays explicitly uncertain",async()=>{
  for(const read of [{data:null,error:{}},new Error("Synthetic offline")]){
    const f=fixture({data:null,error:{}},read);
    await assert.rejects(commitClinicalUpdate(f.client,id,"admitted",patch),/CLINICAL_SAVE_UNCONFIRMED/);
    assert.equal(f.calls.writes,1);
  }
});

test("a different diagnosis or status is never confirmed as this save",async()=>{
  for(const changed of [{...row,status:"admitted"},{...row,discharge_diagnosis:"Different synthetic value"}]){
    const f=fixture({data:null,error:{}},{data:changed,error:null});
    await assert.rejects(commitClinicalUpdate(f.client,id,"admitted",patch),/UNCONFIRMED/);
  }
});

test("another referral cannot confirm the save",async()=>{
  const f=fixture({data:{...row,id:"other"},error:null},{data:{...row,id:"other"},error:null});
  await assert.rejects(commitClinicalUpdate(f.client,id,"admitted",patch),/UNCONFIRMED/);
});

test("missing nullable fields cannot masquerade as confirmed null values",async()=>{
  const incomplete={...row};delete incomplete.discharge_medications;
  const f=fixture({data:incomplete,error:null},{data:incomplete,error:null});
  await assert.rejects(commitClinicalUpdate(f.client,id,"admitted",patch),/UNCONFIRMED/);
});

test("a missing referral number or invalid timestamp cannot confirm the save",async()=>{
  for(const incomplete of [{...row,referral_number:undefined},{...row,discharged_at:"invalid"}]){
    const f=fixture({data:incomplete,error:null},{data:incomplete,error:null});
    await assert.rejects(commitClinicalUpdate(f.client,id,"admitted",patch),/UNCONFIRMED/);
  }
});
