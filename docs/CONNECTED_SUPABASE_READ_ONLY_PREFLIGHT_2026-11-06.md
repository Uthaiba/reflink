# Connected Supabase read-only preflight — 6 November 2026

**Environment:** Supabase project `Reflink` (`uwwzbljufqbzkjflpnll`), PostgreSQL 17.6, region `eu-west-1`.

**Execution mode:** read-only catalog inspection, migration-ledger listing, table metadata listing and Supabase advisors. No patient rows, auth users, secrets, message bodies or provider payloads were queried. No database, Auth, Edge Function, migration-ledger or deployment setting was changed.

## 1. Migration history and environment state

The connected project migration ledger contains exactly one recorded migration:

- `20260928203447_reflink_v2_rural_first`

The security-remediation branch contains seven later SQL source migrations dated 5–6 November 2026. They are not recorded in the connected project's migration ledger. This is a material baseline discrepancy; it is not safe to apply the seven files directly or to mark them as applied without a schema/object reconciliation.

The Supabase project has one listed branch named `main` with `persistent=false` and `with_data=false`. This inspection did not establish that it is an approved disposable staging target or that it has the required migration baseline. No new branch/project was created because branch/project creation may incur charges and requires the user to select/confirm the intended organization and cost.

## 2. Notification-specific live catalog evidence

The read-only catalog query found:

- `public.referral_notifications` exists and has RLS enabled.
- It is a legacy delivery-log structure with `notification_type`, `channel` (`sms` / `dashboard`), `recipient_phone`, provider identifiers, status and timestamps.
- No `private.notification_outbox`, `private.notification_attempts`, `public.notification_inbox`, or notification worker/claim/settlement RPC was found by the notification/outbox catalog search.
- The only deployed Edge Function listed is `create-user`; no notification worker function is deployed.
- The existing `profiles` table has `id`, `role`, `facility_id`, contact/profile fields and timestamps. The inspected schema does not establish active/on-call or notification-duty assignment.
- The existing `facilities` table has a facility notification phone field, but this is a facility-level destination and cannot be treated as an individual inbox recipient.

The existing `public.referral_notifications` table must not be reused as the user-owned inbox without a separate reviewed migration and explicit ownership/read-state contract. Its delivery log and phone/provider fields have a different purpose and privacy profile.

## 3. Current security advisor findings

The Supabase Security Advisor returned these findings:

### Warnings

- Five exposed `SECURITY DEFINER` functions are executable by `authenticated`: `get_facility_user_count(uuid)`, `get_facility_user_counts()`, `is_administrator()`, `log_referral_print(uuid,text)`, and `log_referral_read(uuid)`.
- Leaked-password protection is disabled in Supabase Auth.
- RLS is enabled but no policies exist on `public.referral_events` and `public.referral_feedback`.

These require individual function-body, grant, caller and workflow review. Do not blindly switch all functions to `SECURITY INVOKER` or add broad RLS policies: some functions may intentionally perform a narrow privileged action, and the correct access policy depends on the clinical workflow. Auth leaked-password protection is an Auth configuration change and must be scheduled through a reviewed security change.

### Performance advisor findings

- Sixteen unindexed foreign keys.
- Seventeen RLS policies that may re-evaluate auth functions per row.
- Four tables with multiple permissive policies for the same role/action.
- Five indexes currently reported unused.

These are not notification-specific release blockers, but they should enter the security/performance backlog. Do not drop unused indexes or rewrite policies without workload and semantic verification.

## 4. Notification release decision

**Do not deploy or activate the notification worker yet.**

The following dependencies are not satisfied:

1. The migration baseline is reconciled against the connected project.
2. A confirmed synthetic-data staging environment is available.
3. The recipient-duty assignment source and ownership rules are approved.
4. A separate user-owned inbox table and owner-scoped RLS policy exist.
5. The mark-read RPC exists and is verified as authenticated-owner-only, non-enumerating and idempotent.
6. The worker's server-only authentication, claim fencing, recipient revalidation, retry policy and provider behavior pass integration tests.
7. Referral enqueueing is transactional and idempotent without blocking referral workflows when no eligible recipient exists.
8. Provider credentials, consent/contact rules and SMS template content are reviewed before any SMS channel is enabled.

The source-level adapter and architecture documents are not evidence of database readiness. Keep the adapter unwired and keep the proposed acknowledgement-trigger migration unapplied.

## 5. Next safe execution sequence

1. Confirm the organization and cost approval for a disposable Supabase branch/project.
2. Obtain a schema-only baseline comparison (no patient data) between the live project, the production release and the seven unrecorded source migrations.
3. Reconstruct a clean migration sequence in the disposable environment.
4. Design and approve a facility notification-duty assignment model before generating recipients.
5. Implement the inbox/RLS/RPC and worker only against synthetic data.
6. Test transaction rollback, event deduplication, concurrent claims, expired leases, stale claim tokens, assignment revocation, recipient ownership and provider timeout ambiguity.
7. Run Supabase Security Advisor and the full REFLINK CI suite.
8. Obtain database, privacy/security and clinical governance approval before a separate production release decision.

## 6. Explicit non-actions

This preflight did not:
- alter production schema, data, policies, grants or migration history;
- create a Supabase project or branch;
- deploy an Edge Function or schedule a worker;
- enable SMS or call Twilio;
- change Auth password policy;
- query or export patient-level records.
