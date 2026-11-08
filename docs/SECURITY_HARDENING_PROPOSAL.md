# REFLINK Database Security Hardening Proposal

**Status: source-level proposal only — NOT an executable migration and NOT applied.**  
**Target:** isolated synthetic staging only, after the schema baseline is reconstructed and reviewed.  
**Production:** read-only; no grants, defaults, RLS, functions, Auth settings or data were changed.

## 1. Evidence captured

Read-only catalog checks against the linked production project on 8 November 2026 established:

- PostgreSQL 17.6.1.166.
- `public.audit_log` is owned by `postgres`; its current ACL includes `authenticated=rDxtm` (SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) in addition to owner privileges. RLS does not constrain TRUNCATE.
- Default ACLs for objects created by **both** `postgres` and `supabase_admin` in `public` are broad. Future tables and sequences are granted to browser roles; functions created by `supabase_admin` also receive browser-role EXECUTE.
- A direct `pg_auth_members` inspection found `postgres` has membership in several roles, including `anon`, `authenticated`, and `service_role`, but **no membership in `supabase_admin`**. Therefore, a migration executed as `postgres` cannot be assumed able to alter `supabase_admin`'s default privileges.
- Existing public routines have individually varied grants. Several are intentionally callable by authenticated users, including `is_administrator()`, `log_referral_print()`, and `log_referral_read()`. Do not blanket-revoke function execution.
- Existing referral and counter-referral audit triggers write to `audit_log`. The exact trigger write path and table-level INSERT/UPDATE/DELETE requirements must be preserved and tested.
- The platform-managed Storage default ACLs are out of scope.

## 2. Intended security outcome

1. Browser roles receive no `TRUNCATE`, `REFERENCES`, `TRIGGER` or `MAINTAIN` on `public.audit_log`.
2. Administrator-only audit SELECT remains governed by the existing RLS policy. Do not add a new broad SELECT policy.
3. Trusted trigger execution and the service-role operational path continue to write audit records. Confirm actual writer role/privileges in staging before narrowing INSERT/UPDATE/DELETE.
4. New public tables and sequences do not automatically grant broad privileges to `anon` or `authenticated`. Each browser-accessible object receives deliberate grants only after RLS is enabled and policies are reviewed.
5. New functions do not automatically become browser-callable. Each exposed RPC receives an explicit EXECUTE grant after authorization, owner, SECURITY INVOKER/DEFINER and search_path review.
6. Do not change Storage defaults, Auth schemas, existing RLS policies, notification grants or unrelated object ACLs as part of this proposal.

## 3. Candidate SQL fragments — require staging adaptation

These fragments document intent. They must be reviewed against the restored baseline and run as the correct object/default-privilege owner. They are not a complete migration.

### 3.1 Audit-log table ACL

The initial candidate is:

```sql
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLE public.audit_log
FROM anon, authenticated;
```

Do not revoke authenticated SELECT until the current administrator-only RLS policy and every legitimate audit reader have been verified. Do not revoke write privileges from the trigger execution identity until a synthetic referral insert/update/delete proves the audit trigger still succeeds. The owner retains inherent owner privileges; service-role access must be evaluated from the actual function execution context, not assumed.

### 3.2 Default privileges — creator-specific

For the `postgres` creator, after verifying the restored baseline and intended defaults, the candidate direction is:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
```

This is deliberately not a blanket revoke from `service_role`. Trusted backend access must be granted per object where required. Existing object ACLs are not retroactively changed by ALTER DEFAULT PRIVILEGES.

For `supabase_admin`, **do not put an ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin statement into a migration run as postgres**. The live role-membership catalog did not show postgres as a member of supabase_admin. A separately authorised owner-level operation or a reviewed platform-supported method is required. If that authority cannot be obtained, document the residual default-ACL exposure and block release of any new public objects created by that role.

### 3.3 Explicit per-object access pattern

For each future browser-accessible table, the migration must follow this order:

1. Create the table.
2. Enable and, where appropriate, FORCE RLS.
3. Add reviewed role- and facility-scoped policies.
4. Grant only the required table/column operations to `authenticated`.
5. Grant no browser access to private/internal tables.
6. Add integration tests for anon, authenticated roles, cross-facility access, administrator access and service-role operations.

For every new RPC:

1. Choose SECURITY INVOKER by default; justify SECURITY DEFINER as an exception.
2. Pin `search_path` (prefer an empty path with fully qualified references).
3. Validate `auth.uid()`, role and facility inside the function where needed.
4. Revoke default PUBLIC/anon/authenticated EXECUTE, then grant the exact signature to the intended role.
5. Test both allowed and denied calls through PostgREST.

## 4. Required staging regression matrix

| Area | Positive case | Negative case / invariant |
|---|---|---|
| Audit ACL | Approved admin reads rows under existing RLS; referral trigger writes audit entry | authenticated cannot TRUNCATE, alter trigger, or reference audit table |
| Audit writes | referral and counter-referral insert/update/delete retain required audit behavior | browser role cannot directly forge/delete audit history |
| Existing policies | current referral workflows still work for referring/receiving users | cross-facility and unauthenticated reads/writes remain denied |
| Table defaults | new table receives only owner/trusted grants until explicit grants are added | anon/authenticated receive no implicit table/sequence privileges |
| Function defaults | new function is not executable by anon/authenticated unless explicitly granted | direct PostgREST invocation is denied without an explicit grant |
| postgres creator | defaults match the approved ACL manifest | no unexpected browser grants |
| supabase_admin creator | owner-authorised verification proves defaults are restrictive | if unavailable, no release of objects created by this role |
| Existing RPCs | authenticated calls to approved helpers still pass authorization tests | unauthorised, cross-facility and null-identity calls fail |
| Platform isolation | Storage and Auth behavior remains unchanged | no Storage ACL/default or Auth setting drift |

Also run the full repository test suite, migration source-contract tests, SQL parse/compile checks against the restored schema, Supabase security/performance advisors, and a post-migration catalog diff. Static source tests alone do not satisfy these gates.

## 5. Rollout, rollback and release gates

### Preconditions
- Recover and review a restorable schema-only baseline; do not fabricate the missing historical migration.
- Restore the baseline to `reflink-synthetic-staging` without production data, Auth users, secrets or Storage objects.
- Capture a before-state ACL/default-ACL manifest for all affected owners and objects.
- Establish the actual audit trigger execution identity and required write privileges.
- Obtain a supported way to modify `supabase_admin` defaults, or explicitly block new public objects created by that role.
- Review all existing public RPC grants and policy dependencies before changing any function defaults.

### Execution
- Apply the hardening as a small, separately reviewed staging migration.
- Verify the exact resulting ACLs via `aclexplode`/catalog queries and test newly created objects under each creator role.
- Run synthetic role/facility workflow tests and the complete CI suite.
- Re-run Supabase security/performance advisors and compare catalog snapshots.
- Obtain database/security and clinical workflow sign-off before production change planning.

### Rollback
- Prepare a reviewed inverse ACL/default-ACL script from the captured before-state; do not guess prior grants.
- If audit writes, referral workflows, or approved RPC calls fail, stop rollout and restore only the specific prior ACL/default-ACL entries.
- Do not disable RLS, broaden policies, grant ALL to browser roles, or alter the production migration ledger as an emergency workaround.
- Production deployment requires a separate explicit release approval after staging acceptance.

## 6. Current decision

**Not ready to convert into an executable migration.** The audit-log excess privileges are directly evidenced and the least-privilege direction is clear. The default-ACL issue is confirmed for two creators, but the current connection lacks demonstrated membership/authority to change the `supabase_admin` defaults. The exact audit trigger writer privilege contract also needs staging proof. The safe next action is baseline reconstruction and synthetic staging validation, not production DDL.
