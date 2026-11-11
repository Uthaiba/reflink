// REFLINK v2.0 — deterministic, offline release-evidence gate.
// This script never connects to Supabase, GitHub, or production.
// It verifies repository evidence completeness and requires explicit operator
// attestations for backup, migration reconciliation, clinical acceptance,
// security review and final approval. It cannot attest on anyone's behalf.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = [
  'supabase/tests/staging_migration_equivalence_readonly.sql',
  'supabase/tests/staging_post_baseline_migration_ledger_readonly.sql',
  'supabase/tests/staging_post_baseline_migration_effect_matrix_readonly.sql',
  'supabase/tests/staging_investigation_registration_unauthenticated_negative.sql',
  'supabase/tests/staging_authenticated_role_missing_identity_negative.sql',
  'supabase/tests/staging_unassigned_authenticated_identity_negative.sql',
  'supabase/tests/staging_unassigned_profile_confidentiality_rls.sql',
  'supabase/tests/staging_administrator_analytics_positive.sql',
  'supabase/tests/staging_migration_repair_data_preflight_readonly.sql',
  'supabase/tests/staging_exposed_security_definer_inventory_readonly.sql',
  'supabase/tests/staging_privileged_rpc_unassigned_identity_negative.sql',
  'supabase/tests/staging_admin_reporting_rpc_role_matrix.sql',
  'supabase/tests/staging_admin_predicate_and_print_audit_role_matrix.sql',
  'supabase/tests/staging_clinical_fixture_readiness_readonly.sql',
  'supabase/tests/staging_auth_profile_consistency_readonly.sql',
  'scripts/staging-authenticated-referral-access.mjs',
  'docs/REFLINK_STAGING_MIGRATION_LEDGER_REPAIR_RUNBOOK_20261111.md',
  'docs/REFLINK_STAGING_REAL_AUTH_ACCEPTANCE_20261111.md',
  'docs/REFLINK_V2_STAGING_RELEASE_GATE_20261111.md',
];
const migrationVersions = [
  '20261111160000','20261111163000','20261111170000',
  '20261111173000','20261111180000','20261111183000',
  '20261111184500','20261111190000','20261111191500',
  '20261111193000','20261111194500','20261111200000',
  '20261111201500',
];
const { readdirSync } = await import('node:fs');
const migrationNames = readdirSync(resolve(root, 'supabase/migrations'));
const missing = files.filter((file) => !existsSync(resolve(root, file)) ||
  !readFileSync(resolve(root, file), 'utf8').trim());
for (const version of migrationVersions) {
  const matches = migrationNames.filter((name) => name.startsWith(version + '_') && name.endsWith('.sql'));
  if (matches.length !== 1) missing.push(`migration ${version}: expected exactly one file, got ${matches.length}`);
}
if (missing.length) {
  console.error('FAIL: required REFLINK staging evidence missing:', missing.join(', '));
  process.exit(1);
}
console.log(`PASS: ${files.length} evidence files and ${migrationVersions.length} migration source files present.`);
const gates = [
  ['STAGING_BACKUP_VERIFIED', 'Restorable staging backup verified'],
  ['MIGRATION_EQUIVALENCE_APPROVED', 'Independent source/catalog equivalence approved'],
  ['MIGRATION_LEDGER_RECONCILED', 'Staging migration history reconciled and rechecked'],
  ['REAL_AUTH_CLINICAL_ACCEPTANCE_PASSED', 'Real Auth PHC/receiving/outsider/admin tests passed'],
  ['CLINICAL_LIFECYCLE_ACCEPTANCE_PASSED', 'Synthetic lifecycle, attachments, offline and notifications accepted'],
  ['SECURITY_REVIEW_APPROVED', 'Privileged functions and Auth security reviewed'],
  ['FINAL_CI_PASSED', 'Final branch CI passed'],
  ['RELEASE_APPROVAL_GRANTED', 'Authorized human release approval documented'],
];
const pending = gates.filter(([key]) => process.env[`REFLINK_GATE_${key}`] !== 'verified');
if (pending.length) {
  console.log('NO-GO: outstanding independently verified release gates:');
  for (const [, label] of pending) console.log(' - ' + label);
  if (process.argv.includes('--require-release-ready')) process.exit(1);
} else {
  console.log('All supplied attestations are marked verified. Independently validate supporting evidence before release.');
}
