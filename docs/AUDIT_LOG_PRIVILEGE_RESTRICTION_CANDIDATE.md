# Audit Log Privilege-Restriction Migration Candidate

**Status: DESIGN / REVIEW ONLY — NOT AN EXECUTABLE MIGRATION**

This proposal addresses excessive direct privileges granted to the Supabase `authenticated` role on `public.audit_log` and its identity sequence. It is based on the supplied production schema export and static frontend call-site review. No SQL has been executed and no database state has been changed.

## 1. Confirmed baseline

The exported schema contains:

```sql
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN
ON TABLE public.audit_log TO authenticated;

GRANT ALL
ON SEQUENCE public.audit_log_id_seq TO authenticated;

GRANT ALL
ON TABLE public.audit_log TO service_role;

GRANT ALL
ON SEQUENCE public.audit_log_id_seq TO service_role;
```

RLS is enabled on `audit_log`, with this policy:

```sql
CREATE POLICY "Administrators can view audit log"
ON public.audit_log
FOR SELECT TO authenticated
USING (public.is_administrator());
```

The inspected frontend source has no direct `audit_log` table query. Audit writes are performed by `audit_referral_mutation()` and `log_referral_read(uuid)`. The dependency graph and source scan do not rule out undocumented external clients, ad hoc SQL, or operational tools.

## 2. Risk

The current grants exceed the needs of an ordinary authenticated application client:

- `TRUNCATE` can remove the entire audit trail and is not constrained by row-level policies.
- `TRIGGER` and `REFERENCES` allow schema-level capabilities that normal users do not need.
- `MAINTAIN` exposes maintenance operations.
- Sequence `ALL` includes sequence usage and modification capabilities.
- `SELECT` makes audit data directly accessible to authenticated administrators under the RLS policy; whether this is needed is a product decision, not established by the inspected frontend.

RLS does not neutralise table-level `TRUNCATE`, and it does not replace least-privilege grants.

## 3. Recommended access model

### Preferred model: no direct authenticated table access

Unless an administrator audit viewer or external client is confirmed, authenticated users should have no direct table or sequence privileges.

- Keep audit writes inside controlled database functions/triggers.
- Preserve `service_role` access for explicitly authorised backend operations.
- Keep the existing SELECT policy only if desired for a future viewer; without a table SELECT grant, it does not itself grant access.
- Do not add an authenticated INSERT grant merely to support trigger writes. Trigger functions should write through their reviewed execution context.
- Do not grant sequence privileges to authenticated clients.

This model is consistent with the inspected frontend, which has no direct audit table call site.

### Alternative model: administrator-only read access

If an approved administrator audit viewer or external administrator client exists, grant authenticated **SELECT only** and retain the administrator RLS policy. Revoke all other table privileges and all sequence privileges.

Do not choose this alternative solely because the policy exists. Confirm the supported UI/API consumer and test its exact query contract first.

## 4. Candidate SQL — preferred model

The following is a review artifact only. It must not be applied until external consumers and the administrator audit-view requirement have been checked.

```sql
REVOKE ALL PRIVILEGES
ON TABLE public.audit_log
FROM authenticated;

REVOKE ALL PRIVILEGES
ON SEQUENCE public.audit_log_id_seq
FROM authenticated;
```

### Candidate SQL — administrator read-only alternative

Use this instead of the preferred model only if administrator direct reads are an approved requirement.

```sql
REVOKE ALL PRIVILEGES
ON TABLE public.audit_log
FROM authenticated;

GRANT SELECT
ON TABLE public.audit_log
TO authenticated;

REVOKE ALL PRIVILEGES
ON SEQUENCE public.audit_log_id_seq
FROM authenticated;
```

Do not combine the two variants. The selected model must be explicit in the migration review.

## 5. Important implementation considerations

1. **Function execution context:** verify `audit_referral_mutation()` and `log_referral_read(uuid)` ownership, SECURITY DEFINER status, search path, and effective INSERT privileges. The exported definitions show privileged functions, but the live catalog must be checked before applying the revocation.
2. **Trigger writes:** verify INSERT audit events continue to be written when the originating mutation is performed by an authenticated user who has no direct audit table privileges.
3. **Read RPC writes:** verify `log_referral_read(uuid)` continues to insert metadata-only READ events for authorised participants and fails for unauthorised callers.
4. **Service role:** preserve the explicitly required service-role privileges; do not broaden them.
5. **Other grants:** inspect PUBLIC, inherited role memberships, role-level grants, schema privileges, default privileges, and any grants not represented in the export. A direct REVOKE from `authenticated` alone may not remove privileges inherited from another role.
6. **Administrator policy:** under the preferred model, the policy is dormant for direct authenticated API access because the role lacks SELECT. Do not mistake the policy's existence for a grant.
7. **Audit integrity:** this change does not itself fix the metadata minimisation issue, historic snapshots, retention, or privileged service-role misuse.

## 6. Synthetic staging acceptance tests

Run only after the isolated staging database has a reviewed reconstructed baseline. Use synthetic data exclusively.

| Test | Preferred model expected result | Admin-read alternative expected result |
|---|---|---|
| Authenticated non-admin direct SELECT | Denied | Denied by RLS |
| Authenticated admin direct SELECT | Denied | Allowed by RLS |
| Authenticated direct INSERT/UPDATE/DELETE | Denied | Denied |
| Authenticated TRUNCATE | Denied | Denied |
| Authenticated REFERENCES/TRIGGER/MAINTAIN | Denied | Denied |
| Authenticated sequence USAGE/SELECT/UPDATE | Denied | Denied |
| Authenticated mutation of a referral | Mutation succeeds; trigger writes audit row through its privileged execution context | Same |
| Authorised `log_referral_read(uuid)` call | READ metadata event written | Same |
| Unauthorised `log_referral_read(uuid)` call | Rejected; no event written | Same |
| Service-role approved audit operation | Continues to work | Continues to work |
| Role inheritance/effective privileges | No unintended access path | No unintended write or sequence access |

Verify effective privileges using PostgreSQL privilege-inspection functions and actual authenticated JWT/RLS tests; do not rely only on the textual REVOKE statements.

## 7. Release gates

Before creating an executable migration:

- Confirm there are no external direct readers or writers.
- Obtain an explicit decision on whether an administrator audit viewer is required.
- Recheck live table/sequence grants, role memberships, default ACLs, owners, function security settings, and RLS policies.
- Confirm trigger and RPC insert paths work without authenticated direct table privileges.
- Run the full synthetic staging acceptance matrix.
- Review the migration and rollback strategy.
- Deploy only through the approved migration process after review and merge.

**Environment safety:** production remains read-only. No SQL was executed as part of this proposal. Isolated staging remains unchanged.
