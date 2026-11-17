# Synthetic restore rehearsal

The disposable PostgreSQL workflow now runs pg_dump in custom format and pg_restore into a separate fresh database after baseline reconciliation and atomic migration rehearsal. It retains ownership and ACLs rather than stripping permissions. The public/private schemas and stub storage metadata/policies are included; Auth remains an explicit managed-service stub. Bucket configuration metadata is compared after restoration. No actual storage file payload is backed up or restored.

A clearly marked synthetic draft referral and both operation-ledger entries are added before backup. The test compares source/restored selected schema metadata, the complete synthetic referral row, audit counts, both operation counts, browser-role column privileges, structural preflight and legacy writer denial. The backup exists only in a temporary directory and is not uploaded as an artifact.

The test inherits the loopback server/database/fixture-marker guards from the baseline runner. CREATE DATABASE and pg_restore --clean are restricted to that new disposable database; these commands are not run on hosted staging or production.

This verifies PostgreSQL schema/data/selected permissions restoration using managed-service stubs. It does NOT certify a production backup, hosted PITR, real Auth/session recovery, private file/blob restoration, encryption/key recovery, recovery time/point objectives or a clinical sign-off. Actual production backup and restore evidence remains a release gate. Runtime success must be confirmed from CI before marking this rehearsal passed.

Verified code ca337407bfab8d67e494f8ee0c6403b1fde37b58 passed database workflow #52 and frontend workflows #126/#127, including the restore rehearsal, 112 unit tests, lint/build, synthetic Chromium checks and GitGuardian. The first permission comparison included the intentionally different database name; it was corrected to compare actual privilege fields, and the corrected run passed.
