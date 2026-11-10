# REFLINK database dependency graph — audit, print, analytics, and administrator controls

**Source:** `reflink-production-schema.sql`  
**SHA-256:** `72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3`  
**Repository branch:** `reflink/phase-1-security-remediation`  
**Review type:** Static analysis of the supplied schema export, cross-checked against frontend call sites. No SQL was executed and no database state was changed.

## 1. Executive result

The database dependency graph confirms that the privileged objects under review are not isolated:

- `public.is_administrator()` is referenced by multiple RLS policies and by the print/read RPCs. It must not be removed or have authenticated EXECUTE revoked without replacing those policy dependencies.
- `public.is_current_user_administrator()` is not referenced by the exported RLS policies or the scanned frontend. Its remaining SQL/function consumers and external consumers must still be checked before deprecation.
- `public.audit_referral_mutation()` is attached to both `referrals` and `counter_referrals`; it writes full old/new row JSON into `audit_log`.
- `public.log_referral_read(uuid)` also writes to `audit_log`, independently of the row-mutation trigger.
- `public.log_referral_print(uuid,text)` writes to `referral_print_events`; the frontend calls this RPC and does not directly insert into the table in the inspected source.
- `public.get_referral_analytics_summary()` reads `public.referral_analytics_summary`, which reads `public.referral_analytics`. Both views are granted to `service_role` in the export.
- The exported authenticated table grants on `audit_log` and `referral_print_events` are broader than the frontend call paths require.

## 2. Dependency graph

```text
RLS policies (profiles, users, audit_log, counter_referrals,
referral_print_events, facilities-related operations)
  └── public.is_administrator()
        ├── public.log_referral_print(uuid,text)
        └── public.log_referral_read(uuid)

Frontend src/App.jsx
  ├── RPC log_referral_print(uuid,text)
  │     └── authorization check → public.referrals + public.profiles
  │     └── allocate MAX(print_number)+1
  │     └── INSERT public.referral_print_events
  └── RPC log_referral_read(uuid)
        └── authorization check → public.referrals + public.profiles
        └── INSERT public.audit_log

Triggers
  ├── referrals_audit_mutation
  │     └── public.audit_referral_mutation()
  │           └── INSERT public.audit_log (full OLD/NEW JSON)
  └── counter_referrals_audit_mutation
        └── public.audit_referral_mutation()
              └── INSERT public.audit_log (full OLD/NEW JSON)

Analytics
  └── public.get_referral_analytics_summary()
        └── public.referral_analytics_summary
              └── public.referral_analytics
                    └── public.referrals (+ profile/facility context)
```

The graph is based on the SQL bodies, triggers, policies, and grants in the supplied export. It does not include undocumented external clients, ad hoc SQL, scheduled jobs, or consumers absent from the export.

## 3. Administrator helper dependency map

### `public.is_administrator()`

Confirmed references in the export:

| Consumer | Dependency |
|---|---|
| `Administrators can create profiles` | RLS WITH CHECK |
| `Administrators can insert users` | RLS WITH CHECK |
| `Administrators can update profiles` | RLS USING and WITH CHECK |
| `Administrators can update users` | RLS USING and WITH CHECK |
| `Administrators can view all profiles` | RLS SELECT predicate |
| `Administrators can view audit log` | RLS SELECT predicate |
| `Administrators can view users` | RLS SELECT predicate |
| `Participants can view counter referrals` | RLS SELECT predicate |
| `Participants can view print history` | RLS SELECT predicate |
| `log_referral_print(uuid,text)` | Privileged RPC authorization |
| `log_referral_read(uuid)` | Privileged RPC authorization |

**Disposition:** retain the function signature and authenticated EXECUTE grant while these policy and RPC dependencies remain. Harden its execution path and ownership separately. A policy replacement could remove the helper dependency, but that is a distinct migration requiring positive and negative RLS tests.

### `public.is_current_user_administrator()`

No reference was found in the exported policy definitions or the inspected frontend files. The function is nevertheless a distinct exported function with service-role EXECUTE. Before deprecating it, search all function bodies, views, triggers, edge functions, SQL scripts, and external consumers. It may be retained temporarily as a compatibility alias if the complete dependency search confirms that is appropriate.

## 4. Audit-log dependency and exposure map

### Writers

1. `audit_referral_mutation()` is invoked by:
   - `referrals_audit_mutation` — AFTER INSERT OR UPDATE OR DELETE on `public.referrals`.
   - `counter_referrals_audit_mutation` — AFTER INSERT OR UPDATE OR DELETE on `public.counter_referrals`.
2. `log_referral_read(uuid)` inserts a READ event after checking referral participation.

### Readers and access

- The exported policy `Administrators can view audit log` allows authenticated rows when `public.is_administrator()` returns true.
- The export grants authenticated SELECT, REFERENCES, TRIGGER, TRUNCATE, and MAINTAIN on `audit_log`, plus ALL on its identity sequence.
- The export grants service_role ALL on the table and sequence.
- The frontend scan found no direct `audit_log` table query or audit viewer in the inspected source files.

**Important:** removing authenticated SELECT would also make the existing administrator RLS policy unusable through the normal client API. If an administrator audit viewer is required, provide only SELECT and rely on the administrator RLS policy; do not grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, or sequence write privileges. If no supported viewer exists, remove direct authenticated table access and retain a separately authorized service-side audit workflow.

### Data minimization

The mutation trigger writes complete `to_jsonb(OLD)` and `to_jsonb(NEW)` snapshots. The read RPC writes a metadata-only event. These are separate writer paths and must be addressed separately:
- mutation trigger: replace whole-row snapshots with metadata-only or a strictly reviewed allowlisted diff;
- read RPC: preserve metadata-only event behavior;
- both: define NULL actor/system-event semantics and retention controls.

## 5. Print-event dependency and exposure map

### Writer and reader

- Writer: `log_referral_print(uuid,text)`, called by `src/App.jsx`.
- Reader: authenticated policy `Participants can view print history`, which allows administrators, referring users, and receiving-facility participants.
- Frontend printing is non-blocking with respect to logging: an RPC error is caught and printing still proceeds.
- Exported table grants: authenticated ALL and service_role ALL.
- Exported sequence grants: authenticated ALL and service_role ALL.
- Exported indexes: a non-unique index on `(referral_id, created_at DESC)`; no unique key on `(referral_id, print_number)`.

**Disposition:** keep participant SELECT if print history is a supported UI feature; revoke direct authenticated write privileges and sequence privileges only after verifying there are no external direct writers. Preserve the RPC's signature, authorization behavior, return value, and current frontend failure tolerance. Implement serialized allocation and a unique integrity constraint in a separately reviewed migration.

## 6. Analytics dependency map

- `referral_analytics` is the base analytics view and includes referral/patient-related fields.
- `referral_analytics_summary` aggregates the base view.
- `get_referral_analytics_summary()` selects from the summary view and checks `public.is_current_user_administrator()` in its body.
- The export grants both views and the summary function to `service_role`; it does not grant either view to authenticated.
- The scanned frontend admin dashboard calls six separate aggregate RPCs; it does not call `get_referral_analytics_summary()` directly.

**Disposition:** do not infer that the views or summary RPC are unused. Keep direct view access service-role-only unless a documented requirement and tested access design justify otherwise. Confirm view security mode/owner behavior and every service-side consumer before altering grants.

## 7. Trigger inventory relevant to these controls

| Trigger | Table | Event | Function |
|---|---|---|---|
| `referrals_audit_mutation` | `public.referrals` | AFTER INSERT/UPDATE/DELETE | `audit_referral_mutation()` |
| `counter_referrals_audit_mutation` | `public.counter_referrals` | AFTER INSERT/UPDATE/DELETE | `audit_referral_mutation()` |
| `referral_status_audit_trigger` | `public.referrals` | AFTER UPDATE OF status | `log_referral_status_change()` |
| `guard_profile_security_fields` | `public.profiles` | BEFORE UPDATE | `guard_profile_security_fields()` |
| `referral_ack_due_at_trigger` | `public.referrals` | BEFORE INSERT/UPDATE OF urgency, created_at | `set_referral_ack_due_at()` |
| `referral_counter_referral_guard` | `public.referrals` | BEFORE UPDATE OF status | `require_counter_referral_before_completion()` |
| `referral_draft_updated_at` | `public.referral_drafts` | BEFORE UPDATE | `update_referral_draft_timestamp()` |
| `referral_entry_validation_trigger` | `public.referrals` | BEFORE INSERT/UPDATE | `validate_referral_entry()` |
| `referral_status_transition_validation` | `public.referrals` | BEFORE UPDATE OF status | `validate_referral_status_transition()` |

The exported trigger set does not show a trigger on `audit_log` or `referral_print_events`.

## 8. Migration sequencing recommendation

Do not combine all findings into one broad permissions migration. Use narrow, independently testable changes after a representative schema is restored to isolated staging:

1. **Audit payload minimization:** update mutation trigger behavior; test INSERT/UPDATE/DELETE on both attached tables and confirm no PHI snapshots are stored.
2. **Audit table privilege correction:** decide whether administrator SELECT remains required; revoke dangerous authenticated table/sequence privileges while preserving any intentionally supported read path.
3. **Print-event integrity:** add unique constraint after checking existing data for duplicates; update allocator with transaction-safe per-referral serialization; revoke direct client DML/sequence access only after external-writer checks.
4. **Definer hardening:** update one function at a time with hardened search path and exact schema qualification; verify owner, EXECUTE grants, RLS behavior, and call contracts.
5. **Analytics boundary:** validate view security mode and service-role-only access; test summary function as admin and non-admin under realistic JWT contexts.
6. **Helper deprecation:** only after a full dependency search and policy replacement plan; never remove `is_administrator()` while the listed policies depend on it.

## 9. Required acceptance tests

- Every policy that invokes `is_administrator()` passes as administrator and denies ordinary authenticated users where expected.
- Print/read RPCs pass for administrators, referring users, and assigned receiving-facility users; fail for unrelated users, anon, and missing-profile cases.
- Authenticated users cannot directly insert/update/delete print events or access the identity sequence after privilege correction.
- Participant SELECT still returns only authorized print-history rows.
- Audit trigger writes no patient identifiers, clinical narrative, diagnosis, findings, or full row snapshots.
- Administrator audit read works only if explicitly retained; non-admin, anon, and service paths match the approved policy.
- Analytics views remain inaccessible to anon/authenticated direct callers; intended service-side consumers continue to work.
- Concurrent print calls for the same referral yield unique numbers; calls for different referrals remain correct.
- Existing frontend tests prove print proceeds when logging fails and referral opening is not blocked by read logging.
- All nine triggers in the exported schema are recreated and their expected order/behavior is verified after baseline reconstruction.

## 10. Decision

**Dependency graph complete for the supplied schema export and inspected frontend.** This is sufficient to prepare narrowly scoped migration candidates and synthetic staging tests, but not to apply them. The remaining uncertainty is external consumers and populated-schema runtime behavior.

No migration was created or executed in this stage. Production remains read-only; isolated staging remains unchanged.
