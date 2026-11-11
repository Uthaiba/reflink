# Staging migration ledger repair — controlled operator runbook

**Scope:** Synthetic staging project `rcskuzmvyugbanygizri` only. **Never** point these commands at production project `uwwzbljufqbzkjflpnll`.

## Preconditions
1. Verify the linked Supabase project reference is `rcskuzmvyugbanygizri` and capture a staging database backup.
2. Confirm latest staging branch CI passed and run both read-only scripts under `supabase/tests/`.
3. Have a reviewer confirm all 13 source migrations' final effects are present and compatible. The investigation-registration function body has already matched the latest source exactly, but the earlier 12 migrations require independent review of their final effects. **Do not assume ledger absence means the SQL has not run.**
4. Do not apply the 13 historical SQL files again: intermediate `CREATE OR REPLACE FUNCTION` versions could overwrite current hardened code.

## Repair after equivalence approval
Use a local Supabase CLI linked explicitly to **staging**; verify project ref before each operation. CLI commands below update migration history, not application tables.

```powershell
npx --yes supabase@2.122.1 link --project-ref rcskuzmvyugbanygizri
npx --yes supabase@2.122.1 migration list
```

Only after the equivalence review and backup, mark each verified version as applied. Execute one at a time and recheck the ledger:

```powershell
$versions = @(
  '20261111160000','20261111163000','20261111170000',
  '20261111173000','20261111180000','20261111183000',
  '20261111184500','20261111190000','20261111191500',
  '20261111193000','20261111194500','20261111200000',
  '20261111201500'
)
foreach ($version in $versions) {
  npx --yes supabase@2.122.1 migration repair --status applied $version
  if ($LASTEXITCODE -ne 0) { throw "Repair failed at $version; stop immediately" }
}
npx --yes supabase@2.122.1 migration list
```

**Important:** `migration repair` changes migration tracking; it does not verify SQL equivalence or execute the migration. Never run the block before independent review and backup.

## Acceptance
- Ledger contains exactly the expected 13 new versions and no duplicate versions.
- `supabase/tests/staging_migration_equivalence_readonly.sql` reports all controls PASS.
- Exact investigation registration function-body comparison remains unchanged.
- Existing synthetic facilities and user counts unchanged; no clinical production data imported.
- Authenticated PHC, receiving-staff and administrator negative/positive clinical acceptance passes.
- CI passes on the final staging commit.

**Stop conditions:** unexpected database change, missing SQL object, nonmatching function definition, wrong project ref, permission error or any production target. Do not promote or merge without release approval.
