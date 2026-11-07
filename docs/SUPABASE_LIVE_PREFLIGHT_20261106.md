# REFLINK Live Supabase Preflight — 6 November 2026

**Scope:** Read-only project metadata, migration ledger, catalog inventory and Supabase advisors. No SQL DDL, migration application, auth configuration, provider dispatch or patient-row reads were performed.

## 1. Connected project identity

- Supabase project: `Reflink`
- Project ref: `uwwzbljufqbzkjflpnll`
- Region: `eu-west-1`
- PostgreSQL: `17.6.1.166`
- Project status at inspection: `ACTIVE_HEALTHY`
- Linked organization ID: `kczzvburxzfubiqhpcxd`

The account also exposes a separate `afuwa-hims` project under a different organization. It was not selected or modified.

## 2. Migration ledger finding

The connected Reflink database reports exactly one recorded migration:

- `20260928203447_reflink_v2_rural_first`

The security-remediation branch contains seven later migration files dated 5–6 November 2026. The remote migration ledger does not record those versions. This is migration drift / incomplete history evidence, not proof that every referenced object is absent. Do not replay or mark migrations applied until the source-to-catalog comparison and baseline strategy are reviewed.

## 3. Notification object finding

A read-only catalog query found:

- Existing `public.referral_notifications` table with RLS enabled.
- No `private.notification_outbox` table.
- No `private.notification_attempts` table.
- No public/private notification enqueue, claim, finish or inbox RPCs in the inspected catalog.

The existing referral notification table is not equivalent to the proposed outbox or user-owned inbox. The adapter's relation and mark-read RPC are not live.

## 4. Existing identity and workflow model

The catalog inventory confirms:

- `public.profiles` includes `id`, `role`, and `facility_id`; supported roles include `phc_staff`, `receiving_staff`, and `administrator`.
- No verified active/on-call/notification-duty assignment field was found in the inspected profile columns.
- `public.facilities` includes a facility notification phone, but that does not identify a responsible individual recipient.
- `public.referrals` includes `status`, `ack_due_at`, `acknowledged_at`, and `receiving_facility_id`.

Therefore role + facility membership is not sufficient authority to choose a user notification recipient. Facility phone routing and individual inbox ownership remain distinct recipient types.

## 5. Edge Function inventory

The connected project lists only the existing `create-user` Edge Function. No notification worker function was found. No scheduled worker or provider dispatch mechanism was verified.

## 6. Security advisor findings

The Supabase security advisor returned these findings:

### Warnings
- Five exposed `SECURITY DEFINER` functions are executable by authenticated users: `get_facility_user_count(uuid)`, `get_facility_user_counts()`, `is_administrator()`, `log_referral_print(uuid,text)`, and `log_referral_read(uuid)`. Each requires function-body, ownership, grant and caller review before changing privileges. Do not revoke or rewrite blindly because application dependencies may rely on them.
- Leaked-password protection is disabled. This is an Auth configuration item and requires an approved configuration change.

### Informational
- `public.referral_events` and `public.referral_feedback` have RLS enabled but no policies. Verify intended access and whether these tables should remain inaccessible to browser roles.

### Performance advisor
The advisor also reports 16 unindexed foreign keys, 17 RLS init-plan findings, multiple permissive policies and five unused indexes. These are separate backlog items; no index or policy was changed during this preflight.

## 7. Non-production environment gate

The connected Supabase project currently lists one non-persistent, data-free development branch named `main`; it is not an established synthetic-data integration environment for this work. A dedicated branch/project must be created or designated, and its cost and organization must be confirmed before provisioning. No new branch was created during this preflight.

## 8. Decisions and next safe steps

1. Keep all seven unrecorded migrations unapplied to production.
2. Do not enable user-addressed notification enqueue until an authoritative notification-duty roster/assignment source and eligibility rule are approved. The current acknowledgement-hook migration is cancellation-only; it does not fan out to receiving-staff profiles. Keep it unapplied until migration-baseline reconciliation and synthetic-data staging validation are complete.
3. Do not mount the inbox adapter until an approved inbox migration, owner-only RLS and mark-read RPC have passed isolated database tests.
4. Do not deploy a worker until recipient identity, consent/contact policy, retry/timeout semantics, provider sandbox and schedule are approved and tested.
5. Review the five SECURITY DEFINER findings and two RLS-without-policy findings independently; preserve current application behavior while proving authorization requirements.
6. Enable leaked-password protection only through a separately reviewed Auth configuration change.
7. Build a schema-only baseline and synthetic-data integration environment before attempting the migration chain.

**Preflight conclusion:** production migration, inbox activation and notification dispatch remain blocked. This is based on observed live catalog/ledger state, not merely missing repository files.
