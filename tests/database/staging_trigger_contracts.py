"""Disposable compatibility tests with exact observed staging trigger bodies."""
import json
import runpy
base=runpy.run_path("tests/database/clinical_contracts.py")
run,literal,uid=base["run"],base["literal"],base["uid"]
identity,referral,save=base["identity"],base["referral"],base["save"]
snapshot,assessment,context=base["snapshot"],base["assessment"],base["context"]
run(open("tests/database/staging_trigger_fixture.sql").read())

def scalar(query):
    return int(run(query))

def test_staging_trigger_lifecycle_and_private_audit():
    actor=identity()
    ref,_,_=referral(actor)
    save(actor,ref,"assessment",snapshot(ref,"assessment"),assessment(disposition="admitted"))
    discharge={"discharge_diagnosis":"Synthetic discharge","condition_at_discharge":"Synthetic condition",
               "discharge_medications":None,"follow_up_plan":"Synthetic plan"}
    key=uid();expected=snapshot(ref,"discharge")
    save(actor,ref,"discharge",expected,discharge,key)
    save(actor,ref,"discharge",expected,discharge,key)
    statuses=json.loads(run("SELECT jsonb_agg(status ORDER BY status) FROM referral_updates WHERE referral_id="+literal(ref)))
    assert statuses==["admitted","discharged"]
    assert scalar("SELECT count(*) FROM audit_log WHERE record_id="+literal(ref)+" AND action='UPDATE'")==2
    assert scalar("SELECT count(*) FROM audit_log WHERE record_id="+literal(ref)+" AND (new_data ?| ARRAY['patient_identifier','assessment_findings','final_diagnosis','discharge_diagnosis','follow_up_plan'] OR old_data ?| ARRAY['patient_identifier','final_diagnosis'])")==0
    assert scalar("SELECT count(*) FROM referral_notifications WHERE referral_id="+literal(ref))==0

def test_staging_entry_validator_rolls_back_operation():
    actor=identity()
    ref,_,_=referral(actor,status="draft")
    run("UPDATE referrals SET patient_age_months=NULL WHERE id="+literal(ref))
    # Simulate an incomplete legacy record only in the disposable fixture.
    run("ALTER TABLE referrals DISABLE TRIGGER referral_entry_validation_trigger")
    try:
        for status in ["sent","acknowledged","patient_arrived","under_assessment"]:
            run("UPDATE referrals SET status="+literal(status)+" WHERE id="+literal(ref))
    finally:
        run("ALTER TABLE referrals ENABLE TRIGGER referral_entry_validation_trigger")
    key=uid();expected=snapshot(ref,"assessment")
    save(actor,ref,"assessment",expected,assessment(),key,False)
    assert scalar("SELECT count(*) FROM private.clinical_operations WHERE referral_id="+literal(ref))==0
    assert snapshot(ref,"assessment")==expected
    run("UPDATE referrals SET patient_age_months=240 WHERE id="+literal(ref))
    assert save(actor,ref,"assessment",expected,assessment(),key)["status"]=="saved"

def test_staging_operational_transitions_and_notification():
    actor=identity()
    ref,_,_=referral(actor,status="sent")
    for status in ["acknowledged","patient_arrived","under_assessment"]:
        run(context(actor)+"UPDATE referrals SET status="+literal(status)+" WHERE id="+literal(ref))
    assert scalar("SELECT count(*) FROM referral_notifications WHERE referral_id="+literal(ref))==2
    assert scalar("SELECT count(*) FROM referral_updates WHERE referral_id="+literal(ref))==3
    run(context(actor)+"UPDATE referrals SET status='admitted' WHERE id="+literal(ref),False)
    save(actor,ref,"assessment",snapshot(ref,"assessment"),assessment(disposition="discharged"))
    run(context(actor)+"UPDATE referrals SET status='completed' WHERE id="+literal(ref),False)
    run("INSERT INTO counter_referrals VALUES("+literal(ref)+")")
    run(context(actor)+"UPDATE referrals SET status='completed' WHERE id="+literal(ref))
    assert snapshot(ref,"assessment")["status"]=="completed"
    save(actor,ref,"assessment",snapshot(ref,"assessment"),assessment(),ok=False)

for case in [test_staging_trigger_lifecycle_and_private_audit,
             test_staging_entry_validator_rolls_back_operation,
             test_staging_operational_transitions_and_notification]:
    case()
    print(case.__name__+": passed")
