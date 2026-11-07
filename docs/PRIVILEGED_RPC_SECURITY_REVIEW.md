# REFLINK — Privileged RPC and Security Advisor Review

**Review date:** 5 November 2026  
**Environment:** Connected Supabase production project  
**Method:** Read-only advisor and PostgreSQL catalog inspection  
**No changes:** No function, grant, RLS policy, Auth setting, table, patient record or production configuration was modified.

## Current advisor findings

The Supabase security advisor returned:

| Finding | Count | Severity | Tables/functions |
|---|---:|---|---|
| RLS enabled without policy | 2 | INFO | `public.referral_events`, `public.referral_feedback` |
| Authenticated users can execute SECURITY DEFINER functions | 5 | WARN | `get_facility_user_count`, `get_facility_user_counts`, `is_administrator`, `log_referral_print`, `log_referral_read` |
| Leaked-password protection disabled | 1 | WARN | Supabase Auth |

Advisor remediation references:
- [RLS enabled without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Authenticated SECURITY DEFINER functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

These findings require risk-based review. A SECURITY DEFINER function callable by authenticated users is not automatically exploitable: its body, owner privileges, grants, caller validation and data returned must be evaluated.

## Function-level observations

All five functions inspected are owned by `postgres`, use SECURITY DEFINER, and grant EXECUTE to `authenticated` and `service_role`. The following observations come from the current function definitions and ACLs.

### `get_facility_user_count(uuid)`

- Sets an empty search_path.
- Requires `auth.uid()`.
- Reads the caller's profile role and facility.
- Allows administrators to request any facility count; non-administrators can request only their own facility count.
- Returns a count, not user identities.
- Review remaining risks: whether inactive users should be counted, whether callers can enumerate facility UUIDs, and whether the count is necessary for each role.

### `get_facility_user_counts()`

- Uses `search_path=public`.
- Checks caller profile role for administrator before returning grouped facility counts.
- Returns facility IDs and user counts.
- Review: use an empty/fixed search_path and schema-qualified objects; confirm only administrators need this endpoint; consider whether facility IDs/counts should be exposed through a narrower admin-only service.

### `is_administrator()`

- Uses `search_path=public`.
- Checks `profiles.id = auth.uid()` and `role = 'administrator'`.
- Returns a boolean and does not return profile data.
- The helper is used by other database functions/policies. Do not revoke authenticated EXECUTE without first mapping dependencies and replacing callers. Consider a hardened helper definition and dependency tests.

### `log_referral_print(uuid,text)`

- Uses `search_path=public`.
- Checks whether the caller is an administrator, the referring user, or belongs to the receiving facility.
- Inserts a print-event record and returns the next print number.
- Review: verify receiving-facility assignment is sufficient for the intended referral state and role; verify `auth.uid()` is non-null; validate copy-label length and allowed values; ensure concurrent print operations cannot allocate duplicate sequence numbers.

### `log_referral_read(uuid)`

- Uses `search_path=public`.
- Checks whether the caller is an administrator, the referring user, or belongs to the receiving facility.
- Inserts a READ audit event.
- Review: verify the receiving-facility condition includes the intended role and assignment lifecycle; verify `auth.uid()` is non-null; consider audit-log volume, retention, and whether the read event can itself reveal sensitive referral IDs to callers.

## Migration governance observation

The connected database migration history currently contains one entry: `20260928203447_reflink_v2_rural_first`. The development branch has proposed SQL migration files, but the live history does not show them as applied. Do not apply the proposed migration until the source-controlled baseline is reconciled and a verified non-production environment is available.

## Recommended remediation order

1. Review and document dependencies on `is_administrator()`; do not break policies or RPCs by revoking it blindly.
2. Harden the SECURITY DEFINER functions one at a time: fixed search_path, schema-qualified objects, explicit caller checks, least-privilege grants, input validation and safe concurrency.
3. Review role and facility assignment semantics for print/read audit RPCs with clinical operations.
4. Determine intended use of `referral_events` and `referral_feedback`; create narrow RLS policies only if their access model is known. Otherwise keep them inaccessible and document their status.
5. Enable leaked-password protection through the approved Supabase Auth configuration process after assessing user impact and rollout communications.
6. Run RLS, RPC privilege, role-boundary, concurrency and audit tests using synthetic identities in non-production.
7. Re-run security and performance advisors after approved changes.

## Explicitly not done

- No SECURITY DEFINER function was altered or revoked.
- No RLS policy was created or removed.
- No Auth setting was changed.
- No migration was applied.
- No patient-level data was queried.
- No production deployment was made.

The proposed R-PHI aggregate RPC is also subject to the same function review before it can be deployed.