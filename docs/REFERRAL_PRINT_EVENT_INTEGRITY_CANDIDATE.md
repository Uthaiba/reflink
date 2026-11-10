# Referral Print-Event Integrity and Least-Privilege Candidate

**Status: DESIGN / REVIEW ONLY — NOT AN EXECUTABLE MIGRATION**

Source: supplied schema export `reflink-production-schema.sql` (SHA-256 `72c5fc6ecce0cb44f348605ab1d371021c1e87c75d75c1d1a11367794a8224c3`) and static frontend call-site review. No SQL has been executed. Production and isolated staging are unchanged.

## 1. Confirmed current design

The exported schema shows:

- `public.referral_print_events`: identity `id`, `referral_id`, `printed_by`, `copy_label`, `print_number`, `created_at`.
- Primary key on `id`; foreign keys to `referrals(id)` and `auth.users(id)`.
- Non-unique index on `(referral_id, created_at DESC)`.
- RLS enabled, with participant/admin SELECT policy.
- `authenticated` has ALL table privileges and ALL privileges on `referral_print_events_id_seq`.
- `log_referral_print(uuid,text)` is SECURITY DEFINER, checks administrator/referrer/receiving-facility authorization, allocates `MAX(print_number)+1`, inserts the event, and returns the number.
- Frontend calls the RPC and tolerates logging failure so printing can continue.

## 2. Risks

1. **Race condition:** concurrent calls for one referral can read the same maximum and allocate duplicate print numbers.
2. **No uniqueness invariant:** no unique constraint/index currently prevents duplicate `(referral_id, print_number)`.
3. **Excessive direct privileges:** authenticated users can directly modify or delete print history and use its identity sequence, bypassing the intended RPC contract.
4. **Authorization contract:** the existing function permits administrators, the referring user, or a user whose profile facility matches the referral's receiving facility. Preserve and test these exact participant categories unless product policy explicitly changes.

## 3. Proposed target state

- Keep participant/admin SELECT through the existing RLS policy.
- Revoke authenticated direct INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN and sequence privileges.
- Keep the existing RPC signature and integer return contract.
- Serialize print-number allocation per referral with a transaction-scoped advisory lock.
- Add a unique constraint/index on `(referral_id, print_number)`.
- Keep service-role access only as required by verified backend consumers.
- Keep frontend print behaviour non-blocking when the logging RPC fails.

## 4. Data preflight — required before adding uniqueness

Run on reconstructed synthetic staging first. On any target with existing rows, inspect duplicates:

```sql
SELECT referral_id, print_number, count(*) AS duplicate_count
FROM public.referral_print_events
GROUP BY referral_id, print_number
HAVING count(*) > 1;
```

If duplicates exist, stop. Do not automatically delete, renumber, or rewrite historical print events. Produce a reviewed reconciliation plan that preserves the audit meaning and obtains explicit approval.

Also verify no NULL values (the exported columns are NOT NULL), no unexpected out-of-range values, and the actual constraint/index state.

## 5. Candidate SQL — review only

This is a candidate sequence, not an executable migration. Validate exact catalog state, duplicates, function owner/grants, and transaction behaviour first.

### 5.1 Add uniqueness after successful preflight

```sql
ALTER TABLE public.referral_print_events
  ADD CONSTRAINT referral_print_events_referral_print_number_key
  UNIQUE (referral_id, print_number);
```

If the table size or lock profile makes a normal constraint unsuitable, evaluate a separately planned `CREATE UNIQUE INDEX CONCURRENTLY` deployment. Do not put a concurrent index build inside a transaction-wrapped migration.

### 5.2 Serialize allocation and harden the function path

```sql
CREATE OR REPLACE FUNCTION public.log_referral_print(
  p_referral_id uuid,
  p_copy_label text DEFAULT 'REFERRAL COPY'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_next_number integer;
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  IF NOT EXISTS (
    SELECT 1
    FROM public.referrals AS r
    WHERE r.id = p_referral_id
      AND (
        public.is_administrator()
        OR r.referring_user_id = v_actor
        OR r.receiving_facility_id = (
          SELECT p.facility_id
          FROM public.profiles AS p
          WHERE p.id = v_actor
        )
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to print this referral.';
  END IF;

  -- Serialize number allocation for this referral for the duration
  -- of the transaction. Hash collisions only cause extra serialization.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reflink:print:' || p_referral_id::text,
      0
    )
  );

  SELECT COALESCE(MAX(pe.print_number), 0) + 1
    INTO v_next_number
  FROM public.referral_print_events AS pe
  WHERE pe.referral_id = p_referral_id;

  INSERT INTO public.referral_print_events (
    referral_id,
    printed_by,
    copy_label,
    print_number
  )
  VALUES (
    p_referral_id,
    v_actor,
    COALESCE(NULLIF(pg_catalog.btrim(p_copy_label), ''), 'REFERRAL COPY'),
    v_next_number
  );

  RETURN v_next_number;
END;
$function$;
```

Review notes:
- Recheck `auth.uid()` behaviour for authenticated and service-role contexts. The existing function requires a participant identity for the insert because `printed_by` is NOT NULL; do not silently introduce service-role calls with NULL actor.
- Preserve function owner and exact EXECUTE grants intentionally. Exported owner is `postgres`; authenticated and service_role have EXECUTE; PUBLIC is revoked.
- The advisory lock key is derived from a namespaced referral UUID. Hash collisions are safe for correctness but may serialize unrelated referrals.
- The unique constraint remains the final integrity guard even with the advisory lock.
- The RPC's return value and default copy label remain compatible with the inspected frontend.
- This candidate does not change print-history RLS, retention, or frontend failure tolerance.

### 5.3 Restrict direct client writes

After confirming there are no supported direct writers, the candidate grant correction is:

```sql
REVOKE ALL PRIVILEGES
ON TABLE public.referral_print_events
FROM authenticated;

GRANT SELECT
ON TABLE public.referral_print_events
TO authenticated;

REVOKE ALL PRIVILEGES
ON SEQUENCE public.referral_print_events_id_seq
FROM authenticated;
```

The existing participant/admin SELECT policy remains the row-level boundary. The function's SECURITY DEFINER execution context must be verified to retain the required insert capability after these revocations. Do not grant authenticated direct INSERT to make the RPC work.

## 6. Synthetic staging acceptance tests

| Test | Expected result |
|---|---|
| Administrator calls RPC | Authorized; next integer returned |
| Referring user calls RPC | Authorized; next integer returned |
| Assigned receiving-facility user calls RPC | Authorized; next integer returned |
| Unrelated authenticated user calls RPC | Rejected; no event |
| Anonymous user calls RPC | Rejected |
| Missing profile / NULL actor | Rejected without inserting an invalid row |
| Blank copy label | Normalised to `REFERRAL COPY` |
| Custom copy label | Preserved after trimming |
| Parallel same-referral calls | All succeed with distinct sequential numbers |
| Parallel different-referral calls | Correct independent sequences |
| Authenticated direct SELECT | Only rows allowed by participant/admin RLS |
| Authenticated direct INSERT/UPDATE/DELETE | Denied |
| Authenticated TRUNCATE and sequence operations | Denied |
| Service-side approved call | Works only under explicitly approved actor semantics |
| Frontend RPC failure | Printing still proceeds, matching current contract |
| Existing print history | No unintended deletion or renumbering |
| Constraint | Duplicate `(referral_id, print_number)` impossible |

Concurrency testing must use multiple independent database sessions, not sequential calls in one transaction. Include a high-contention same-referral test and verify no duplicate numbers.

## 7. Release gates

- Reconstruct and verify the baseline on isolated staging.
- Inspect existing print rows and resolve duplicates only through an approved plan.
- Verify function owner, SECURITY DEFINER, search path, grants, RLS and frontend call contract.
- Run all synthetic tests, including genuine parallel-session contention.
- Confirm no external direct writers before revoking privileges.
- Review lock impact and migration transaction behaviour.
- Merge through the normal PR process.
- Production deployment remains blocked until the missing historical migration is resolved or formally superseded by a reviewed baseline reconstruction, and all release gates pass.

**Environment safety:** no SQL was executed. Production remains read-only; isolated staging remains unchanged.
