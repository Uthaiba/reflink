# REFLINK production schema reconciliation — 10 November 2026

## Scope and safety boundary

This is a read-only reconciliation of the owner-supplied schema export against the separate trigger snapshot and live production PostgreSQL catalog. It is evidence for the synthetic staging baseline only. No production DDL, grants, settings, patient rows or Auth records were changed. No staging migration was applied.

## Source-file integrity

- The two uploaded files `reflink-production-schema.sql` and `reflink-production-schema(1).sql` are byte-identical.
- Each is 64,434 bytes and 1,612 lines.
- SHA-256: `72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3`.
- The committed repository copy is `docs/catalog_exports/reflink-production-schema.sql`.

## Trigger reconciliation — matched

The owner-supplied schema export contains **nine** `CREATE OR REPLACE TRIGGER` statements. This corrects the earlier handoff statement that the export contained zero triggers.

All nine trigger names and definitions were compared with:
1. `docs/catalog_exports/20261109_live_public_trigger_snapshot.sql`, and
2. a fresh read-only query of `pg_trigger`, `pg_class`, `pg_namespace` and `pg_proc` on production.

The three sources agree on all nine trigger attachments:

- `counter_referrals_audit_mutation`
- `guard_profile_security_fields`
- `referral_draft_updated_at`
- `referral_ack_due_at_trigger`
- `referral_counter_referral_guard`
- `referral_entry_validation_trigger`
- `referral_status_audit_trigger`
- `referral_status_transition_validation`
- `referrals_audit_mutation`

**Staging implication:** use the trigger definitions from the schema export as the canonical baseline. Retain the separate snapshot as independent evidence; do not apply both files as migrations, which would attempt duplicate trigger creation. Verify trigger/function ordering in the staging migration plan.

## Default ACL reconciliation — incomplete export

The schema export contains nine `ALTER DEFAULT PRIVILEGES` statements, all for owner role `postgres`. They grant broad default privileges on future sequences and tables to `anon`, `authenticated` and `service_role` (plus owner privileges); it also grants default function privileges to `postgres`.

A fresh read-only production catalog query of `pg_default_acl` found entries for **both** `postgres` and `supabase_admin` in the public schema:

- `postgres`: sequence, function and table defaults.
- `supabase_admin`: sequence, function and table defaults.
- The live `supabase_admin` defaults include privileges for `anon`, `authenticated` and `service_role`, and are **not represented** in the supplied export.

Therefore the export is not a complete representation of production default ACL state. The staging baseline must not silently reproduce these broad browser-role defaults. Define explicit least-privilege staging defaults and document the deliberate divergence. Do not apply a blanket revoke to production.

## Audit-log ACL finding — confirmed

A fresh read-only catalog expansion of the live `public.audit_log` ACL confirms that `authenticated` has:

- SELECT
- REFERENCES
- TRIGGER
- TRUNCATE
- MAINTAIN

The export expresses these same five privileges for `authenticated`. RLS does not protect against TRUNCATE and does not make REFERENCES, TRIGGER or MAINTAIN appropriate browser-role privileges. The staging target should remove these structural privileges from browser roles and grant only the minimum access required by reviewed server-side audit workflows. Preserve owner and service-role requirements deliberately.

## Other baseline facts

- The export contains 14 public tables, 16 public functions, 2 public views, 30 public policies, 10 explicit indexes and 23 foreign-key constraints.
- Production currently has 14 public tables and one recorded migration (`20260928203447_reflink_v2_rural_first`).
- Synthetic staging currently has zero public tables and zero recorded migrations.
- These facts do not establish that every production object, extension, Auth setting, Storage policy, Realtime publication or non-public schema is represented by the public-schema export.

## Next controlled steps

1. Complete a read-only inventory of extensions, non-public schemas, Auth/Storage/Realtime configuration and relevant grants.
2. Build a staging-only baseline that incorporates the 14 tables, functions, views, constraints, indexes, policies and the nine matched triggers.
3. Use explicit least-privilege grants and default ACLs; do not import the broad production defaults.
4. Review SECURITY DEFINER functions, search_path, ownership and execute privileges before applying.
5. Apply only to the empty synthetic staging project after SQL review.
6. Verify the resulting PostgreSQL catalogs and execute synthetic PHC, receiving-facility, wrong-facility and administrator tests.

**Status:** trigger reconciliation complete; default ACL discrepancy identified; staging migration not yet prepared or applied; production remains read-only.
