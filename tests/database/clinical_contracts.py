"""Runs existing investigation contracts, then clinical contracts in synthetic PostgreSQL."""
import concurrent.futures
import json
import runpy

base = runpy.run_path("tests/database/investigation_contracts.py")
run, literal, uid = base["run"], base["literal"], base["uid"]
identity, referral, context, count = base["identity"], base["referral"], base["context"], base["count"]
run(open("tests/database/clinical_fixture.sql").read())
run(open("database/changes/atomic_clinical_updates.sql").read())

ASSESSMENT = ["status","assessment_findings","final_diagnosis","diagnosis_category","diagnosis_status",
              "treatment_provided","procedures_performed","clinical_feedback","disposition",
              "assessment_completed_at","admission_at","discharged_at"]
INPATIENT = ["status","admission_at","ward_unit","admission_diagnosis","clinical_progress",
             "inpatient_treatment","discharge_diagnosis","condition_at_discharge",
             "discharge_medications","follow_up_plan","discharged_at"]

def snapshot(ref, kind):
    row = json.loads(run("SELECT to_jsonb(r) FROM referrals r WHERE id="+literal(ref)))
    return {field:row.get(field) for field in (ASSESSMENT if kind=="assessment" else INPATIENT)}

def assessment(label="Synthetic diagnosis", disposition="observation"):
    return {"assessment_findings":"Synthetic findings","final_diagnosis":label,
            "diagnosis_category":"Synthetic category","diagnosis_status":"provisional",
            "treatment_provided":None,"procedures_performed":None,"clinical_feedback":None,
            "disposition":disposition}

def save(actor, ref, kind, expected, patch, key=None, ok=True):
    output = run(context(actor)+"SELECT public.save_referral_clinical("+",".join([
        literal(ref),literal(kind),literal(json.dumps(expected))+"::jsonb",
        literal(json.dumps(patch))+"::jsonb",literal(key or uid())])+");",ok)
    return json.loads(output) if ok else None

def test_clinical_concurrency_and_replay():
    actor=identity()
    ref,_,_=referral(actor)
    expected=snapshot(ref,"assessment")
    keys=[uid(),uid()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        calls=[pool.submit(save,actor,ref,"assessment",expected,assessment("Synthetic "+str(i)),keys[i]) for i in range(2)]
        results=[call.result() for call in calls]
    assert sorted(item["status"] for item in results)==["conflict","saved"]
    winner=next(i for i,item in enumerate(results) if item["status"]=="saved")
    replay=save(actor,ref,"assessment",expected,assessment("Synthetic "+str(winner)),keys[winner])
    assert replay["status"]=="replayed" and replay["revision"]==results[winner]["revision"]
    assert count(ref)==1
    save(actor,ref,"assessment",expected,assessment("Changed request"),keys[winner],False)
    assert count(ref)==1

def test_clinical_lifecycle_and_server_timestamps():
    actor=identity()
    ref,_,_=referral(actor)
    result=save(actor,ref,"assessment",snapshot(ref,"assessment"),assessment(disposition="admitted"))
    assert result["referral"]["status"]=="admitted"
    assert result["referral"]["assessment_completed_at"] is not None
    assert result["referral"]["admission_at"] is not None
    assert "patient_identifier" not in result["referral"]
    admission={"admission_at":None,"ward_unit":"Synthetic ward","admission_diagnosis":"Synthetic diagnosis",
               "clinical_progress":None,"inpatient_treatment":None}
    save(actor,ref,"admission",snapshot(ref,"admission"),admission)
    discharge={"discharge_diagnosis":"Synthetic discharge","condition_at_discharge":"Synthetic condition",
               "discharge_medications":None,"follow_up_plan":"Synthetic follow-up"}
    expected=snapshot(ref,"discharge")
    key=uid()
    saved=save(actor,ref,"discharge",expected,discharge,key)
    assert saved["referral"]["status"]=="discharged" and saved["referral"]["discharged_at"] is not None
    assert save(actor,ref,"discharge",expected,discharge,key)["status"]=="replayed"
    assert count(ref)==3

def test_clinical_authorization():
    actor=identity()
    ref,_,_=referral(actor)
    expected=snapshot(ref,"assessment")
    for outsider in [identity(),identity("administrator",actor[2]),identity("phc_staff",actor[2]),
                     identity(facility=actor[2],banned=True),identity(facility=actor[2],expired=True)]:
        save(outsider,ref,"assessment",expected,assessment(),ok=False)
    run("UPDATE profiles SET must_change_password=true WHERE id="+literal(actor[0]))
    save(actor,ref,"assessment",expected,assessment(),ok=False)
    run("UPDATE profiles SET must_change_password=false WHERE id="+literal(actor[0]))
    key=uid()
    save(actor,ref,"assessment",expected,assessment(),key)
    run("DELETE FROM auth.sessions WHERE id="+literal(actor[1]))
    save(actor,ref,"assessment",expected,assessment(),key,False)
    run("SET ROLE anon; SELECT public.save_referral_clinical(NULL,NULL,NULL,NULL,NULL);",False)
    assert count(ref)==1

def test_clinical_validation_and_rollback():
    actor=identity()
    ref,_,_=referral(actor)
    expected=snapshot(ref,"assessment")
    for patch in [dict(assessment(),patient_identifier="Forbidden"),
                  dict(assessment(),status="completed"),dict(assessment(),assessment_completed_at="2026-01-01"),
                  dict(assessment(),diagnosis_status="unsupported"),dict(assessment(),disposition="completed"),
                  dict(assessment(),assessment_findings=""),dict(assessment(),final_diagnosis=123)]:
        save(actor,ref,"assessment",expected,patch,ok=False)
    partial=assessment();del partial["clinical_feedback"]
    save(actor,ref,"assessment",expected,partial,ok=False)
    missing=dict(expected);del missing["status"]
    save(actor,ref,"assessment",missing,assessment(),ok=False)
    assert count(ref)==0
    assert run("SELECT count(*) FROM private.clinical_operations WHERE referral_id="+literal(ref))=="0"
    key=uid()
    save(actor,ref,"assessment",expected,assessment("reject_clinical_fixture"),key,False)
    assert count(ref)==0
    assert save(actor,ref,"assessment",expected,assessment(),key)["status"]=="saved"

def test_clinical_closed_records_and_direct_bypass():
    actor=identity()
    for status in ["completed","cancelled"]:
        ref,_,_=referral(actor,status=status)
        save(actor,ref,"assessment",snapshot(ref,"assessment"),assessment(),ok=False)
    ref,_,_=referral(actor)
    run(context(actor)+"UPDATE referrals SET final_diagnosis='Synthetic overwrite' WHERE id="+literal(ref),False)
    run(context(actor)+"UPDATE referrals SET status='admitted' WHERE id="+literal(ref),False)
    run(context(actor)+"SELECT * FROM private.clinical_operations",False)
    assert count(ref)==0

for case in [test_clinical_concurrency_and_replay,test_clinical_lifecycle_and_server_timestamps,
             test_clinical_authorization,test_clinical_validation_and_rollback,
             test_clinical_closed_records_and_direct_bypass]:
    case()
    print(case.__name__+": passed")


# These mutations are confined to the disposable fixture created above.
# The preflight itself starts a READ ONLY transaction and reads catalogs only.
def preflight():
    return json.loads(run(open("database/checks/clinical_staging_preflight.sql").read()))

def test_preflight_accepts_candidate_structure():
    report=preflight()
    assert report["scope"]=="catalog_only_not_release_approval"
    assert report["blocking_checks"]==0, report
    assert len(report["checks"])==6

def test_preflight_detects_disabled_guard_and_exposed_ledger():
    run("ALTER TABLE public.referrals DISABLE TRIGGER guard_clinical_client_writes")
    try:
        report=preflight()
        assert any(item["name"]=="clinical_direct_write_guard" and not item["passed"] for item in report["checks"])
        assert report["blocking_checks"]>0
    finally:
        run("ALTER TABLE public.referrals ENABLE TRIGGER guard_clinical_client_writes")
    run("GRANT SELECT ON private.clinical_operations TO authenticated")
    try:
        report=preflight()
        assert any(item["name"]=="private_ledger" and not item["passed"] for item in report["checks"])
    finally:
        run("REVOKE SELECT ON private.clinical_operations FROM authenticated")
    assert preflight()["blocking_checks"]==0

for case in [test_preflight_accepts_candidate_structure,test_preflight_detects_disabled_guard_and_exposed_ledger]:
    case()
    print(case.__name__+": passed")
