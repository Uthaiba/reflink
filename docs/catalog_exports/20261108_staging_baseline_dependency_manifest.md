# Staging Baseline Dependency Manifest

**Source:** `reflink-production-schema.sql`  
**SHA-256:** `72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3`  
**Target:** `reflink-synthetic-staging` (`rcskuzmvyugbanygizri`)  
**Status:** Inventory only; no DDL applied.

## Verified object counts

| Object | Count |
|---|---:|
| Public tables | 14 |
| Public functions | 16 |
| Public views | 2 |
| Explicit indexes | 10 |
| Foreign keys | 23 |
| `CREATE TRIGGER` statements in schema export | 0 |
| Live public trigger attachments in supplemental catalog snapshot | 9 |
| RLS policies | 30 |
| Grant/revoke statements | 73 |
| Default privilege statements | 9 |

All 14 exported public tables have RLS enabled in the export. There are no standalone table-data INSERT/COPY statements.

## Dependency groups

| Dependency | Evidence | Staging status | Required action |
|---|---|---|---|
| PostgreSQL | Export targets PostgreSQL objects; prior production inventory is PG17 | PG17.11.0.018 | Dry-run and validate |
| `auth` schema / `auth.uid()` | Policies/functions reference managed Auth objects | `auth` schema exists; owned by `supabase_admin` | Confirm function presence/signatures before restore |
| `anon`, `authenticated`, `service_role` | Explicit ACL and policy targets | All exist; `service_role` has BYPASSRLS; anon/authenticated do not | Preserve managed roles; verify only required memberships |
| `postgres` | Object owner and default ACL target | Exists; BYPASSRLS, CREATEROLE, CREATEDB | Confirm execution context before ownership statements |
| `pg_database_owner` | Public schema owner | Exists; owns staging `public` schema | Keep managed schema ownership |
| `pgcrypto` 1.3 | UUID default function dependency | Installed 1.3 in `extensions` | Confirm resolution |
| `uuid-ossp` 1.1 | Installed in production; no clear direct use identified in inspected excerpt | Installed 1.1 in `extensions` | Do not assume needed |
| `plpgsql` 1.0 | PL/pgSQL functions | Installed 1.0 | Available |
| Auth signup trigger | `handle_new_user()` SECURITY DEFINER function; no Auth trigger DDL in export | No non-internal trigger on staging `auth.users` | Do not attach without a separately approved Auth provisioning design |
| Views | Analytics view includes patient identifier and diagnosis data | Export is service-role-only | Preserve narrow grants; review security mode |
| Default ACLs | Dump includes only `postgres`; live production catalog showed `postgres` and `supabase_admin` | Staging also has broad defaults for both roles on tables, sequences, functions | Reconcile to least privilege; do not blindly replay |

## Export characteristics

- Initial session settings include `row_security = off`, empty search path, disabled function-body checks, and zero timeouts. These settings must not be copied uncritically into a manually executed staging script.
- Schema owner is `pg_database_owner`; table/function owners are generally `postgres`.
- Identity sequences exist for `audit_log.id` and `referral_print_events.id`.
- `gen_random_uuid()` is used as a table-column default.
- The dump does not include extension creation statements.
- The export references Supabase-managed Auth functions and roles and cannot bootstrap them.
- The dump does not recreate Storage, Realtime, Auth configuration, secrets, or edge functions.

## Function security review from export

Static inspection of the 16 function definitions found 10 declared `SECURITY DEFINER` and 6 without that attribute. This is source-text inventory, not a PostgreSQL parser or behavioral security test.

| Function | Security mode | Declared search_path | Restore review |
|---|---|---|---|
| `audit_referral_mutation` | DEFINER | `public` | High priority: audit writer; review object qualification and PHI minimization |
| `get_facility_user_count` | DEFINER | empty | Review authorization and fully qualified references |
| `get_facility_user_counts` | DEFINER | `public` | High priority: review admin authorization and public-schema name resolution |
| `get_referral_analytics_summary` | DEFINER | `public` | High priority: aggregate disclosure controls and schema qualification |
| `handle_new_user` | DEFINER | `public` | High priority: Auth trigger function; no matching staging Auth trigger exists |
| `is_administrator` | DEFINER | `public` | High priority: authorization primitive used by RLS |
| `is_current_user_administrator` | DEFINER | `public` | High priority: authorization primitive; confirm intended caller |
| `log_referral_print` | DEFINER | `public` | Review caller authorization and print-number concurrency |
| `log_referral_read` | DEFINER | `public` | Review caller authorization and audit/event data |
| `log_referral_status_change` | DEFINER | `public` | High priority: trigger writer and privilege boundary |
| `guard_profile_security_fields` | INVOKER | empty | Preserve invoker semantics; test protected profile fields |
| `require_counter_referral_before_completion` | INVOKER | `public` | Preserve invoker semantics; test transition guard |
| `set_referral_ack_due_at` | INVOKER | `public` | Preserve invoker semantics; test acknowledgement deadline |
| `update_referral_draft_timestamp` | INVOKER | empty | Preserve invoker semantics; test timestamp behavior |
| `validate_referral_entry` | INVOKER | `public` | Preserve invoker semantics; test validation constraints |
| `validate_referral_status_transition` | INVOKER | empty | Preserve invoker semantics; test transition matrix |

**Security blocker:** Nine of the ten SECURITY DEFINER functions declare `search_path = public`; only `get_facility_user_count` declares an empty search path. This is not automatically proof of exploitability, but it is a material name-resolution hardening concern. Before restore, inspect every body for unqualified relation/function/type references and either (a) qualify all non-system objects and pin a safe search path (typically empty), or (b) document a justified alternative. Do not mechanically rewrite function bodies without regression tests. Preserve invoker/definer mode and intended EXECUTE grants.

## Security-sensitive objects

- `public.referral_analytics` exposes patient identifiers and clinical fields; explicit grant is service-role-only.
- `public.referral_analytics_summary` is service-role-only.
- Multiple SECURITY DEFINER functions are owned by `postgres`; verify body, search path, auth checks, and EXECUTE grants.
- `public.audit_log` contains OLD/NEW row JSON; test for PHI duplication and protect read access.
- `profiles` and `users` both exist; authoritative identity model needs explicit documentation.
- `referral_events` and `referral_feedback` have RLS enabled but no policies in the export; expected behavior is fail-closed.

## Trigger provenance

The supplied schema export contains zero `CREATE TRIGGER` statements. The nine live public trigger attachments were recovered separately from the production catalog and recorded in `docs/catalog_exports/20261109_live_public_trigger_snapshot.sql`. Treat that snapshot as supplemental evidence requiring its own review; do not attribute those trigger definitions to the supplied schema export. It does not establish or authorize an Auth trigger on `auth.users`.

## Read-only verifier execution, 2026-11-08

The committed SELECT-only script `supabase/verification/staging_baseline_catalog_verification.sql` was executed against staging. It returned zero public tables, functions, views, indexes, foreign keys, triggers, and policies, as expected for the empty baseline target. It also confirmed no RLS-enabled public tables (because no tables exist), no non-internal Auth user triggers, and six broad default ACL entries covering tables, sequences, and functions for both `postgres` and `supabase_admin`. The zero-object comparison flags are expected pre-restore and are not acceptance passes.\n\n## Staging observation, 2026-11-08

- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: `17.11.0.018`.
- Public tables: none.
- Migration ledger: empty.
- Installed versions: `pgcrypto 1.3`, `uuid-ossp 1.1`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `pg_stat_statements 1.11`.

See [STAGING_BASELINE_RECONSTRUCTION_RUNBOOK.md](../STAGING_BASELINE_RECONSTRUCTION_RUNBOOK.md) for preflight gates and execution controls.
