# REFLINK — R-PHI Schema and Privileged Function Review

**Date:** 5 November 2026  
**Environment:** Connected production Supabase project, read-only inspection only  
**Status:** Findings for engineering review; no production changes made.

## Read-only schema inspection

The information_schema catalog was queried for columns in `referrals`, `counter_referrals`, `facilities`, `profiles`, `referral_events` and `referral_updates`. The inspection returned schema metadata only; it did not retrieve patient row values.

The inspection confirmed these useful workflow timestamps in `referrals`: `created_at`, `acknowledged_at`, `patient_arrived_at`, `assessment_completed_at`, `admission_at`, `discharged_at` and `completed_at`. It also confirmed `referring_facility_id`, `receiving_facility_id`, `is_test`, `sync_source` and `ack_due_at`.

The `counter_referrals` table includes `referral_id`, `receiving_user_id`, structured outcome, clinical narrative fields and `created_at`. The clinical narrative fields must never be exposed through R-PHI aggregate APIs or AI reporting prompts.

The `facilities` table includes facility type, state, LGA and active status, alongside direct contact/address fields. Aggregate geography must be approved and small-cell protected. The `profiles` table contains identity/contact and role/facility assignment fields; R-PHI must not expose user-level identity or performance.

## Privileged function inspection

The current `public.is_administrator()` helper was inspected using PostgreSQL catalog metadata and `pg_get_functiondef`. The observed definition is:

- Owner: `postgres`
- Language: SQL
- Security mode: `SECURITY DEFINER`
- search_path: `public`
- Body checks `profiles.id = auth.uid()` and `role = 'administrator'`
- Observed execute grants: `authenticated`, `service_role`, and owner `postgres`; no `anon` execute grant appeared in the inspected ACL.

The body schema-qualifies the profiles table and calls `auth.uid()`. Nevertheless, a SECURITY DEFINER helper requires careful review of owner privileges, function ACL, schema exposure, search_path and every caller that depends on it.

## Implications for the proposed R-PHI RPC

The proposed `get_admin_referral_volume` and `submit_counter_referral` functions are not deployed. Before applying them:

1. Review whether SECURITY DEFINER is necessary and whether an internal non-exposed schema is preferable.
2. Verify function owner and ensure no unintended PUBLIC/anon execute privilege remains.
3. Verify all referenced relations and helper functions are schema-qualified and search_path is fixed.
4. Confirm caller identity is derived from `auth.uid()`, not user-editable metadata.
5. Review the exact privilege boundary and RLS bypass effect of the function owner.
6. Test administrator and receiving-facility role checks with synthetic users in a non-production environment.
7. Test facility mismatch, inactive profiles, concurrent requests, duplicate retries and failure rollback.
8. Run Supabase security advisors after any approved schema change.

## Limitations

Catalog inspection does not establish data completeness, semantic validity, production query performance, or clinical suitability of the fields. Indicator definitions in `RPHI_INDICATOR_DATA_DICTIONARY.md` remain candidates pending clinical/public-health approval and data-quality profiling.

No patient rows were queried. No production schema, function, grant, RLS policy, setting, patient record or deployment was modified during this review.
