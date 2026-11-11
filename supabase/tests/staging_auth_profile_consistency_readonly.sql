-- REFLINK staging Auth/profile consistency preflight (read-only).
-- Execute only on staging rcskuzmvyugbanygizri with authorized SQL access.
-- Returns aggregate counts only; never exports emails, hashes or user IDs.
WITH auth_profile AS (
 SELECT u.id AS auth_id, p.id AS profile_id, p.role, p.facility_id,
        f.id AS existing_facility_id, f.is_active
 FROM auth.users u
 LEFT JOIN public.profiles p ON p.id = u.id
 LEFT JOIN public.facilities f ON f.id = p.facility_id
), orphan_profiles AS (
 SELECT count(*) AS total FROM public.profiles p
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
)
SELECT
 count(*) AS auth_users,
 count(*) FILTER (WHERE profile_id IS NULL) AS auth_without_profile,
 (SELECT total FROM orphan_profiles) AS profiles_without_auth,
 count(*) FILTER (WHERE role IN ('phc_staff','receiving_staff') AND facility_id IS NULL) AS clinical_staff_without_facility,
 count(*) FILTER (WHERE facility_id IS NOT NULL AND existing_facility_id IS NULL) AS missing_facility_assignments,
 count(*) FILTER (WHERE role IN ('phc_staff','receiving_staff') AND is_active IS FALSE) AS inactive_clinical_facility_assignments,
 CASE WHEN count(*) FILTER (WHERE profile_id IS NULL) = 0
  AND (SELECT total FROM orphan_profiles) = 0
  AND count(*) FILTER (WHERE role IN ('phc_staff','receiving_staff') AND facility_id IS NULL) = 0
  AND count(*) FILTER (WHERE facility_id IS NOT NULL AND existing_facility_id IS NULL) = 0
  AND count(*) FILTER (WHERE role IN ('phc_staff','receiving_staff') AND is_active IS FALSE) = 0
 THEN 'PASS: Auth/profile relationships structurally consistent'
 ELSE 'FAIL: resolve Auth/profile/facility inconsistency before clinical acceptance'
 END AS result
FROM auth_profile;
