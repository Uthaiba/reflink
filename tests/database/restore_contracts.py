"""Synthetic pg_dump/pg_restore rehearsal; no hosted connections or real data."""
import json
from pathlib import Path
import runpy
import subprocess
import tempfile
import uuid

base=runpy.run_path("tests/database/baseline_replay_contracts.py")
run=base["run"]
source="reflink_baseline_replay"
target="reflink_baseline_restore"
ref,actor,operation=[str(uuid.uuid4()) for _ in range(3)]
run("INSERT INTO public.referrals(id,referral_number,patient_identifier,status,is_test) VALUES ('"+ref+"','SYNTHETIC-RESTORE','SYNTHETIC ONLY','draft',true)",source)
run("INSERT INTO private.clinical_operations(actor_id,operation_id,referral_id,operation_kind,request_hash) VALUES ('"+actor+"','"+operation+"','"+ref+"','assessment','synthetic-restore-fixture')",source)
run("INSERT INTO private.investigation_operations(actor_id,operation_id,referral_id,request_hash) VALUES ('"+actor+"','"+operation+"','"+ref+"','synthetic-restore-fixture')",source)

def tool(arguments):
    result=subprocess.run(arguments,capture_output=True,text=True,timeout=60)
    assert result.returncode==0,result.stderr

with tempfile.TemporaryDirectory() as temporary:
    archive=str(Path(temporary)/"synthetic.dump")
    tool(["pg_dump","--dbname",source,"--format=custom","--schema=public","--schema=private","--schema=storage","--file",archive])
    run("CREATE DATABASE "+target)
    run(Path("tests/database/managed_schema_stubs.sql").read_text(),target)
    # Target is a brand-new disposable database; never use this command on hosted data.
    tool(["pg_restore","--dbname",target,"--clean","--if-exists","--exit-on-error",archive])
    assert run("SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM storage.buckets b",source)==run("SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM storage.buckets b",target)
    assert json.loads(run(base["inventory_sql"],source))==json.loads(run(base["inventory_sql"],target))
    assert run("SELECT to_jsonb(r) FROM public.referrals r WHERE id='"+ref+"'",source)==run("SELECT to_jsonb(r) FROM public.referrals r WHERE id='"+ref+"'",target)
    for table in ["private.clinical_operations","private.investigation_operations"]:
        assert run("SELECT count(*) FROM "+table+" WHERE referral_id='"+ref+"'",target)=="1"
    assert run("SELECT count(*) FROM public.audit_log",source)==run("SELECT count(*) FROM public.audit_log",target)
    assert json.loads(run(Path("database/checks/clinical_staging_preflight.sql").read_text(),target))["blocking_checks"]==0
    assert run("SELECT has_function_privilege('authenticated','public.register_referral_investigation_files(uuid,jsonb)','EXECUTE')",target)=="f"
    privilege_sql="""SELECT jsonb_agg(to_jsonb(p)-'table_catalog' ORDER BY table_schema,table_name,column_name,grantee,privilege_type)
      FROM information_schema.column_privileges p WHERE table_schema IN ('public','private')
      AND grantee IN ('anon','authenticated','service_role')"""
    assert run(privilege_sql,source)==run(privilege_sql,target)
print("test_synthetic_dump_restore_preserves_schema_clinical_row_audit_ledgers_and_grants: passed")
