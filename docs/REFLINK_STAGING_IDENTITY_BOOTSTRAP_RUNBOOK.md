# REFLINK synthetic staging identity bootstrap runbook

**Scope:** synthetic staging Supabase project `rcskuzmvyugbanygizri` only.  
**Application branch:** `reflink/staging-baseline-reconstruction-20261110`.  
**Purpose:** establish the first Auth-issued staging administrator and three synthetic facilities so that the existing protected `create-user` function can provision disposable role-test accounts.

## Safety requirements

- Confirm the Supabase dashboard project ref is exactly `rcskuzmvyugbanygizri` before creating anything.
- Do not use the production project `uwwzbljufqbzkjflpnll`.
- Use a dedicated, controlled test mailbox and a strong unique temporary password. Do not use a real staff account, patient data, or a production password.
- Never expose the Supabase service-role key in the browser, frontend environment, chat, GitHub, or local test scripts.
- Do not insert directly into `auth.users`, fabricate JWTs, disable `verify_jwt`, or weaken RLS.
- Record the operator, date/time, synthetic email and resulting Auth user UUID in the restricted staging operations record. Do not commit passwords or tokens.

## Preflight

1. In Supabase Dashboard, open the project whose reference is `rcskuzmvyugbanygizri`.
2. Open Table Editor and confirm `public.profiles` and `public.facilities` are empty. Confirm Auth > Users has no existing synthetic user. The last automated read-only check on 11 November 2026 found zero rows in all three.
3. Open Authentication > Users and create one user using a dedicated staging mailbox. Set a unique temporary password and confirm the user/email according to the project's staging Auth configuration.
4. Copy the generated Auth user UUID from the Auth Users table. The UUID must come from the actual Auth-created user; do not generate one independently.

## Create the first administrator profile and synthetic facilities

Open the SQL Editor for the same staging project. Replace the one UUID placeholder below with the actual Auth user UUID copied from Authentication > Users. Execute this script as the project owner through the dashboard SQL Editor, not through the public application.

```sql
begin;

-- The Auth user must already exist. This statement creates only its public profile.
insert into public.profiles (id, full_name, role, facility_id, must_change_password)
values (
  'REPLACE_WITH_AUTH_USER_UUID'::uuid,
  'REFLINK Staging Administrator',
  'administrator',
  null,
  true
);

-- Three synthetic facilities used only for role/facility isolation tests.
insert into public.facilities (name, facility_type, address, state, lga, is_active)
values
  ('REFLINK TEST PHC A', 'primary_health_centre', 'Synthetic test location A', 'Yobe', 'Test LGA A', true),
  ('REFLINK TEST RECEIVING B', 'general_hospital', 'Synthetic test location B', 'Yobe', 'Test LGA B', true),
  ('REFLINK TEST PHC C', 'primary_health_centre', 'Synthetic test location C', 'Yobe', 'Test LGA C', true);

commit;
```

If the profile insert fails, stop and inspect the error. Do not disable triggers or RLS to force it through. If any facility insert fails, roll back the transaction and investigate before retrying.

## Verify the bootstrap

Run this read-only query in the same staging SQL Editor:

```sql
select
  p.id,
  p.full_name,
  p.role,
  p.facility_id,
  p.must_change_password,
  u.email,
  u.email_confirmed_at is not null as email_confirmed
from public.profiles p
join auth.users u on u.id = p.id
where p.id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid;

select id, name, facility_type, state, lga, is_active
from public.facilities
where name in (
  'REFLINK TEST PHC A',
  'REFLINK TEST RECEIVING B',
  'REFLINK TEST PHC C'
)
order by name;
```

Expected result: exactly one matching administrator profile linked to the Auth user, role `administrator`, no facility assignment, `must_change_password=true`, and exactly three active synthetic facilities. Confirm no unrelated records were created.

## Provision role-test accounts through the real application

1. Open the staging Preview: `https://reflink-lk45n99t6-uthaibas-projects.vercel.app/`.
2. Sign in with the newly created staging administrator's Auth credentials.
3. Complete the forced password-change workflow if prompted.
4. Before using account provisioning, complete the CORS preflight checks in the acceptance plan. If the Preview origin is rejected, stop; configure the exact origin in the **staging Supabase Edge Function secret** `REFLINK_ALLOWED_ORIGINS` only. Do not use a wildcard and do not add this value to Vercel frontend variables.
5. Use the application's existing administrator user-management workflow, backed by the JWT-verified `create-user` Edge Function, to create:
   - PHC A: role `phc_staff`, facility `REFLINK TEST PHC A`
   - Receiving B: role `receiving_staff`, facility `REFLINK TEST RECEIVING B`
   - PHC C: role `phc_staff`, facility `REFLINK TEST PHC C`
6. Use separate controlled test mailboxes and unique temporary passwords for each account. Verify each new Auth user has exactly one matching `public.profiles` row and the expected role/facility assignment.
7. Never create additional administrators through direct SQL. Use the protected application provisioning path after the first administrator exists.

## Acceptance sequence after provisioning

- Sign in separately as PHC A, Receiving B and PHC C using real Auth-issued sessions.
- Confirm PHC A can create a synthetic referral to Receiving B.
- Confirm Receiving B can see and process only referrals assigned to B, and each permitted lifecycle update succeeds under the column-level UPDATE grants.
- Attempt protected-column updates (facility assignment, referral provenance, patient identifier, offline idempotency key) as Receiving B; expect permission denial.
- Confirm PHC C cannot see PHC A's referral and cannot access Receiving B's workflow or clinical feedback.
- Exercise investigation metadata, admission, discharge, counter-referral, notification visibility, Realtime updates, encrypted draft restore and forced password change.
- Test create-user rollback by using a controlled invalid profile condition in a disposable test case only; verify the function removes the just-created Auth user when profile creation fails.
- Record request/response outcomes, role, test case ID and timestamps. Do not store passwords, access tokens, patient data or clinical narrative in test evidence.
- Remove disposable Auth users through Auth Admin and remove synthetic facilities/profiles only after acceptance evidence is retained and a cleanup plan is approved.

## Current execution status

This runbook documents the controlled operator procedure; it does not claim the bootstrap has been performed. On 11 November 2026 the connected Supabase tools still did not expose Auth Admin user creation, and the staging identity/facility tables were empty. The project owner must perform the dashboard Auth creation and SQL Editor profile/facility seed. The application acceptance gate remains blocked until that happens.

## Evidence and change control

- Database: synthetic staging project only.
- Last verified migration history: 22 staging migrations, including the referral column-level UPDATE restriction and explicit authenticated referral-read audit guard.
- Last verified CI run: quality gate #296, all three jobs successful on commit `fdab1f0f5e6aac4f9386337c0ffe1bbe71a5c3e1`.
- PR #2 remains draft and unmerged. No production migration, user, secret, function, Auth setting or deployment change is authorised by this runbook.
