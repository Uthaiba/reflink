# Audit Log Data-Minimisation Migration Candidate

**Status: DESIGN / REVIEW ONLY — NOT AN EXECUTABLE MIGRATION**

This document proposes a narrow replacement for `public.audit_referral_mutation()`. It is based on the exported production schema snapshot and static repository review. It has **not** been applied to production or staging, and has not been validated against a populated PostgreSQL database.

## 1. Finding

The exported function is a `SECURITY DEFINER` trigger function attached to:

- `public.referrals` — AFTER INSERT, UPDATE OR DELETE
- `public.counter_referrals` — AFTER INSERT, UPDATE OR DELETE

It currently writes `to_jsonb(NEW)` and/or `to_jsonb(OLD)` into `audit_log.new_data` and `audit_log.old_data`. This duplicates complete referral rows—including potentially sensitive patient and clinical fields—in the audit table.

The exported `audit_log` schema already supports a metadata-only event:

- `actor_user_id` (nullable UUID)
- `action` (CREATE / READ / UPDATE / DELETE)
- `table_name`
- `record_id` (nullable UUID)
- `old_data` and `new_data` (nullable JSONB)
- `client_ip` (nullable INET)
- `created_at`

No schema change is required to stop writing row snapshots.

## 2. Proposed behavioural change

For future mutations, record only:

1. Actor UUID from `auth.uid()` (nullable for contexts without an authenticated user).
2. Normalised action derived from `TG_OP`.
3. Trigger table name.
4. Affected row UUID (`NEW.id` for INSERT/UPDATE; `OLD.id` for DELETE).

Leave `old_data`, `new_data`, and `client_ip` NULL. Do not store changed field values, patient identifiers beyond the existing record UUID, diagnosis, complaint, referral notes, contact details, or serialized row content.

This deliberately does not add a changed-column list: the existing table has no such column, and the immediate objective is to minimise stored data rather than expand the audit schema.

## 3. Candidate function definition

The following is a **review artifact only**. It must not be copied into an applied migration until the function owner, trigger behaviour, actor attribution, and staging acceptance tests have been reviewed.

```sql
CREATE OR REPLACE FUNCTION public.audit_referral_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_record_id uuid;
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_action := 'CREATE';
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id;
    v_action := 'UPDATE';
  ELSIF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_action := 'DELETE';
  ELSE
    RAISE EXCEPTION 'Unsupported audit trigger operation: %', TG_OP;
  END IF;

  INSERT INTO public.audit_log (
    actor_user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    client_ip
  )
  VALUES (
    auth.uid(),
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    NULL,
    NULL,
    NULL
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;
```

### Security and compatibility notes

- An empty function search path reduces object-shadowing risk; referenced objects are schema-qualified.
- `auth.uid()` is explicitly schema-qualified. Confirm its availability and behaviour for authenticated, service-role, and background execution contexts in the target Supabase environment.
- The trigger remains AFTER ROW and preserves the required row return value for each operation.
- Both audited tables must continue to expose a UUID `id` column. The supplied export shows this design; verify against the live catalog immediately before any future migration.
- Preserve the existing function owner and grants intentionally. Do not assume `CREATE OR REPLACE FUNCTION` preserves every operational property without verifying the resulting catalog.
- Do not change trigger names, timing, event coverage, or audit-table RLS in this candidate.
- This only prevents **new** row snapshots. Existing historical `old_data`/`new_data` values remain until a separately approved retention/deletion decision is made.

## 4. Required acceptance tests

Run only on an isolated, synthetic staging database after the baseline schema has been reconstructed and reviewed. Do not use production patient data.

| Scenario | Expected result |
|---|---|
| INSERT synthetic referral | One CREATE audit event; correct table and UUID; both JSONB fields NULL |
| UPDATE synthetic referral | One UPDATE event; correct table and UUID; both JSONB fields NULL |
| DELETE synthetic referral | One DELETE event; correct table and UUID; both JSONB fields NULL |
| Repeat all three for counter-referral | Same expected behaviour |
| Authenticated actor | `actor_user_id` equals the authenticated test user's UUID |
| Service/background context | No unexpected failure if `auth.uid()` is NULL; actor remains NULL |
| Trigger return semantics | INSERT/UPDATE/DELETE operations complete normally |
| Audit insert failure | Mutation failure behaviour is explicitly tested and accepted; do not silently swallow audit errors |
| Existing READ audit RPC | Metadata-only READ events remain unaffected |
| Function metadata | Owner, SECURITY DEFINER, empty search_path, trigger attachments, and grants match the approved design |
| Sensitive-value sentinel | Unique synthetic patient/clinical sentinel values do not appear in newly generated audit rows |

Also verify that the candidate does not interfere with `log_referral_status_change()` or any other trigger on the same tables.

## 5. Separate decisions still required

This candidate does **not** resolve the following findings, which require separate review and separate changes:

1. **Historical audit payloads:** establish retention/legal requirements and approve a controlled purge or redaction plan for existing JSONB snapshots. Do not delete historical records by default.
2. **Audit-log table privileges:** the exported grants give `authenticated` SELECT, REFERENCES, TRIGGER, TRUNCATE and MAINTAIN on `audit_log`, plus ALL on its identity sequence. These privileges should be assessed and narrowed independently; the current RLS policy is not a substitute for least-privilege table grants.
3. **Audit integrity:** determine whether authenticated users need direct audit-log access at all, and ensure application users cannot alter, truncate, or forge audit events.
4. **Actor attribution:** confirm expected behaviour for service-role, scheduled, and other non-user initiated mutations.
5. **Retention and access monitoring:** define retention, authorised access, and monitoring for audit metadata.

## 6. Release gates

Do not create or apply an executable migration until:

- The live schema has been rechecked against the export.
- The proposed metadata-only semantics are approved by the product/security owner.
- Synthetic staging baseline reconstruction is complete.
- All acceptance tests above pass on staging.
- Audit-log grants and historical payload retention are addressed in separately reviewed work.
- A rollback and backup strategy is documented.
- The migration is reviewed and merged through the normal pull-request process.

**Environment safety:** production remains read-only. No SQL was executed as part of this design work. Staging remains unchanged.
