# REFLINK production schema-only export runbook

**Purpose:** obtain a reviewed, data-free schema artifact for baseline reconstruction.
**Source:** production Supabase project `uwwzbljufqbzkjflpnll`.
**Destination:** owner-controlled secure local workspace, then reviewed/sanitized repository artifact if approved.
**Target:** isolated synthetic staging project `rcskuzmvyugbanygizri`.
**Production change policy:** read-only. Do not apply migrations, repair migration history, run DDL, change Auth settings or create test records in production.

## 1. Required operator and handling

The database owner or an authorized operator with approved read access must run the export in a trusted local environment. Do not paste the database connection string, database password, Supabase access token, service-role key or any secret into ChatGPT, GitHub issues, commits, logs or chat.

Use a protected local shell session. Keep the connection string in an environment variable populated from the approved secret manager or secure password prompt. Do not place it directly in shell history or a committed file.

## 2. Export the default application schema

The current Supabase CLI documentation describes `supabase db dump` as a remote schema dump. By default it exports schema definitions, not table data or custom roles. It uses Supabase-specific filtering and excludes managed schemas including `auth`, `storage` and extension-created schemas.

After installing/using an approved current Supabase CLI version and confirming the CLI help for the installed version, run:

```bash
supabase db dump --db-url "$REFLINK_PROD_DB_URL" -f reflink-production-schema.sql
```

This command is an export only. It must not be replaced with `supabase db pull` against production: the documented `db pull` workflow creates a migration and records it in the remote migration history, which would violate this workstream's production read-only gate.

The default dump is not automatically a complete REFLINK restoration baseline because managed schemas and extension-owned schemas are filtered. Do not apply this file to staging until it has been reviewed and its exclusions/dependencies are resolved.

## 3. Additional metadata required

Alongside the default schema dump, collect a separate metadata-only inventory for:

- PostgreSQL version and installed extension names/versions.
- All application-owned schemas and their object definitions.
- Auth customizations only: custom triggers/functions/policies or other owner-created objects in `auth`; do not export Auth user rows or credentials.
- Storage policy definitions and bucket configuration only; do not export storage objects, object names if they may be sensitive, or file contents.
- All application types/enums/domains, sequences, functions, triggers, views/materialized views, constraints, indexes, RLS flags and policies, ownership, grants/default privileges, publications and other application dependencies.
- All migration-ledger versions and their timestamps, without altering the ledger.
- Supabase Auth configuration relevant to sign-in/password policy, MFA, sessions and redirect allowlists, recorded as settings metadata only; do not export secrets.

The existing catalog files under `docs/catalog_exports/` are useful partial evidence but are not a substitute for this export. Any separate managed-schema export method must be checked against the current Supabase documentation and reviewed to exclude Supabase-owned internals. Do not blindly dump or restore all of `auth`, `storage`, or extension schemas.

## 4. Data and secret exclusion checklist

Before sharing or committing any export, inspect it and verify it contains none of the following:

- `INSERT`, `COPY` or other table-row payloads.
- Patient identifiers, clinical narratives, diagnoses, contact details or referral records.
- Auth user records, password hashes, refresh tokens, MFA secrets or session contents.
- Storage object contents or sensitive object paths.
- Database passwords, JWT signing secrets, API keys, service-role keys, OAuth secrets or provider credentials.
- Production environment variable values.

Schema definitions may still reveal sensitive internal names or security design. Treat the raw export as confidential until the owner approves a sanitized artifact for source control. Keep an immutable private copy for provenance and record a SHA-256 checksum.

## 5. Validation before staging restore

1. Confirm the dump is schema-only and contains no row data.
2. Record CLI version, export timestamp, source project reference and checksum.
3. Compare every object against the existing catalog snapshots and the eight proposed migrations.
4. Identify Supabase-managed objects, extension dependencies and environment-specific statements.
5. Review ownership, ACLs, default privileges, RLS policies, SECURITY DEFINER functions and view security semantics.
6. Identify custom Auth triggers and Storage policies without copying users or files.
7. Check whether the historical migration `20260928203447_reflink_v2_rural_first` can be recovered from an owner-held archive. Do not invent it or mark it applied to make histories match.
8. Construct a separately reviewed baseline migration only after the object inventory is complete and dependency order is understood.
9. Restore/replay into the isolated staging project only after an explicit review of the generated SQL and a confirmed rollback/recreate plan.
10. Verify all objects, ACLs, RLS policies, advisor findings and synthetic integration tests after restore.

## 6. Current block and handoff

No direct database-export capability is exposed through the connected Supabase tools in this workspace. The operator must therefore run the approved CLI export locally and provide the schema-only artifact through the secure project/file workflow. Do not provide connection credentials in chat.

Until the artifact is received and reviewed:
- production remains read-only;
- staging remains empty;
- no Auth test users or synthetic application rows are created;
- none of the eight proposed migrations is applied;
- no production Auth, RLS, grant, trigger or function setting is changed.

## 7. Official documentation

- [Supabase CLI: db dump](https://supabase.com/docs/reference/cli/supabase-db-dump)
- [Supabase local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase database migrations](https://supabase.com/docs/guides/local-development/database-migrations)
