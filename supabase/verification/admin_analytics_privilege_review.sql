-- REFLINK administrator analytics privilege verifier
-- READ-ONLY: safe to run against reconstructed synthetic staging or production.
-- This query does not create objects, change grants, or read referral rows.
-- Expected function signatures must be reviewed if the reporting API changes.

WITH expected(signature) AS (
  VALUES
    ('public.get_admin_referral_volume(date,date)'),
    ('public.get_admin_facility_referral_summary(date,date)'),
    ('public.get_admin_lga_referral_summary(date,date)'),
    ('public.get_admin_facility_reporting_coverage(date,date)'),
    ('public.get_admin_referral_pathway_summary(date,date)'),
    ('public.get_admin_acknowledgement_delay_alerts()')
),
resolved AS (
  SELECT
    e.signature,
    pg_catalog.to_regprocedure(e.signature) AS function_oid
  FROM expected AS e
)
SELECT
  r.signature,
  (p.oid IS NOT NULL) AS function_exists,
  CASE WHEN p.oid IS NOT NULL THEN p.prosecdef END AS is_security_definer,
  CASE WHEN p.oid IS NOT NULL THEN p.proowner::regrole::text END AS function_owner,
  CASE WHEN p.oid IS NOT NULL THEN p.proconfig END AS function_settings,
  CASE
    WHEN p.oid IS NULL THEN NULL
    ELSE COALESCE((
      SELECT bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE')
      FROM pg_catalog.aclexplode(
        COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) AS a
    ), false)
  END AS public_has_direct_execute_acl,
  CASE WHEN p.oid IS NOT NULL
    THEN pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
  END AS anon_can_execute_effectively,
  CASE WHEN p.oid IS NOT NULL
    THEN pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
  END AS authenticated_can_execute_effectively,
  CASE WHEN p.oid IS NOT NULL
    THEN pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
  END AS service_role_can_execute_effectively,
  CASE WHEN p.oid IS NOT NULL THEN pg_catalog.pg_get_functiondef(p.oid) END
    AS function_definition_for_manual_review
FROM resolved AS r
LEFT JOIN pg_catalog.pg_proc AS p
  ON p.oid = r.function_oid
ORDER BY r.signature;

-- Inspect the actual ACL entries separately. This distinguishes a direct
-- PUBLIC ACL entry from effective access inherited through role membership.
WITH expected(signature) AS (
  VALUES
    ('public.get_admin_referral_volume(date,date)'),
    ('public.get_admin_facility_referral_summary(date,date)'),
    ('public.get_admin_lga_referral_summary(date,date)'),
    ('public.get_admin_facility_reporting_coverage(date,date)'),
    ('public.get_admin_referral_pathway_summary(date,date)'),
    ('public.get_admin_acknowledgement_delay_alerts()')
)
SELECT
  e.signature,
  CASE WHEN p.oid IS NULL THEN NULL ELSE p.proowner::regrole::text END AS owner,
  a.grantee,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee_name,
  a.privilege_type,
  a.is_grantable
FROM expected AS e
LEFT JOIN pg_catalog.pg_proc AS p
  ON p.oid = pg_catalog.to_regprocedure(e.signature)
LEFT JOIN LATERAL pg_catalog.aclexplode(
  CASE
    WHEN p.oid IS NULL THEN NULL::pg_catalog.aclitem[]
    ELSE COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
  END
) AS a ON p.oid IS NOT NULL
ORDER BY e.signature, grantee_name, a.privilege_type;

-- Interpretation:
-- 1. All six functions should exist after the corresponding reviewed migrations
--    are installed in the target environment.
-- 2. is_security_definer should be true only because the reviewed definitions
--    intentionally aggregate data outside caller row-level access. Reassess
--    whether SECURITY INVOKER is feasible before expanding this pattern.
-- 3. function_settings should include search_path="" (empty search path).
-- 4. PUBLIC direct EXECUTE and anon effective EXECUTE should be false.
-- 5. authenticated effective EXECUTE should be true for the intended RPC callers.
-- 6. service_role effective EXECUTE is reported for review; do not infer it.
-- 7. This verifier cannot prove the function body enforces authorization,
--    aggregate correctness, suppression safety, or query-composition resistance.
--    Review the returned definitions and run the synthetic acceptance matrix.
-- 8. This verifier does not test future default privileges. It inspects only
--    the current function objects and effective privileges in this database.
