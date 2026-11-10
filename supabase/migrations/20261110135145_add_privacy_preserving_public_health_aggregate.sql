-- Privacy-preserving monthly public-health aggregate.
-- No patient identifiers, referral numbers or free-text clinical narrative.
-- Small cells (<5) are suppressed; access is service-role-only until approved.
CREATE OR REPLACE VIEW public.public_health_monthly_aggregate
WITH (security_invoker = true)
AS
SELECT
  date_trunc('month', r.created_at)::date AS reporting_month,
  f.state,
  f.lga,
  f.facility_type,
  r.urgency,
  r.status,
  count(*)::bigint AS referral_count
FROM public.referrals AS r
JOIN public.facilities AS f ON f.id = r.referring_facility_id
WHERE COALESCE(r.is_test, false) = false
GROUP BY date_trunc('month', r.created_at)::date, f.state, f.lga, f.facility_type, r.urgency, r.status
HAVING count(*) >= 5;

COMMENT ON VIEW public.public_health_monthly_aggregate IS
  'Service-role-only monthly aggregate for public-health planning. Excludes direct identifiers and free-text clinical content; suppresses groups smaller than five. Requires governance approval before external publication.';
REVOKE ALL ON public.public_health_monthly_aggregate FROM PUBLIC;
REVOKE ALL ON public.public_health_monthly_aggregate FROM anon;
REVOKE ALL ON public.public_health_monthly_aggregate FROM authenticated;
GRANT SELECT ON public.public_health_monthly_aggregate TO service_role;
