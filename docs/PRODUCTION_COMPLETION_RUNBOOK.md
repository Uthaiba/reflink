# REFLINK production completion and release runbook

Hosted status update (17 November 2026): the two atomic migrations are installed in synthetic staging, the six-point structural preflight passes, and the branch-specific preview enables the two atomic flags against staging only. See HOSTED_STAGING_INSTALLATION_2026-11-17.md. Production remains NO-GO. Earlier review-only/unapplied statements below describe the pre-installation stage and must not be interpreted as current hosted status.

Status: source implementation and synthetic CI evidence only. Production NO-GO.
Use with MASTER_PLAN_AUDIT_2026-11-16.md and CLINICAL_PRODUCTION_ACCEPTANCE_GATE.md.

## Implemented continuation

- Password-change service confirms identity/profile state and handles ambiguous outcomes.
- Mixed diagnosis statuses remain structured; their legacy scalar stays valid.
- Atomic investigation changeset and browser adapter replace whole-array browser writes.
- Receiving result fields use explicit local draft/save controls. Grouped cards
  retain full records, and receiving document uploads are wired to their handler.
- PHC attachment descriptors are absent until storage upload and database registration.
  Each uploaded document is registered immediately before proceeding to the next.
- The atomic endpoint uses current account/session/profile checks, a referral row
  lock, full-snapshot comparison, an allowlisted patch, storage ownership/metadata
  checks and a private operation ledger. Its clinical write/audit is transactional.
- Direct client investigation updates and direct changes to closed records are rejected
  by the proposed database trigger.
- R-PHI uses verified staging aggregate RPCs only. Operational clinical exports are
  labeled separately, paginated with an explicit bound, and protect formula prefixes.
- Optional AES-GCM encrypted device drafts use a separate passphrase, PBKDF2
  key derivation, authenticated owner/expiry metadata, a 24-hour lifetime and
  allowlisted restoration. File contents and file descriptors are excluded.
- Referral submission uses a stable client UUID and checks for a prior save before
  insertion and after uncertain responses. The existing production unique index
  on non-null offline_client_id was verified by catalog inspection.
- Hosted production and staging have not received these changes.

## Important boundaries

`database/changes/atomic_investigation_updates.sql` is a reviewed-source candidate,
not a migration already applied to either project. CI applies it only to a disposable
synthetic PostgreSQL database. It adds a private idempotency/audit operation table,
a narrowly authorized definer RPC and a direct-write guard trigger. It does not
rewrite existing investigation JSON or delete any documents.

The endpoint still addresses an item by its position within an EXACT expected
array snapshot. The locked comparison prevents position shifts from targeting a
different record. Stable per-item IDs/revisions remain a future schema evolution;
do not claim this implements the original per-item revision design in full.
All edits to the same referral serialize and may conflict, even on different items.

Idempotent retries with the same key return the original operation revision and
the currently authorized snapshot, without a second write. The ledger stores IDs,
a request hash and timestamp, not duplicate clinical JSON. Review ledger retention
and grants before deployment. A new operation key is not an idempotent retry.

Storage upload and database registration remain separate transactions. Unlinked
objects are preserved after uncertainty. There is no automated deletion worker or
complete server-owned upload-intent/reconciliation interface yet. Existing storage
UPDATE/DELETE policies and existing definer writers must be reconciled before
claiming global document immutability. Metadata ownership/type/size checks do not
constitute malware scanning or trusted file-content validation.

The SQL guard denies ordinary authenticated/anonymous direct edits. Privileged
database/service maintenance can bypass it and needs a separately reviewed,
reason-bearing correction workflow. Do not present it as that correction workflow.

## Configuration and staged rehearsal

1. Reconcile the exact deployed schemas, storage policies, Auth settings, existing
   definer writers and migration ledger against the audit. Preserve existing users,
   facilities and clinical records. Never copy production patient rows into staging.
2. Generate a versioned migration using the installed CLI's discovered commands,
   preserving this changeset's reviewed contents. Confirm Auth/storage columns and
   role grants, function ownership, search paths and API exposure.
3. Apply only to the approved existing synthetic environment through a reviewed
   operation. Do not create billable infrastructure.
4. Verify real authenticated PHC, receiving, wrong-facility, suspended, revoked and
   anonymous calls. Exercise upload metadata failures, same-key retry, conflicts,
   closed records, direct REST bypass, legacy arrays and audited rollback.
5. Only after those pass, build a staging frontend with
   `VITE_ATOMIC_INVESTIGATIONS_ENABLED=true`. The default is false so an undeployed
   RPC is not silently assumed available. Files are not uploaded when registration
   capability is disabled. Existing records remain readable.
6. Rehearse password recovery with the audited environment capability. Confirm
   privileged MFA/reauthentication, sign-out and subsequent login.
7. Test R-PHI using the existing approved aggregate functions. Production currently
   lacks several functions; do not enable reporting by falling back to raw rows.
8. Verify 320/375px layouts, keyboard and screen reader behavior, contrast, focus,
   unsaved drafts, printing, and clinical labels using synthetic scenarios.

## Reporting methodology and disclosure

R-PHI describes referral activity in participating facilities, not population
incidence/prevalence, service availability or an outbreak confirmation. Monthly
boundaries are interpreted by the server in Africa/Lagos. Synthetic rows are
excluded according to the verified RPC definitions. Current/future months may be
incomplete and are labeled accordingly.

Exports project only aggregate fields and preserve suppression. The frontend
withholds positive counts below five as an additional guard, but an institutional
disclosure policy is still required. Complementary suppression within one table
does not guarantee safety across multiple tables, dates or repeated releases.
Review external sharing, longitudinal comparisons and data-quality denominators.
No autonomous clinical AI feature or regulatory compliance claim is included.

## Encrypted device drafts and controlled submission

The source implements explicit save/restore/delete actions in the PHC form.
`VITE_ENCRYPTED_DRAFTS_ENABLED=true` enables the panel only after device/privacy
review. It is disabled by default. Drafts are encrypted with AES-256-GCM and a
PBKDF2-SHA256 key (310,000 iterations), unique salt and IV. The passphrase/key is
not persisted, and passphrase fields are cleared after each action. Authentication
to the server still uses the existing account and RLS, never the draft passphrase.

Storage holds ciphertext plus opaque account/draft IDs, salt/IV and expiry
metadata. Expiry is authenticated and checked before decryption. Expired local
drafts are removed when accessed; there is no promise of physical erasure from
browser backups or unattended removal while the browser is closed. Device-clock
tampering and XSS remain risks requiring assessment. Passphrase loss cannot be
recovered by this frontend.

This supports an already opened application tab, not a full installable offline
PWA. There is no automatic background submission. Restored data is allowlisted,
requires clinical review, and is manually submitted under a stable client ID.
Duplicate checks use only that opaque ID and referring-user ID; clinical JSON is
not placed in request URLs. A saved match is a reference for verification, not a
newly submitted or printable clinical record. Patient identifiers from an edited
form must not be attributed to an earlier saved referral.

Full browser/device isolation, quota failures, multi-tab behavior, offline login,
encryption review, restore/retry workflows and synchronization testing remain
release gates.

## Production release prerequisites

- Final reviewed commit passes frontend and synthetic database workflows.
- Authenticate end-to-end against staged RLS/Auth/Storage/Edge Functions; the CI
  fixture is not a full Supabase clone.
- Verify production backup AND restore, including private storage objects,
  authorization configuration and operation-ledger recovery.
- Resolve production/staging drift through additive reviewed migrations.
- Complete clinical sign-off, privacy/retention assessment, accessibility/mobile
  review, offline synchronization verification and operational monitoring.
- Record the release operator, source SHA, reviewed migration, backup identifier,
  rollback checkpoint and explicit production authorization.
- Schedule deployment with an incident contact and verify each role afterwards.

## Rollback and incident handling

Disable the new frontend mutation capability first and preserve draft/source state.
Retain uploaded objects and operation evidence. Do not re-enable unsafe whole-array
direct writes as a quick rollback. Inspect uncertain operation keys and current
authorized snapshots before retrying. Restore a prior frontend only if it respects
the active database guard and permission model.

A database rollback must preserve the private operation history and every linked
object. Do not drop the table or clear audit records. Revert grants/functions through
a reviewed compatible migration or restore from the verified checkpoint under the
incident plan. Never execute this document as an unattended production script.

## Outstanding master-plan deliverables

The transformation is not complete. Remaining verified gates include:
- complete browser/visual/accessibility audit and modular design-system consolidation;
- explicit acceptance/rejection/escalation and a controlled completed-record correction flow;
- server-owned attachment intents, administrative reconciliation and reviewed retention;
- authenticated full referral/counter-referral/notification lifecycle tests;
- approved population-independent indicators, cross-report disclosure review,
  trend/geographic visualizations and a controlled AI reporting integration;
- browser/device verification of encrypted drafts, full controlled sync/PWA support and reviewed interoperability;
- restore rehearsal, performance/security assessment, clinical approval and deployment.

These cannot be marked complete from source changes or synthetic CI alone.

## Clinical transaction continuation

Assessment, admission and discharge now have a review-only transactional candidate and frontend adapter behind disabled VITE_ATOMIC_CLINICAL_SAVES_ENABLED. See ATOMIC_CLINICAL_SAVES.md and CLINICAL_STAGING_CHECKPOINT.md for coordinated client/backend rehearsal and the catalog-only preflight. Passing structural checks does not close authenticated release gates.
