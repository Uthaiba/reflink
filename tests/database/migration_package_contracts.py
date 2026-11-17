"""Validate that the CLI-generated migration package matches reviewed candidates."""
from pathlib import Path
pairs=[
 ("database/changes/atomic_investigation_updates.sql","supabase/migrations/20261117135653_atomic_investigation_updates.sql"),
 ("database/changes/atomic_clinical_updates.sql","supabase/migrations/20261117135703_atomic_clinical_updates.sql"),
]
for candidate,migration in pairs:
    assert Path(candidate).read_bytes()==Path(migration).read_bytes(), "Migration/candidate drift: "+candidate
    assert Path(migration).read_text().count("BEGIN;")==1
    assert Path(migration).read_text().rstrip().endswith("COMMIT;")
print("test_migration_candidate_parity: passed")
