"""Synthetic PostgreSQL transaction/authorization tests; no hosted database access."""
import concurrent.futures
import json
import subprocess
import uuid

def run(query, ok=True):
    result = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
                            input=query, text=True, capture_output=True, timeout=25)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    if not ok:
        assert result.returncode != 0, "Expected rejection"
    return result.stdout.strip()

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

def uid():
    return str(uuid.uuid4())

def setup():
    run(open("tests/database/fixture.sql").read())
    run(open("database/changes/atomic_investigation_updates.sql").read())

def identity(role="receiving_staff", facility=None, banned=False, expired=False):
    actor, session, facility = uid(), uid(), facility or uid()
    run("INSERT INTO auth.users VALUES (" + literal(actor) + "," +
        ("now()+interval '1 day'" if banned else "NULL") + ",NULL);" +
        "INSERT INTO auth.sessions VALUES (" + literal(session) + "," + literal(actor) + "," +
        ("now()-interval '1 day'" if expired else "NULL") + ");" +
        "INSERT INTO profiles VALUES (" + literal(actor) + "," + literal(role) + "," + literal(facility) + ");")
    return actor, session, facility

def referral(actor, status="under_assessment", records=None, destination=None):
    ref, origin = uid(), uid()
    records = records if records is not None else [{"investigation":"Synthetic A","result_status":"pending"}]
    destination = destination or actor[2]
    run("INSERT INTO referrals VALUES (" + literal(ref) + "," + literal(json.dumps(records)) + "::jsonb," +
        literal(status) + "," + literal(actor[0]) + "," + literal(origin) + "," + literal(destination) + ");")
    return ref, records, origin

def context(actor):
    return 'SET "request.jwt.claim.sub"=' + literal(actor[0]) + '; SET "request.jwt.claims"=' + literal(
        json.dumps({"session_id":actor[1]})) + "; SET ROLE authenticated;"

def save(actor, ref, expected, patch, key=None, index=0, ok=True):
    query = context(actor) + "SELECT public.save_referral_investigation(" + ",".join([
        literal(ref), literal(json.dumps(expected))+"::jsonb",str(index),
        literal(json.dumps(patch))+"::jsonb",literal(key or uid())]) + ");"
    output = run(query, ok)
    return json.loads(output) if ok else None

def count(ref):
    return int(run("SELECT count(*) FROM audit_log WHERE referral_id="+literal(ref)))

def test_concurrency_and_idempotency():
    actor = identity()
    ref, expected, _ = referral(actor)
    keys = [uid(),uid()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        calls = [pool.submit(save,actor,ref,expected,{"result_value":str(i)},keys[i]) for i in range(2)]
        values = [call.result() for call in calls]
    assert sorted(v["status"] for v in values)==["conflict","saved"]
    winner = next(i for i,v in enumerate(values) if v["status"]=="saved")
    replay = save(actor,ref,expected,{"result_value":str(winner)},keys[winner])
    assert replay["status"]=="replayed" and replay["revision"]==values[winner]["revision"]
    assert count(ref)==1
    save(actor,ref,expected,{"result_value":"changed payload"},keys[winner],ok=False)
    assert count(ref)==1

def test_authorization_and_closed_records():
    actor = identity()
    ref, expected, _ = referral(actor)
    for outsider in [identity(),identity("administrator"),identity(banned=True),identity(expired=True)]:
        save(outsider,ref,expected,{"result_value":"Synthetic"},ok=False)
    run("DELETE FROM auth.sessions WHERE id="+literal(actor[1]))
    save(actor,ref,expected,{"result_value":"Synthetic"},ok=False)
    run("SET ROLE anon; SELECT public.save_referral_investigation(NULL,NULL,0,NULL,NULL);",False)
    for status in ["completed","cancelled"]:
        actor = identity()
        ref, expected, _ = referral(actor,status)
        save(actor,ref,expected,{"result_value":"Synthetic"},ok=False)
        run(context(actor)+"UPDATE referrals SET status='sent' WHERE id="+literal(ref),False)

def test_patch_validation_and_rollback():
    actor = identity()
    ref, expected, _ = referral(actor)
    for patch in [{"investigation":"Replacement"}, {"result_status":"unsupported"},
                  {"result_value":None}, {"result_value":"x"*4001},
                  {"result_file_path":"outside/referral.pdf"}, {"result_notes":"reject_fixture"}]:
        save(actor,ref,expected,patch,ok=False)
    assert count(ref)==0
    assert run("SELECT count(*) FROM private.investigation_operations WHERE referral_id="+literal(ref))=="0"
    # The same key is available after a rolled-back operation.
    key = uid()
    save(actor,ref,expected,{"result_notes":"reject_fixture"},key,ok=False)
    assert save(actor,ref,expected,{"result_notes":"Synthetic accepted"},key)["status"]=="saved"

def test_legacy_and_direct_bypass():
    actor = identity()
    ref, expected, _ = referral(actor,records=["Legacy string"])
    save(actor,ref,expected,{"result_value":"Synthetic"},ok=False)
    ref, expected, _ = referral(actor)
    run(context(actor)+"UPDATE referrals SET investigation_records='[]' WHERE id="+literal(ref),False)
    run(context(actor)+"SELECT * FROM private.investigation_operations",False)
    assert count(ref)==0

def test_phc_attachment_registration():
    actor = identity("phc_staff")
    ref, expected, origin = referral(actor,status="sent")
    run("UPDATE profiles SET facility_id="+literal(origin)+" WHERE id="+literal(actor[0]))
    path=ref+"/"+uid()+".pdf"
    run("INSERT INTO storage.objects VALUES ('referral-investigation-results',"+literal(path)+","+
        literal(actor[0])+",'{\"size\":5,\"mimetype\":\"application/pdf\"}');")
    patch={"result_file_path":path,"result_file_name":"synthetic.pdf","result_file_type":"application/pdf","result_file_size":5}
    save(actor,ref,expected,{"result_status":"positive"},ok=False)
    saved=save(actor,ref,expected,patch)
    assert saved["status"]=="saved"
    # Wrong owners and descriptor mismatches cannot register another object.
    ref2, expected2, _ = referral(actor,status="sent")
    run("UPDATE referrals SET referring_facility_id="+literal(origin)+" WHERE id="+literal(ref2))
    badpath=ref2+"/"+uid()+".pdf"
    run("INSERT INTO storage.objects VALUES ('referral-investigation-results',"+literal(badpath)+","+
        literal(uid())+","+literal(json.dumps({"size":5,"mimetype":"application/pdf"}))+");")
    badpatch={**patch,"result_file_path":badpath}
    save(actor,ref2,expected2,badpatch,ok=False)
    run("UPDATE storage.objects SET owner_id="+literal(actor[0])+" WHERE name="+literal(badpath))
    save(actor,ref2,expected2,{**badpatch,"result_file_size":6},ok=False)
    assert count(ref2)==0
    # A fresh key cannot replace an already registered PHC document.
    save(actor,ref,saved["investigation_records"],patch,ok=False)

setup()
for case in [test_concurrency_and_idempotency,test_authorization_and_closed_records,
             test_patch_validation_and_rollback,test_legacy_and_direct_bypass,
             test_phc_attachment_registration]:
    case()
    print(case.__name__+": passed")
