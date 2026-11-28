"""Integrity checks only: archived historical SQL is never executed by this test."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

ROOT=Path("database/baselines/synthetic-staging-20261117")

def verify_archive(root):
    manifest=json.loads((root/"manifest.json").read_text())
    entries=manifest["entries"]
    assert manifest["project_id"]=="rcskuzmvyugbanygizri"
    assert manifest["status"]=="recovered_source_not_replay_certified"
    assert len(entries)==22
    versions=[item["version"] for item in entries]
    assert versions==sorted(set(versions))
    expected_files=set()
    for item in entries:
        name=item["file"]
        assert Path(name).name==name and name==item["version"]+"_"+item["name"]+".sql"
        assert item["statement_count"]==1
        script=(root/name).read_bytes().decode("utf-8")
        payload=json.dumps([script],ensure_ascii=False,separators=(",",":")).encode("utf-8")
        assert hashlib.sha256(payload).hexdigest()==item["statements_sha256"], name
        expected_files.add(name)
    assert {path.name for path in root.glob("*.sql")}==expected_files
    active={p.name.split("_",1)[0] for p in Path("supabase/migrations").glob("*.sql")}
    assert not active.intersection(versions), "Historical archive must remain outside active migration history"
    return entries

verify_archive(ROOT)
print("test_recovered_baseline_ledger_hashes_and_quarantine: passed")

with tempfile.TemporaryDirectory() as temporary:
    copied=Path(temporary)/"archive"
    shutil.copytree(ROOT,copied)
    manifest=json.loads((copied/"manifest.json").read_text())
    path=copied/manifest["entries"][0]["file"]
    path.write_bytes(path.read_bytes()+b"\n-- Synthetic tampering fixture\n")
    try:
        verify_archive(copied)
    except AssertionError:
        pass
    else:
        raise AssertionError("Modified baseline source was accepted")
print("test_recovered_baseline_detects_modified_source: passed")
