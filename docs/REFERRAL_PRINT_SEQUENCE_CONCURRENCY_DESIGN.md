# REFLINK referral print-number concurrency design

**Status:** Design proposal only — NOT an executable migration and NOT applied.  
**Scope:** public.log_referral_print(uuid,text) and public.referral_print_events.  
**Production boundary:** Production remains read-only. No function, constraint, index, grant, or data was changed.

## 1. Finding

The supplied schema export defines public.log_referral_print(p_referral_id uuid, p_copy_label text) as a SECURITY DEFINER function. After an authorization predicate, it calculates:

    SELECT COALESCE(MAX(print_number), 0) + 1
    INTO next_number
    FROM public.referral_print_events
    WHERE referral_id = p_referral_id;

It then inserts the selected number. Two concurrent transactions can both read the same current maximum before either inserts, producing duplicate print_number values for the same referral. The exported table has a primary key on id, but no unique constraint on (referral_id, print_number).

This is a concurrency correctness defect, not merely a display issue: print sequence numbers may be duplicated and the audit trail becomes ambiguous.

## 2. Proposed database invariants

1. A referral's print numbers are unique within that referral.
2. Concurrent print requests for the same referral are serialized before calculating the next number.
3. Requests for different referrals should not need to serialize with one another.
4. Authorization is evaluated against the locked referral record and the verified caller identity.
5. The print event and allocated number commit or roll back atomically.
6. The function returns the allocated number only after the event insert succeeds.

## 3. Candidate implementation strategy

Use a row-level lock on the target referral row inside the same transaction before reading the current maximum:

- Select the referral row by p_referral_id using FOR UPDATE.
- Capture the referral's referring user and receiving facility from that locked row.
- Apply the existing administrator/referrer/receiving-facility authorization rule to those captured values and the caller's profile.
- If no referral row exists, fail with a generic not-authorized/not-found result that does not disclose cross-facility existence.
- Calculate COALESCE(MAX(print_number), 0) + 1 only after the lock is held.
- Insert the print event and return the number.

A row lock on the referral serializes number allocation for that referral while allowing different referrals to proceed independently. It also means a print operation briefly conflicts with concurrent updates/deletes of that referral; validate this contention against the expected referral workflow and keep the transaction short.

Add a database uniqueness constraint on (referral_id, print_number) as a final integrity backstop. Before adding it to a database containing records, detect and resolve any existing duplicates under an approved audit-preserving remediation plan. Do not silently renumber historical print events.

Do not use MAX()+1 without a serialization mechanism. Do not rely on frontend disabling, JavaScript counters, or a unique constraint alone as the allocation strategy.

## 4. Authorization review required

The current function permits a caller when any of these conditions is true:
- public.is_administrator();
- the caller is the referral's referring_user_id;
- the caller's profile facility equals the referral's receiving_facility_id.

The third condition does not explicitly require the caller's profile role to be receiving_staff. Before changing the function, trace its actual frontend/RPC call sites and the intended print permissions for PHC staff, receiving staff, and administrators. Do not silently tighten or broaden the current authorization contract without workflow-owner approval and role-specific tests.

Retain the existing EXECUTE grant only for the approved caller roles. The current captured grant matrix records authenticated EXECUTE for this function; verify effective privileges and caller behavior after baseline reconstruction.

## 5. Required synthetic-staging tests

- First print for a referral returns 1.
- Sequential print calls return monotonically increasing values.
- A concurrent burst against one referral returns distinct values with no gaps caused by failed transactions beyond the explicitly approved behavior.
- Concurrent calls against different referrals can proceed independently.
- A failed event insert rolls back the allocation transaction and does not consume a committed number.
- A missing referral and a cross-facility unauthorized caller cannot infer referral existence.
- Administrator, referring user, and intended receiving-facility role cases match the approved policy.
- PHC staff at a receiving facility are explicitly allowed or denied according to the approved role contract.
- Existing duplicate numbers are detected before the unique constraint is added.
- The uniqueness constraint rejects a deliberately duplicated (referral_id, print_number) pair.
- Print history, copy labels, actor identity, and timestamps remain compatible with the UI and reporting.

Use synthetic referral and user records only. Run tests with genuinely concurrent database sessions; sequential unit tests and source-text assertions are insufficient.

## 6. Release decision

**NO-GO for modifying the production function now.** The race is established from the function body and table constraints in the supplied schema export. The safe next step is to trace application call sites, approve the print-role contract, then implement and stress-test the row-lock plus unique-constraint strategy in reconstructed synthetic staging.

Production remains read-only.
