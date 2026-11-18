import test from "node:test";
import assert from "node:assert/strict";
import { ageBand, escapeCsvCell, loadBoundedPages, monthlyPeriod } from "../src/lib/reportingUtils.js";
import { projectAggregateRows, loadPublicHealthReport, REPORT_DATASETS } from "../src/lib/publicHealthReports.js";

test("missing ages are not classified as infants", () => {
  for (const value of [null, undefined, "", false, true, -1, "invalid"]) assert.equal(ageBand(value), "Age not recorded");
  assert.equal(ageBand(0), "0–4 years");
  assert.equal(ageBand(60), "5–14 years");
  assert.equal(ageBand(780), "65+ years");
});

test("CSV labels cannot activate spreadsheet formula prefixes", () => {
  for (const value of ["=1+1", " +1", "-1", "@A1", "\ttext", "\rtext", "\uFEFF=1"]) {
    assert.ok(escapeCsvCell(value).startsWith('"\''), value);
  }
  assert.equal(escapeCsvCell('a"b'), '"a""b"');
});

test("monthly boundaries handle leap years without local timezone conversion", () => {
  assert.deepEqual(monthlyPeriod("2024-02"), { start:"2024-02-01",end:"2024-02-29" });
  assert.equal(monthlyPeriod("2025-02").end, "2025-02-28");
  for (const month of ["2025-13", "2025-1", "", "2025-01;select", "1900-01"]) assert.throws(() => monthlyPeriod(month));
});

test("bounded pagination includes every page and explicitly verifies an exact limit", async () => {
  const source = [1,2,3,4];
  let requests=0;
  const records=await loadBoundedPages(async (first,last) => {
    requests++; return { data:source.slice(first,last+1),error:null };
  },4,2);
  assert.deepEqual(records,source);
  assert.equal(requests,3);
});

test("reporting overflow or a later page error never returns partial statistics", async () => {
  await assert.rejects(loadBoundedPages(async () => ({data:[1,2],error:null}),3,2), /limit exceeded/);
  await assert.rejects(loadBoundedPages(async (start) => start===0
    ? {data:[1,2],error:null} : {data:null,error:{}},4,2), /complete/);
});

test("aggregate projection drops unexpected patient identifiers", () => {
  const rows=projectAggregateRows([{ facility_label:"Synthetic",referral_count:5,
    small_cell_suppressed:false,complementary_suppressed:false,patient_identifier:"Synthetic hidden"}],
    ["facility_label","referral_count"]);
  assert.deepEqual(rows,[{facility_label:"Synthetic",referral_count:5}]);
  assert.ok(!JSON.stringify(rows).includes("patient_identifier"));
});

test("suppressed, complementary and small counts never become visible or zero", () => {
  for (const row of [
    {referral_count:3,small_cell_suppressed:false},
    {referral_count:20,small_cell_suppressed:true},
    {referral_count:20,small_cell_suppressed:false,complementary_suppressed:true},
    {referral_count:null,small_cell_suppressed:false},
  ]) assert.equal(projectAggregateRows([row],["referral_count"])[0].referral_count,null);
  assert.equal(projectAggregateRows([{referral_count:0,small_cell_suppressed:false}],["referral_count"])[0].referral_count,0);
});

test("missing suppression flags and unsafe numeric counts reject the report", () => {
  for (const row of [
    {referral_count:5}, {referral_count:-1,small_cell_suppressed:false},
    {referral_count:"9007199254740993",small_cell_suppressed:false},
  ]) assert.throws(() => projectAggregateRows([row],["referral_count"]));
});

function reportingClient(role="administrator", fail=false) {
  const calls=[];
  return {
    calls,
    auth:{ getUser:async () => ({data:{user:{id:"synthetic-user"}},error:null}) },
    from:(table) => {
      assert.equal(table,"profiles");
      const query={select:()=>query,eq:()=>query,single:async()=>({data:{role},error:null})};
      return query;
    },
    rpc:async (name,args) => { calls.push({name,args}); return fail ? {data:null,error:{}} : {data:[],error:null}; },
  };
}

test("public-health reporting calls only verified aggregate endpoints", async () => {
  const client=reportingClient();
  const report=await loadPublicHealthReport(client,"2025-02");
  assert.equal(report.datasets.length,6);
  assert.ok(client.calls.some(call => call.name === "get_admin_continuity_milestones"));
  assert.deepEqual(client.calls.map((call)=>call.name),REPORT_DATASETS.map((dataset)=>dataset.rpc));
  assert.ok(client.calls.every((call)=>call.args.p_end_date==="2025-02-28"));
});

test("unauthorized roles never issue aggregate RPC calls", async () => {
  const client=reportingClient("phc_staff");
  await assert.rejects(loadPublicHealthReport(client,"2025-02"),/reporting access/);
  assert.equal(client.calls.length,0);
});

test("unavailable reporting RPCs do not fall back to patient tables", async () => {
  const client=reportingClient("administrator",true);
  await assert.rejects(loadPublicHealthReport(client,"2025-02"),/No patient-level fallback/);
});
