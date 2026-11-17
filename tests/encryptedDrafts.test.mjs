import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, webcrypto } from "node:crypto";
import { encryptDraft, decryptDraft, restoreDraftData, readStoredEnvelope, draftStorageKey } from "../src/lib/encryptedDrafts.js";
import { createReferralOnce } from "../src/lib/referralSubmission.js";

const owner=randomUUID(), id=randomUUID(), phrase=randomUUID();
const now=Date.UTC(2026,0,1);
const clinical={ form:{patient_identifier:"Synthetic-only"}, clientSubmissionId:id,
  diagnosisEntries:[],investigations:[],categories:[] };

test("real WebCrypto round-trip stores no plaintext clinical content",async()=>{
  const encrypted=await encryptDraft(owner,id,clinical,phrase,now,webcrypto);
  assert.ok(!JSON.stringify(encrypted).includes("Synthetic-only"));
  assert.deepEqual(await decryptDraft(encrypted,owner,phrase,now+1,webcrypto),clinical);
});

test("wrong passphrase or account cannot unlock a device draft",async()=>{
  const encrypted=await encryptDraft(owner,id,clinical,phrase,now,webcrypto);
  await assert.rejects(decryptDraft(encrypted,randomUUID(),phrase,now+1,webcrypto));
  await assert.rejects(decryptDraft(encrypted,owner,randomUUID(),now+1,webcrypto));
});

test("tampered ciphertext, expiry or owner metadata fails authenticated decryption",async()=>{
  const encrypted=await encryptDraft(owner,id,clinical,phrase,now,webcrypto);
  for(const changed of [
    {...encrypted,expiresAt:encrypted.expiresAt-1},
    {...encrypted,ciphertext:(encrypted.ciphertext[0]==="A"?"B":"A")+encrypted.ciphertext.slice(1)},
    {...encrypted,draftId:randomUUID()},
  ])await assert.rejects(decryptDraft(changed,owner,phrase,now+1,webcrypto));
});

test("expired drafts cannot be decrypted and are removed on attempted storage access",async()=>{
  const encrypted=await encryptDraft(owner,id,clinical,phrase,now,webcrypto);
  const data=new Map([[draftStorageKey(owner),JSON.stringify(encrypted)]]);
  const storage={getItem:(key)=>data.get(key),removeItem:(key)=>data.delete(key)};
  await assert.rejects(decryptDraft(encrypted,owner,phrase,encrypted.expiresAt,webcrypto));
  assert.throws(()=>readStoredEnvelope(storage,owner,encrypted.expiresAt));
  assert.equal(data.size,0);
});

test("short phrases and excessive drafts are rejected before storage",async()=>{
  await assert.rejects(encryptDraft(owner,id,clinical,"",now,webcrypto));
  await assert.rejects(encryptDraft(owner,id,{text:"x".repeat(129*1024)},phrase,now,webcrypto));
});

test("restoration allowlists form fields and drops file/privilege metadata",()=>{
  const draft={...clinical,form:{...clinical.form,role:"administrator"},
    investigations:[{category:"Synthetic",investigation:"Synthetic",result_file_path:"hidden",result_file:{}}]};
  const restored=restoreDraftData(draft,{patient_identifier:""});
  assert.equal(restored.form.role,undefined);
  assert.equal(restored.investigations[0].result_file,undefined);
  assert.equal(restored.investigations[0].result_file_path,undefined);
  assert.throws(()=>restoreDraftData({...draft,clientSubmissionId:"invalid"},{patient_identifier:""}));
});

function clientFixture({existing=null,lost=false,preflightError=false}={}){
  let inserts=0,reads=0,saved=existing;
  const client={from:(table)=>{
    assert.equal(table,"referrals");let writing=false;
    const query={
      select:()=>query,eq:()=>query,
      insert:(body)=>{inserts++;writing=true;assert.equal(body.offline_client_id,id);return query;},
      maybeSingle:async()=>{reads++;return {data:saved,error:preflightError?{}:null};},
      single:async()=>{
        assert.ok(writing);saved={id:"synthetic-referral",referral_number:"SYNTHETIC"};
        if(lost)throw new Error("Synthetic response loss");
        return {data:saved,error:null};
      },
    };return query;
  }};
  return {client,stats:()=>({inserts,reads})};
}

test("confirmed submission returns its ID and writes the stable client key once",async()=>{
  const fixture=clientFixture();
  assert.equal((await createReferralOnce(fixture.client,{referring_user_id:owner},id)).id,"synthetic-referral");
  assert.equal(fixture.stats().inserts,1);
});

test("existing submission is detected before any new insert",async()=>{
  const fixture=clientFixture({existing:{id:"synthetic-referral",referral_number:"SYNTHETIC"}});
  await assert.rejects(createReferralOnce(fixture.client,{referring_user_id:owner},id),
    (error)=>error.code==="REFERRAL_ALREADY_SAVED");
  assert.equal(fixture.stats().inserts,0);
});

test("a lost insert response is reconciled without creating a second referral",async()=>{
  const fixture=clientFixture({lost:true});
  await assert.rejects(createReferralOnce(fixture.client,{referring_user_id:owner},id),
    (error)=>error.code==="REFERRAL_ALREADY_SAVED");
  assert.equal(fixture.stats().inserts,1);
  assert.equal(fixture.stats().reads,2);
});

test("uncertain preflight and invalid submission keys cause no writes",async()=>{
  const fixture=clientFixture({preflightError:true});
  await assert.rejects(createReferralOnce(fixture.client,{referring_user_id:owner},id));
  await assert.rejects(createReferralOnce(fixture.client,{referring_user_id:owner},"invalid"));
  assert.equal(fixture.stats().inserts,0);
});
