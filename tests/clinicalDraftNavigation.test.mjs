import test from "node:test";
import assert from "node:assert/strict";
import { registerClinicalDraft, confirmClinicalNavigation } from "../src/lib/clinicalDraftNavigation.js";

function fixture(answer=false) {
  const listeners=new Map(), clicks=new Map();
  let prompts=0;
  const target={
    confirm:()=>{prompts++;return answer;},
    addEventListener:(name,fn)=>listeners.set(name,fn),
    removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);},
    document:{
      addEventListener:(name,fn,capture)=>{assert.equal(capture,true);clicks.set(name,fn);},
      removeEventListener:(name,fn,capture)=>{assert.equal(capture,true);if(clicks.get(name)===fn)clicks.delete(name);},
    },
  };
  return {target,listeners,clicks,prompts:()=>prompts};
}

test("clean clinical work does not trigger navigation prompts",()=>{
  const f=fixture();const release=registerClinicalDraft(f.target,()=>false);
  assert.equal(confirmClinicalNavigation(f.target),true);
  assert.equal(f.prompts(),0);release();
});

test("cancelled navigation retains every registered category with only one prompt",()=>{
  const f=fixture();const a=registerClinicalDraft(f.target,()=>true);const b=registerClinicalDraft(f.target,()=>true);
  assert.equal(f.clicks.size,1);
  assert.equal(confirmClinicalNavigation(f.target),false);
  assert.equal(f.prompts(),1);a();
  assert.equal(confirmClinicalNavigation(f.target),false);
  b();assert.equal(confirmClinicalNavigation(f.target),true);
  assert.equal(f.listeners.size,0);assert.equal(f.clicks.size,0);
});

test("browser unload warns only while unsaved work or an active save remains",()=>{
  const f=fixture();let dirty=true;const release=registerClinicalDraft(f.target,()=>dirty);
  let prevented=0;const event={preventDefault:()=>prevented++,returnValue:undefined};
  f.listeners.get("beforeunload")(event);
  assert.equal(prevented,1);assert.equal(event.returnValue,"");
  dirty=false;f.listeners.get("beforeunload")(event);
  assert.equal(prevented,1);release();
});

test("cancelled leaving clicks are stopped before React navigation handles them",()=>{
  const f=fixture();const release=registerClinicalDraft(f.target,()=>true);
  let prevented=false,stopped=false;
  f.clicks.get("click")({
    target:{closest:(selector)=>{assert.equal(selector,"[data-leave-clinical-workspace]");return {};}},
    preventDefault:()=>prevented=true,stopImmediatePropagation:()=>stopped=true,
  });
  assert.equal(prevented,true);assert.equal(stopped,true);release();
});

test("save and discard controls are not intercepted",()=>{
  const f=fixture();const release=registerClinicalDraft(f.target,()=>true);
  f.clicks.get("click")({target:{closest:()=>null},preventDefault:()=>assert.fail(),stopImmediatePropagation:()=>assert.fail()});
  assert.equal(f.prompts(),0);release();
});

test("confirmed navigation proceeds without discarding state inside the guard",()=>{
  const f=fixture(true);let dirty=true;const release=registerClinicalDraft(f.target,()=>dirty);
  assert.equal(confirmClinicalNavigation(f.target),true);
  assert.equal(dirty,true);release();
});

test("draft registries are isolated between browser windows",()=>{
  const a=fixture(),b=fixture();const release=registerClinicalDraft(a.target,()=>true);
  assert.equal(confirmClinicalNavigation(b.target),true);
  assert.equal(b.prompts(),0);release();
});

test("a repeated stale cleanup cannot unregister a newer draft",()=>{
  const f=fixture();const first=registerClinicalDraft(f.target,()=>true);first();
  const second=registerClinicalDraft(f.target,()=>true);first();
  assert.equal(confirmClinicalNavigation(f.target),false);second();
});
