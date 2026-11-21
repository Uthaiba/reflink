# Synthetic restore rehearsal

The disposable PostgreSQL workflow now runs pg_dump in custom format and pg_restore into a separate fresh database after baseline reconciliation and atomic migration rehearsal. It retains ownership and ACLs rather than stripping permissions. The public/private schemas and stub storage metadata/policies are included; Auth remains an explicit managed-service stub. Bucket configuration metadata is compared after restoration. No actual storage file payload is backed up or restored.

A clearly marked synthetic draft referral and both operation-ledger entries are added before backup. The test compares source/restored selected schema metadata, the complete synthetic referral row, audit counts, both operation counts, browser-role column privileges, structural preflight and legacy writer denial. The backup exists only in a temporary directory and is not uploaded as an artifact.

The test inherits the loopback server/database/fixture-marker guards from the baseline runner. CREATE DATABASE and pg_restore --clean are restricted to that new disposable database; these commands are not run on hosted staging or production.

This verifies PostgreSQL schema/data/selected permissions restoration using managed-service stubs. It does NOT certify a production backup, hosted PITR, real Auth/session recovery, private file/blob restoration, encryption/key recovery, recovery time/point objectives or a clinical sign-off. Actual production backup and restore evidence remains a release gate. Runtime success must be confirmed from CI before marking this rehearsal passed.

Verified code ca337407bfab8d67e494f8ee0c6403b1fde37b58 passed database workflow #52 and frontend workflows #126/#127, including the restore rehearsal, 112 unit tests, lint/build, synthetic Chromium checks and GitGuardian. The first permission comparison included the intentionally different database name; it was corrected to compare actual privilege fields, and the corrected run passed.

## Hosted recovery drill preparation — 21 November 2026

The Project Lead authorized synthetic-only preparation and validation. The available production schema export contains schema definitions. The existing reflink-synthetic-staging project is the designated testing environment and contains active workflow fixtures. Use scoped synthetic fixtures for non-destructive checks in that environment. If the provider restore would overwrite existing staging fixtures, obtain an approved maintenance window and recovery plan or an approved disposable destination. Creating a billable resource needs separate authorization.

| Stage | Required observation |
| --- | --- |
| Establish the source | Create a synthetic referral with distinguishable referring and receiving facilities, ordered events, hospital feedback and a PHC encounter. Create separate synthetic Auth identities, including an unrelated facility user, and a small private fixture file. Use test-only secrets. |
| Establish the recovery point | Record the source time, migration versions, fixture counts, private file byte length and SHA-256, and an inventory of required configuration and key identifiers. Keep credentials, keys and file payloads out of reports. |
| Restore in isolation | Restore the database, Auth identities, bucket configuration and private objects using the applicable supported recovery paths. Restore test-only key material through the designated secret store. Keep outbound notifications disabled during the rehearsal. |
| Verify through the application | Sign in with the restored test identities. Check both facility assignments, event order, separate milestones, and the file checksum after an authorized download. Confirm denial for the unrelated facility. Verify that the restored application can read an encrypted test fixture using the recovered test configuration. |
| Rehearse release and rollback | Apply the release candidate, record a synthetic post-migration event, exercise rollback, and verify the approved handling of writes made after migration. Compare the referral, event history, private file and permissions again. |
| Record acceptance | Record start/end times, measured recovery time, recovered point, observed losses, and failures. The designated recovery and release owners review the results against approved objectives. |

Current evidence covers a disposable PostgreSQL restore, including ordered referral history and facility assignments. The hosted Auth, private-file, key and configuration restore has no recorded passing result. Operational recovery remains open.
