BEGIN;
CREATE FUNCTION public.get_admin_continuity_milestones(p_start_date date, p_end_date date)
RETURNS TABLE(milestone text, referral_count bigint, small_cell_suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_administrator() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL
     OR p_start_date <> date_trunc('month',p_start_date)::date
     OR p_end_date <> (p_start_date + interval '1 month - 1 day')::date THEN
    RAISE EXCEPTION 'Choose one calendar month' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  WITH cohort AS (
    SELECT r.id FROM public.referrals r
    WHERE r.discharged_at >= (p_start_date::timestamp AT TIME ZONE 'Africa/Lagos')
      AND r.discharged_at < ((p_end_date+1)::timestamp AT TIME ZONE 'Africa/Lagos')
      AND r.is_test IS FALSE AND r.patient_identifier NOT ILIKE 'SYNTHETIC-%'
  ), totals AS (
    SELECT count(*) AS episodes,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.counter_referrals c WHERE c.referral_id=r.id)) AS feedback,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM private.phc_follow_up f WHERE f.referral_id=r.id AND f.kind='performed')) AS performed
    FROM cohort r
  )
  SELECT m.label, CASE WHEN s.hide THEN NULL ELSE m.n END, s.hide FROM totals t
    CROSS JOIN LATERAL (VALUES ('Hospital feedback sent',t.feedback),('PHC follow-up performed',t.performed)) m(label,n)
    CROSS JOIN LATERAL (SELECT m.n BETWEEN 1 AND 4 OR (t.episodes-m.n) BETWEEN 1 AND 4 OR t.episodes BETWEEN 1 AND 4 AS hide) s;
END $$;
REVOKE ALL ON FUNCTION public.get_admin_continuity_milestones(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_continuity_milestones(date,date) TO authenticated;
COMMIT;
