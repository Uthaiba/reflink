-- REFLINK staging: exposed SECURITY DEFINER function inventory.
-- Read-only catalog review. Pattern checks are triage signals, not proof of security.
-- Compare results with Supabase Security Advisor and manually review function bodies.
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_can_execute,
       (pg_get_functiondef(p.oid) ~* 'auth\\.uid\\(|is_administrator\\(|is_current_user_administrator\\(|administrator|phc_staff|receiving_staff') AS has_auth_guard_reference,
       (pg_get_functiondef(p.oid) ~* 'RAISE EXCEPTION') AS raises_exception,
       CASE WHEN p.proname='is_administrator' THEN 'Review boolean identity predicate and RLS dependencies'
            WHEN p.proname LIKE 'get_admin_%' OR p.proname LIKE 'get_facility_user_%' OR p.proname='get_referral_analytics_summary'
            THEN 'Verify administrator check before reading sensitive aggregates'
            ELSE 'Verify actor, referral and facility ownership checks before privileged mutation'
       END AS manual_review_required
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND has_function_privilege('authenticated',p.oid,'EXECUTE')
ORDER BY p.proname,arguments;
