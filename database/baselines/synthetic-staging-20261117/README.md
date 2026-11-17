# Recovered synthetic staging migration archive

Captured 17 November 2026 from the existing synthetic staging project's migration ledger using read-only transactions. This directory preserves 22 original SQL scripts and their original ledger identities. It is deliberately outside supabase/migrations and is NOT an approved replay sequence or a production baseline.

manifest.json records version, name, one original statement-array element per file, and the SHA-256 of PostgreSQL array_to_json(statements)::text. The archive preserves each script byte-for-byte, including final-newline state. Python UTF-8 JSON serialization with ensure_ascii=False and compact separators reproduces that encoding for these scripts. All 22 hashes were checked against the hosted ledger.

The source totals 129,593 characters. Local PostgreSQL grammar parsing succeeded for all scripts. Static AST review found no top-level patient-data INSERTs: the only top-level INSERT configures storage.buckets. A historical UPDATE backfills notification idempotency keys. Two DO blocks alter RLS policy expressions and realtime publication membership. No credential-marker matches were found in the static scan; GitGuardian remains an additional check, not a certification.

## What this resolves

The previously missing staging migration source is now recovered rather than inferred from current function names or a partial schema dump. It includes the initial 14-table reconstruction, trigger attachments, storage configuration and subsequent RLS/audit/notification/reporting changes under their original identities. The historical 9 November reconciliation document describes a then-empty staging project; it is historical evidence, not today's state.

## What remains unresolved

The ledger is not the entire current schema. Prior catalog review identified an existing PHC attachment registration function without a separately named ledger entry. Other unmanaged drift must be checked, and managed Auth/Storage/realtime dependencies are not established by syntax parsing.

Production has a different migration history. Never mark these staging versions as applied to production, overwrite its ledger, or copy staging data into production.

## Safe next rehearsal

1. Build an isolated disposable Supabase-compatible replay harness with the required managed roles, schemas, extensions and publication.
2. Replay this archive in order only in that disposable environment; compare the resulting catalogs with the inspected staging catalogs, including functions, triggers, RLS, table/column grants and managed-service configuration.
3. Reconcile out-of-ledger objects explicitly. Review ownership, broad historical grants, data-preserving changes and storage permissions.
4. Only then assemble a reviewed active migration baseline and rehearse the two new atomic migrations plus authenticated clinical workflows in approved synthetic staging.

Do not run this archive against either hosted project. CI now validates integrity/quarantine and replays the archive only inside a second disposable PostgreSQL database with explicit managed-service stubs. A separate observed-drift overlay matches selected staging schema metadata before atomic candidates are applied. See docs/BASELINE_REPLAY.md for verification and omitted scope. No hosted database, account, patient row, object or deployment was modified during recovery.
