# REFLINK — Real Auth clinical authorization acceptance (synthetic staging)

This is a **read-only** Node.js test runner for the existing REFLINK app. It uses the project's installed `@supabase/supabase-js` dependency. It does **not** create users, referrals or patient data.

## Preconditions

- Use **only** synthetic staging Supabase project `rcskuzmvyugbanygizri`. Never use production, service-role keys or real patient information.
- Provision four *test-only* Auth users through the approved staging account-provisioning workflow: PHC staff, receiving staff, unrelated receiving-facility staff and administrator. Assign verified profiles with matching roles and facility IDs.
- Create one synthetic referral using the approved PHC workflow, with the PHC user as `referring_user_id` and the receiving user's facility as `receiving_facility_id`. The unrelated receiving user must belong to a different facility.
- Do not place passwords, API keys, synthetic patient details or test environment files in Git or CI logs.

## Run locally (PowerShell)

Set these environment variables in your **private local shell**, using synthetic staging credentials only:

```powershell
$env:REFLINK_STAGING_URL = 'https://rcskuzmvyugbanygizri.supabase.co'
$env:REFLINK_STAGING_ANON_KEY = '<staging publishable/anon key>'
$env:REFLINK_STAGING_PHC_EMAIL = '<test PHC email>'
$env:REFLINK_STAGING_PHC_PASSWORD = '<test PHC password>'
$env:REFLINK_STAGING_RECEIVING_EMAIL = '<test receiving email>'
$env:REFLINK_STAGING_RECEIVING_PASSWORD = '<test receiving password>'
$env:REFLINK_STAGING_OUTSIDER_EMAIL = '<test unrelated facility email>'
$env:REFLINK_STAGING_OUTSIDER_PASSWORD = '<test unrelated facility password>'
$env:REFLINK_STAGING_ADMIN_EMAIL = '<test administrator email>'
$env:REFLINK_STAGING_ADMIN_PASSWORD = '<test administrator password>'
$env:REFLINK_STAGING_REFERRAL_ID = '<synthetic referral UUID>'
npm ci
node scripts/staging-authenticated-referral-access.mjs
```

Expected output: `PASS: real Auth sign-in, profile roles, referral visibility, facility isolation and analytics authorization`.

A missing credential exits before contacting Supabase. Wrong project hostname is rejected. The runner verifies its referral fixture and fails if the unrelated facility can read it or invoke admin analytics. It does not test write-side referral transitions, Storage file uploads, offline sync or notifications; those still require a separate controlled synthetic clinical acceptance session.

**Status:** Runner authored and syntax-checked in CI; execution with real staging users remains pending until the test accounts and referral fixture are available. Do not mistake CI syntax success for clinical acceptance.
