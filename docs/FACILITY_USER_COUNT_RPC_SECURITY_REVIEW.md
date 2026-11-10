# Facility user-count RPC security review

**Review basis:** the read-only production routine snapshot at `docs/catalog_exports/20261107_live_public_routines.md`, the active administrator dashboard source, and the live EXECUTE grant inventory in `docs/BASELINE_FUNCTION_SECURITY_REVIEW.md`.

**Scope:** static source and call-site review. No RPC was invoked, no profile rows were queried, and no database object or privilege was changed.

## Executive finding

The two SECURITY DEFINER functions expose different scopes and must retain distinct authorization contracts:

- `get_facility_user_count(uuid)` returns one facility's profile count. It requires an authenticated user and allows the request only when the caller is an administrator or the caller's own `profiles.facility_id` equals the requested facility. A NULL requested facility is rejected for non-administrators. It uses an empty search path and schema-qualifies `public.profiles`.
- `get_facility_user_counts()` returns counts for every non-NULL facility. It checks the caller's canonical `public.profiles.role` for administrator before returning any rows. A missing profile, unauthenticated caller, or non-administrator fails closed because the role remains NULL or non-administrator.

Both functions have explicit EXECUTE grants for `authenticated` and `service_role` in the captured production ACL snapshot. No anon or PUBLIC grant was recorded. These are point-in-time direct ACLs; verify effective privileges after staging reconstruction.

## Active application call site

The active `AdminDashboard.jsx` calls only `get_facility_user_counts()`, builds a facility-ID-to-count map, and displays the value alongside each facility. Errors clear the counts to an empty map. The reviewed call site does not call the single-facility RPC.

The all-facility RPC is therefore a privileged administrative aggregate, not a general facility-staff endpoint. Do not broaden its grants or relax its role check to support facility staff. If a facility-scoped dashboard later needs its own count, use the single-facility RPC and test caller/facility binding.

## Required staging tests

1. `get_facility_user_counts()`: unauthenticated, no-profile, PHC staff, receiving staff, and administrator.
2. `get_facility_user_count(uuid)`: unauthenticated, no-profile, same-facility PHC/receiving staff, cross-facility staff, administrator, NULL facility, and unknown facility.
3. Verify a caller cannot obtain another facility's count by changing the UUID argument.
4. Verify effective EXECUTE privileges for anon, authenticated, and service_role; do not infer access solely from direct ACL text.
5. Confirm count semantics against product requirements: whether disabled, suspended, or archived profiles should be included. The current function counts every profile row matching `facility_id`; no active-status filter appears in its definition.
6. Confirm the RPC outputs remain aggregate-only and do not return profile identifiers or other profile attributes.

## Release disposition

**No source change or migration is justified from this static review alone.** The observed authorization checks are appropriately narrow for their respective scopes. The remaining work is staging integration testing and a product decision about whether the displayed count should include inactive accounts. Preserve both existing authenticated grants until call-site and policy dependency checks are complete.

Production remains read-only. Do not deploy, alter grants, or replace either function on the basis of this review alone.
