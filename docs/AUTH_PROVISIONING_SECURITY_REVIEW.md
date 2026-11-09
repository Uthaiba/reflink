# REFLINK Auth Provisioning and Initial-Role Security Review

**Review date:** 9 November 2026  
**Production project:** `Reflink` (`uwwzbljufqbzkjflpnll`)  
**Synthetic staging project:** `reflink-synthetic-staging` (`rcskuzmvyugbanygizri`)  
**Scope:** read-only PostgreSQL catalog inspection and repository source review.  
**Changes applied:** none to either database.

## Executive finding

The public function `public.handle_new_user()` exists in production, but there is no non-internal trigger attached to `auth.users` in either production or synthetic staging. The function is therefore not currently invoked by the expected Auth-user insert trigger path.

The function is security-sensitive. It is declared `SECURITY DEFINER`, owned by `postgres`, has `search_path = public`, and inserts a profile with the hard-coded role `phc_staff`. If a trigger were attached without changing this design, every newly provisioned Auth user handled by it would be assigned PHC staff, with no facility assignment in the inserted profile fields. This is not an acceptable default authorization policy for a multi-role healthcare referral system.

## Production catalog evidence

Read-only query of `pg_proc`, `pg_trigger`, and function ACLs confirmed:

| Attribute | Observed value |
|---|---|
| Function | `public.handle_new_user()` |
| Owner | `postgres` |
| Security mode | `SECURITY DEFINER` |
| Function search path | `public` |
| Auth trigger on `auth.users` | None |
| Direct EXECUTE grantees | `postgres`, `service_role` |
| EXECUTE granted to | No `anon`, `authenticated`, or `PUBLIC` entry observed |

Function body behavior:
- Inserts `NEW.id` into `public.profiles.id`.
- Takes full name and phone from Auth user metadata, with a fallback display name.
- Hard-codes `role = 'phc_staff'`.
- Does not set `facility_id` or require an administrator approval workflow.

The function body must not be attached to `auth.users` in its current form.

## Staging catalog evidence

The same read-only query against the isolated synthetic staging project found no non-internal trigger in schema `auth`. Staging is therefore not missing a known production Auth trigger: production itself has no such trigger attachment.

This corrects the earlier assumption that a production Auth trigger existed and merely needed to be copied to staging. No trigger should be invented or attached based on the function name.

## Application source review

This finding does **not** mean REFLINK has no account-provisioning workflow. The canonical AdminDashboard invokes the `create-user` Supabase Edge Function. The deployed production function is ACTIVE version 2 with JWT verification enabled, while the repository contains a hardened candidate whose release is separately gated. See `docs/IDENTITY_AND_ACCOUNT_PROVISIONING_RECONCILIATION.md` and `docs/ACCOUNT_PROVISIONING_RELEASE_RUNBOOK.md` for the deployed-versus-source comparison and release acceptance criteria.

- `src/App.jsx` uses `supabase.auth.signInWithPassword()` for the visible login flow and then loads the matching `profiles` row.
- No `signUp()` flow was found in the reviewed `src/App.jsx` authentication section.
- `src/UserManagement.jsx` inserts administrative user metadata into `public.users`; this is not the same as creating an Auth identity or a `public.profiles` row.
- REFLINK maintains both `public.users` and `public.profiles`. Their distinct purposes and synchronization contract need to be documented and tested before user provisioning is redesigned.

## Required target design

1. Keep public self-registration disabled unless there is a documented business requirement.
2. Provision Auth identities through a trusted administrator-controlled workflow.
3. Assign an initial role only from a server-side allowlist after validating the administrator's authority.
4. Require an explicit facility assignment for PHC and receiving staff where applicable.
5. Do not trust user-editable Auth metadata to set application roles or facility scope.
6. Replace the current `SECURITY DEFINER SET search_path = public` pattern with a reviewed function design: fully qualify all non-system references, pin a safe search path (preferably empty), and minimize grants.
7. Preserve the distinction between Auth identity, `profiles` authorization profile, and `users` administrative directory until a migration plan and compatibility tests are approved.
8. Test onboarding and role changes with synthetic accounts, including unauthorized attempts to self-assign administrator, PHC staff, and receiving staff roles.

## Acceptance tests

- No anonymous or authenticated caller can invoke privileged provisioning directly.
- A newly created Auth identity receives no operational role until a trusted administrator assigns one.
- PHC staff cannot be provisioned without a valid referring facility assignment.
- Receiving staff cannot be provisioned without a valid receiving facility assignment.
- No user can set or change their own role or facility through editable metadata.
- Provisioning creates exactly one coherent Auth identity and authorization profile; duplicate retries are idempotent.
- Deactivation disables access without deleting referral provenance or audit history.
- All role changes are auditable and restricted to authorized administrators.

## Decision

**NO-GO for attaching the current `handle_new_user()` function to `auth.users`.** The current function would grant the wrong default role and has an unsafe search-path configuration for a privileged function. No database changes were made. Implement a new, explicitly authorized provisioning design only after staging baseline reconstruction and role-matrix tests.
