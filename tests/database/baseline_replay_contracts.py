"""Replay recovered history only in the CI-created disposable PostgreSQL server."""
import json
import os
from pathlib import Path
import subprocess

assert os.environ.get("PGHOST") in ("127.0.0.1","localhost"), "Replay requires loopback fixture server"
assert os.environ.get("PGDATABASE")=="reflink_contracts", "Replay requires fixture database"

def run(sql, database="reflink_contracts"):
    result=subprocess.run(["psql","-X","-qAt","-v","ON_ERROR_STOP=1","--dbname",database],input=sql,text=True,capture_output=True,timeout=40)
    assert result.returncode==0, result.stderr
    return result.stdout.strip()

assert run("SELECT to_regprocedure('public.fixture_audit()') IS NOT NULL") == "t", "Missing disposable test marker"
database="reflink_baseline_replay"
run("CREATE DATABASE "+database)
run(Path("tests/database/managed_schema_stubs.sql").read_text(),database)
root=Path("database/baselines/synthetic-staging-20261117")
manifest=json.loads((root/"manifest.json").read_text())
for item in manifest["entries"]:
    run((root/item["file"]).read_text(),database)
print("test_all_22_archived_migrations_replay_with_managed_stubs: passed")

inventory_sql=Path("database/checks/public_baseline_inventory.sql").read_text()
actual=json.loads(run(inventory_sql,database))
expected=json.loads(Path("database/baselines/synthetic-staging-20261117/catalog_inventory.json").read_text())["objects"]
def index(rows):
    return {(row["kind"],row["name"]):row["detail"] for row in rows}
observed,hosted=index(actual),index(expected)
only_hosted=sorted(set(hosted)-set(observed))
only_replay=sorted(set(observed)-set(hosted))
changed=sorted(key for key in set(hosted)&set(observed) if hosted[key]!=observed[key])
report={"scope":"public_schema_and_storage_policy_metadata_with_managed_stubs",
 "hosted_project":"rcskuzmvyugbanygizri","status":"drift_detected" if only_hosted or only_replay or changed else "no_drift_in_selected_metadata",
 "hosted_only":only_hosted,"replay_only":only_replay,"changed":changed,
 "not_compared":["managed service implementation","table and column grants","indexes","default privileges","bucket rows","publication membership","Auth configuration"]}
Path("baseline-replay-report.json").write_text(json.dumps(report,indent=2)+"\n")
print("baseline_catalog_comparison: "+json.dumps(report,sort_keys=True))
assert len(actual)>250, "Unexpectedly incomplete public replay"
assert any(row["kind"]=="function" and "register_referral_investigation_files" in row["name"] for row in expected), "Known out-of-ledger function must remain tracked"
assert any("register_referral_investigation_files" in key[1] for key in only_hosted), "Expected unmanaged function drift was not detected"
print("test_replay_detects_known_out_of_ledger_registration_function: passed")

run(Path("tests/database/observed_staging_overlay.sql").read_text(),database)
reconciled=index(json.loads(run(inventory_sql,database)))
remaining=sorted(key for key in set(reconciled)|set(hosted) if reconciled.get(key)!=hosted.get(key))
report["reconciliation_remaining"]=remaining
report["reconciliation_status"]="matched_selected_schema_metadata" if not remaining else "blocked"
Path("baseline-replay-report.json").write_text(json.dumps(report,indent=2)+"\n")
assert not remaining,remaining
print("test_observed_drift_overlay_matches_selected_hosted_metadata: passed")

# Reproduce observed hosted legacy access to prove the pending cutover retires it.
run("GRANT EXECUTE ON FUNCTION public.register_referral_investigation_files(uuid,jsonb) TO authenticated",database)
assert run("SELECT has_function_privilege('authenticated','public.register_referral_investigation_files(uuid,jsonb)','EXECUTE')",database)=="t"
for migration in sorted(Path("supabase/migrations").glob("*.sql")):
    run(migration.read_text(),database)
preflight=json.loads(run(Path("database/checks/clinical_staging_preflight.sql").read_text(),database))
assert preflight["blocking_checks"]==0,preflight
print("test_atomic_candidates_apply_on_recovered_baseline_and_pass_preflight: passed")

assert run("SELECT has_function_privilege('authenticated','public.register_referral_investigation_files(uuid,jsonb)','EXECUTE')",database)=="f"
assert run("SELECT has_function_privilege('anon','public.register_referral_investigation_files(uuid,jsonb)','EXECUTE')",database)=="f"
print("test_atomic_cutover_retires_legacy_privileged_writer: passed")
