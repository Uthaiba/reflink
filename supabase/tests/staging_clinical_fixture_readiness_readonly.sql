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
  (SELECT count(*) FROM active_facilities WHERE facility_type='primary_health_centre') active_phc_facility_count,
  (SELECT count(*) FROM active_facilities WHERE facility_type='general_hospital') active_hospital_count,
  (SELECT count(*) FROM roles WHERE role='phc_staff' AND facility_id IN (SELECT id FROM active_facilities WHERE facility_type='primary_health_centre')) phc_staff_count,
  (SELECT count(*) FROM roles WHERE role='receiving_staff' AND facility_id IN (SELECT id FROM active_facilities WHERE facility_type='general_hospital')) receiving_staff_count,
  (SELECT count(DISTINCT facility_id) FROM roles WHERE role='receiving_staff' AND facility_id IN (SELECT id FROM active_facilities)) distinct_receiving_facilities,
  (SELECT count(*) FROM roles WHERE role='administrator') administrator_count,
  (SELECT count(*) FROM public.referrals WHERE is_test=true) synthetic_referral_count,
  (SELECT count(*) FROM public.referrals WHERE is_test=false) non_test_referral_count
)
SELECT *,
 CASE WHEN active_phc_facility_count>=1 AND active_hospital_count>=2
  AND phc_staff_count>=1 AND receiving_staff_count>=2
  AND distinct_receiving_facilities>=2 AND administrator_count>=1
  AND synthetic_referral_count>=1
  THEN 'READY_FOR_MANUAL_FIXTURE_VALIDATION'
  ELSE 'NOT_READY: requires one PHC, two hospitals, assigned Auth staff and synthetic referral'
 END AS clinical_fixture_readiness
FROM stats;
