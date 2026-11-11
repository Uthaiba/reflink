-- REFLINK v2.0: synthetic staging clinical-fixture readiness (read-only).
-- Run only on staging rcskuzmvyugbanygizri. No patient data returned.
-- Accounts must be provisioned via approved Auth workflow, never inserted
-- directly into public.profiles. Do not treat readiness as clinical acceptance.
WITH active_facilities AS (
 SELECT id, facility_type FROM public.facilities WHERE is_active IS DISTINCT FROM false
), roles AS (
 SELECT lower(trim(role)) role, facility_id FROM public.profiles
), stats AS (
 SELECT
  (SELECT count(*) FROM active_facilities) active_facility_count,
  (SELECT count(*) FROM roles WHERE role='phc_staff' AND facility_id IN (SELECT id FROM active_facilities)) phc_staff_count,
  (SELECT count(*) FROM roles WHERE role='receiving_staff' AND facility_id IN (SELECT id FROM active_facilities)) receiving_staff_count,
  (SELECT count(DISTINCT facility_id) FROM roles WHERE role='receiving_staff' AND facility_id IN (SELECT id FROM active_facilities)) distinct_receiving_facilities,
  (SELECT count(*) FROM roles WHERE role='administrator') administrator_count,
  (SELECT count(*) FROM public.referrals WHERE is_test=true) synthetic_referral_count,
  (SELECT count(*) FROM public.referrals WHERE is_test=false) non_test_referral_count
)
SELECT *,
 CASE WHEN phc_staff_count>=1 AND receiving_staff_count>=2
  AND distinct_receiving_facilities>=2 AND administrator_count>=1
  AND synthetic_referral_count>=1
  THEN 'READY_FOR_MANUAL_FIXTURE_VALIDATION'
  ELSE 'NOT_READY: provision synthetic Auth staff and clinical referral fixture'
 END AS clinical_fixture_readiness
FROM stats;
