# REFLINK — Referral Row and Column Authorization Review

**Review date:** 10 November 2026  
**Scope:** Production catalog evidence recorded in the 9 November baseline reconciliation; no patient rows queried.  
**Classification:** Evidence-based review and implementation specification. This file is not an executable migration.

## Executive conclusion

The current referral authorization model is not yet sufficiently constrained for release. Row-level security and broad table grants are being relied upon together, but they do not provide the required column-level workflow boundary. The next implementation must preserve the existing PHC referral-submission and receiving-facility processing workflows while ensuring that each role can read and change only the fields required for its task.

No SQL, application code, production settings, or staging objects were changed by this review.

## Confirmed findings from the production-to-staging reconciliation

1. **Referral INSERT policy:** the PHC policy binds the referrer to `auth.uid()` and checks PHC role/facility alignment. The reviewed predicate does not itself validate that the receiving facility is active or force system-controlled initial-state values.
2. **Referral SELECT policy:** receiving-facility visibility is based on destination-facility equality but does not explicitly require `role = 'receiving_staff'`. This may grant visibility to another authenticated profile assigned to that facility, subject to the remaining policies and grants.
3. **Referral UPDATE policy:** the receiving UPDATE policy checks receiving role and facility in `USING` and `WITH CHECK`. However, authenticated users have broad table-level UPDATE privilege. RLS restricts rows; it does not restrict the columns changed on an allowed row.
4. **Structural privilege:** authenticated has `TRUNCATE` on core application tables. RLS does not protect against `TRUNCATE`; this must be addressed through a reviewed grant change.
5. **Trigger evidence:** the supplied 64,434-byte schema export contains no `CREATE TRIGGER` statements. Nine live public trigger definitions are separately captured in `docs/catalog_exports/20261109_live_public_trigger_snapshot.sql`. A restore or test baseline must include both sources and verify trigger-to-function attachment and ordering.

## Required role and workflow boundary

| Actor | Required referral access | Must not be able to |
|---|---|---|
| PHC/referring staff | Create referrals for their own facility; view and update only referrals they originated, within the approved pre-transfer workflow | Rewrite receiving-facility decisions, receiving notes, acknowledgement/completion fields, audit history, or another facility's referrals |
| Receiving staff | View referrals assigned to their facility; acknowledge and process only assigned referrals; submit counter-referral through the approved workflow | Change referring-facility provenance, referrer identity, original PHC clinical assessment, destination assignment, or unrelated referrals |
| Administrator | Access approved aggregate operational reporting and user/facility administration | Gain unrestricted patient-level referral access merely because the user is an administrator |
| Unauthenticated/anonymous | No referral data access or mutation | Read, insert, update, delete, truncate, or invoke privileged referral operations |

The table is a target policy specification, not a claim that every listed permission is currently implemented.

## Required field-level protection

Before changing grants, produce a field matrix from the actual `referrals` table definition and active forms. At minimum, classify fields into:

- **Immutable provenance:** referral ID, referring facility, referring user, creation timestamp, offline client/idempotency identifier.
- **PHC-originated clinical content:** presenting complaint, history, observations, provisional diagnosis, treatment/interventions, and referral rationale.
- **Routing and system state:** receiving facility, status, acknowledgement deadline, acknowledged timestamp, completion timestamp, and server-generated audit metadata.
- **Receiving-facility response:** receiving assessment, outcome, treatment at receiving facility, counter-referral linkage, and return instructions.
- **Administrative metadata:** only explicitly approved fields; never use a generic administrator bypass for clinical data.

Do not infer actual column names or apply a grant until the live table definition, form payloads, RPCs, triggers, and update call sites have been reconciled.

## Safe implementation sequence

1. Export the exact live column list, data types, nullability, defaults, generated columns, constraints, and current grants for `public.referrals`.
2. Trace every active insert/update path in the PHC and receiving workspaces, including offline retry and counter-referral submission.
3. Build a field-level role matrix and have the clinical/product owner approve which actor may edit each clinical field at each referral lifecycle state.
4. Prefer narrow transactional RPCs for state transitions and receiving responses where multi-field invariants must be atomic. If direct table updates remain, grant only the specific columns required by each role.
5. Add an explicit `receiving_staff` predicate to receiving-facility read access, while preserving PHC-originator visibility and any separately approved supervisor workflow.
6. Revoke authenticated `TRUNCATE` and other unnecessary structural privileges after checking object ownership, service-role operations, migration tooling, and the complete ACL matrix.
7. Preserve trigger semantics. Verify all nine captured trigger attachments, their timing/order, referenced function definitions, and behavior on insert/update/delete before changing policies or grants.
8. Test the complete candidate in isolated synthetic staging only. Do not apply to production as part of this work.

## Required negative and positive tests

- PHC user at Facility A can create a referral with their own identity and Facility A as the referring facility.
- PHC user cannot create a referral on behalf of another user or another referring facility.
- PHC user cannot set or forge system-controlled status, acknowledgement, completion, audit, or receiving-response fields.
- Receiving staff at Facility B can see only referrals assigned to Facility B and can process only those referrals.
- A non-receiving profile assigned to Facility B cannot read Facility B's referrals solely because of facility membership.
- Receiving staff cannot change referral provenance, PHC-originated clinical fields, or destination assignment.
- A user at Facility C cannot read or mutate a referral assigned to Facility B.
- Administrator access to aggregate reporting does not imply direct patient-level referral SELECT or unrestricted clinical UPDATE.
- Anonymous requests cannot read or mutate referral data.
- Authenticated users cannot TRUNCATE referrals or other protected clinical tables.
- Each lifecycle trigger still enforces valid transitions, required counter-referral linkage, audit behavior, and timestamp behavior.
- Offline retry remains idempotent and does not permit a caller to change the original owner or facility.

## Evidence still required before executable migration

- Exact current `pg_policies` definitions for every SELECT/INSERT/UPDATE/DELETE policy on referrals.
- `information_schema.column_privileges` and `pg_class.relacl` / `aclexplode` results for all relevant roles.
- Trigger definitions, enabled state, firing order, and function source from the captured live snapshot.
- Current frontend call sites and exact update payloads for each role.
- Synthetic JWT integration tests against the reconstructed staging schema.
- Clinical/product approval of the field-level matrix and lifecycle transitions.

## Release decision

**Blocked pending staging verification.** This review does not authorize an executable migration. The next implementation artifact should be generated only after the evidence above is complete, so the change is narrow, reversible, and does not duplicate or disrupt existing REFLINK workflows.

Production and staging remain unchanged by this review.