# REFLINK Referral Lifecycle and Facility-Isolation Security Audit

**Review date:** 8 November 2026  
**Environment:** Production catalog, read-only inspection; repository source at current remediation branch  
**Scope:** `referrals`, `counter_referrals`, `profiles`, `facilities`, referral lifecycle triggers and frontend role workflows  
**Data handling:** Catalog and policy definitions only. No patient rows were queried. No SQL changes or tests against live identities were performed.

## Executive assessment

Row-level security is enabled on all four core tables inspected. The current policies establish basic sender/receiver facility predicates, but they do not yet provide a complete least-privilege boundary. The highest-priority finding is that the `authenticated` database role has table-level `TRUNCATE`, `TRIGGER`, and `REFERENCES` privileges on the four core tables. RLS does not protect against `TRUNCATE`; it is a table privilege, not a row operation governed by policies. This is a critical privilege exposure and must be resolved through a reviewed ACL migration before broad deployment.

Other findings require role/column-scoped policy refinement and synthetic integration tests. They are not proof that a particular user has exploited the weakness.

## 1. Live catalog findings

A read-only query of `pg_catalog.pg_policies` found these relevant policies:

### Referrals

- INSERT: `PHC staff can create referrals` requires `referring_user_id = auth.uid()` and a profile with role `phc_staff` whose `facility_id` equals `referring_facility_id`.
- SELECT: `PHC staff can view their referrals` filters by `referring_user_id = auth.uid()`, not by referring facility.
- SELECT: `Receiving facilities can view assigned referrals` filters by `receiving_facility_id = profiles.facility_id`, but does not explicitly require `profiles.role = 'receiving_staff'`.
- UPDATE: `Receiving staff can update assigned referrals` requires receiving role and matching receiving facility in both USING and WITH CHECK.
- No ordinary authenticated SELECT policy for administrators was present in the returned policy set. This aligns with the design that patient-level admin views should not be exposed through ordinary client SELECT.

### Counter-referrals

- INSERT: `Receiving staff can create counter referrals` requires `receiving_user_id = auth.uid()`, a receiving-staff profile, and a referral assigned to that profile's facility.
- SELECT: `Participants can view counter referrals` permits administrator, referring user, or any profile whose facility matches the referral's receiving facility. The receiving branch does not explicitly check the receiving-staff role.
- No authenticated UPDATE or DELETE policy was present in the returned policy set.

### Profiles

- Users can SELECT their own profile; administrators can SELECT all profiles.
- Users can UPDATE their own profile row; a separate trigger, `guard_profile_security_fields()`, prevents non-administrators from changing identity, role, facility and other protected profile fields. The trigger permits the intended self-service password-change flag update.
- Administrator profile insert/update policies use `is_administrator()`.

### Facilities

- Authenticated users can SELECT all facility rows.
- Insert/update/delete policies are administrator-only.
- The receiving-facility selector is therefore based on a globally visible directory; the client separately checks that the chosen destination is active.

### RLS state

The catalog reports RLS enabled on `referrals`, `counter_referrals`, `profiles`, and `facilities`. `FORCE ROW LEVEL SECURITY` is false on these tables. Table owners and roles with BYPASSRLS (including service-role contexts) require separate operational controls; RLS is not a substitute for protecting privileged credentials.

## 2. Critical ACL finding — RLS bypass via TRUNCATE privilege

The live table privilege query reports the `authenticated` role has all of the following privileges on each of `referrals`, `counter_referrals`, `profiles`, and `facilities`:

- DELETE
- INSERT
- REFERENCES
- SELECT
- TRIGGER
- TRUNCATE
- UPDATE

The presence of `TRUNCATE` is particularly serious: PostgreSQL does not apply row-level security policies to TRUNCATE. A client role with this privilege can issue a table-wide truncation regardless of row predicates. The same excessive grants include trigger-creation and foreign-key-reference privileges that ordinary browser clients do not need.

This catalog result is a **critical ACL misconfiguration**. No destructive command was run. It should be prioritised ahead of feature work and fixed only through a reviewed migration after checking external integrations and the exact intended client DML contract.

Recommended target:
- Remove authenticated `TRUNCATE`, `TRIGGER`, and `REFERENCES` on all four core tables.
- Remove authenticated `DELETE` on referrals, counter_referrals, profiles and facilities unless a specific approved user workflow requires it. Current policies returned no DELETE policy for these tables, but removing the grant avoids relying on that absence as the only control.
- Retain only the table/column operations required by the current frontend and tested RPCs.
- Inspect sequences and column-level grants independently; do not assume table ACL correction fixes them.
- Review default privileges for both `postgres` and `supabase_admin` so future tables do not inherit the same excessive browser-role permissions.

## 3. Facility-isolation and provenance gaps

### F-01 — receiving SELECT is not explicitly role-scoped

The receiving SELECT policy checks only whether the referral's `receiving_facility_id` equals the caller profile's `facility_id`. It does not require `role = 'receiving_staff'`. A different authenticated role assigned to that facility may therefore satisfy the same predicate. Whether such dual assignment exists must be tested with synthetic profiles; policy intent should be explicit regardless.

The counter-referral participant SELECT policy has the same role omission for the receiving-facility branch.

**Recommendation:** add an explicit receiving-staff role condition to the receiving branches, while preserving referring-user access and the separately reviewed administrator behavior.

### F-02 — PHC read scope is user-scoped, not facility-scoped

The PHC SELECT policy allows only `referring_user_id = auth.uid()`. The PHC dashboard source queries referrals using the signed-in user identity and does not establish a team-wide PHC facility queue in the reviewed policy. This is consistent with individual ownership, but it may prevent continuity when the originating staff member is absent or leaves.

**Recommendation:** decide whether PHC access is intended to be individual-user or facility-team based. If facility-team access is approved, define the minimum role and facility predicate and test that another PHC facility cannot read the referral. Do not silently broaden access.

### F-03 — receiving UPDATE policy does not constrain mutable columns

The receiving UPDATE policy's USING and WITH CHECK predicates ensure that the row remains assigned to the caller's receiving facility and that the caller is a receiving staff member. They do not constrain changes to provenance columns such as `referring_facility_id`, `referring_user_id`, or other non-receiving workflow fields. Because authenticated has table-level UPDATE, the policy is row-scoped, not column-scoped.

The frontend currently updates referral rows directly for acknowledgement, arrival, assessment, admission, discharge, and investigation metadata. The current source uses expected-status filters for the lifecycle status updates, but direct PostgREST writes remain broad at the database privilege level.

**Recommendation:** define a column-level write matrix. Prefer narrow transactional RPCs for lifecycle transitions and clinical updates, or carefully designed column-level UPDATE grants plus RLS. Preserve clinical workflow semantics and do not remove frontend writes until the replacement path is implemented and tested.

### F-04 — PHC INSERT active-destination validation is client-only

The INSERT policy validates the caller's PHC role, facility and user attribution, but does not require that the receiving facility exists and is active. The UI checks the selected destination against the facilities table and rejects inactive destinations, but browser validation can be bypassed.

The foreign key (if present) can enforce existence, not active status. The trigger `validate_referral_entry()` checks that `receiving_facility_id` is non-null but does not validate active facility state.

**Recommendation:** add database-side destination existence/active-state validation in a reviewed trigger or RPC, with tests for inactive and nonexistent destinations. Do not rely on client checks as an authorization boundary.

## 4. Lifecycle trigger review

Read-only function definitions confirm:

- `validate_referral_status_transition()` enforces the documented status sequence and rejects transitions from completed/cancelled states.
- `require_counter_referral_before_completion()` prevents transition to completed unless a counter-referral row exists.
- `validate_referral_entry()` validates required referral content and emergency findings, but does not validate the active destination facility.
- `guard_profile_security_fields()` protects role and facility assignment fields from non-administrator profile updates.

These triggers enforce important invariants, but the status-transition trigger does not itself establish which role may perform each transition. Role authorization is currently partly supplied by the broad receiving UPDATE RLS policy. A role/column write matrix is therefore necessary.

## 5. Frontend workflow observations

The reviewed source shows:

- New referral creation obtains the signed-in Auth user and profile, uses the profile facility as `referring_facility_id`, and sets `referring_user_id` to the signed-in user.
- The client validates the selected receiving facility against live `facilities` data and checks `is_active`.
- Receiving queue queries filter by `receiving_facility_id = profile.facility_id`.
- Receiving lifecycle updates use expected prior-status filters and treat a no-match as a stale referral requiring refresh.
- The PHC and receiving realtime subscriptions filter events by their respective facility columns. Realtime filters are a delivery optimization, not a replacement for RLS.

Client-side filters and realtime channel filters must never be treated as security controls; RLS and database privileges remain authoritative.

## 6. Prioritised remediation plan

| Priority | Work item | Required evidence |
|---|---|---|
| P0 | Remove authenticated TRUNCATE/TRIGGER/REFERENCES privileges on core tables; review unnecessary DELETE | ACL diff; verify table grants; negative privilege tests |
| P1 | Explicit receiving role predicates on referral and counter-referral SELECT | RLS tests: receiving staff allowed; PHC/other role denied unless separately approved |
| P1 | Constrain receiving writes by column and lifecycle action | Write matrix; denied provenance/assignment tampering; positive workflow tests |
| P1 | Enforce active receiving facility at database boundary | INSERT tests for active, inactive and nonexistent facility |
| P2 | Decide PHC individual vs facility-team visibility | Product/clinical decision and cross-user/cross-facility tests |
| P2 | Review administrator patient-level access and audit route | Confirm ordinary client SELECT remains denied unless audited policy approved |
| P2 | Review storage object policy and attachment metadata/path consistency | Synthetic cross-facility upload/download tests |
| P2 | Test all lifecycle transitions and concurrent requests against PostgreSQL | Schema-correct synthetic staging; no live patient data |

## 7. Synthetic acceptance matrix

The following cases must be executed only after a schema-correct isolated synthetic database is available:

1. PHC staff A creates a referral for Facility B; PHC A can read it.
2. PHC staff B at Facility A attempts to read PHC staff A's referral; result matches the approved team-access policy.
3. PHC staff at Facility C attempts to read or update the referral; denied.
4. Receiving staff at Facility B can read and execute only the permitted lifecycle actions.
5. PHC staff or an unrelated role assigned to Facility B cannot obtain receiving-only access unless explicitly approved.
6. Receiving staff at Facility C cannot read, update, acknowledge, or create a counter-referral for Facility B's referral.
7. Receiving staff attempts to modify `referring_facility_id`, `referring_user_id`, referral number, destination facility, or PHC-entered clinical content; denied.
8. PHC attempts to insert a referral addressed to an inactive facility; denied by database.
9. A client authenticated as ordinary `authenticated` cannot TRUNCATE any core table or create triggers/references.
10. A caller with missing profile, invalid role, or null facility receives no referral access.
11. Cross-facility Storage access to investigation files is denied even when the object path is guessed.
12. Realtime notifications do not expose row payloads to an unauthorized role/facility.

## 8. Limitations and release decision

- Catalog inspection is not an exploit demonstration and does not reveal whether any client has attempted destructive operations.
- No authenticated role-impersonation tests, live RLS DML tests, Storage tests, or realtime authorization tests were run.
- No patient rows were queried.
- No production DDL, DML, ACL, Auth configuration, Edge Function, Storage policy or deployment was changed.
- The isolated staging project still lacks a reconstructed application schema; the required integration tests cannot yet be executed there.

**Decision:** referral lifecycle source protections are improving, but facility isolation is not ready for multi-facility production sign-off. The authenticated TRUNCATE grant is the first remediation blocker. Do not deploy ACL or RLS changes until the complete client call-site matrix, migration baseline, synthetic test environment and rollback plan are reviewed.
