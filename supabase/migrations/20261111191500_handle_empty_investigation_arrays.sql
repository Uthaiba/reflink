-- Correct zero-length investigation arrays: PostgreSQL FOR 0..-1 is not an empty loop.
-- Preserve the restricted caller checks and function grants.
-- Atomic, narrowly scoped post-upload metadata registration for a referral's author.
-- Does not grant the PHC role general UPDATE rights on referrals.
CREATE OR REPLACE FUNCTION public.register_referral_investigation_files(
  p_referral_id uuid,
  p_records jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_referral public.referrals%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
  v_item jsonb;
  v_path text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_referral FROM public.referrals
    WHERE id=p_referral_id AND referring_user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referral not accessible' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
      AND p.role='phc_staff' AND p.facility_id=v_referral.referring_facility_id)
  THEN RAISE EXCEPTION 'PHC facility authorization required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_records) <> 'array' OR jsonb_array_length(p_records) > 50
  THEN RAISE EXCEPTION 'Invalid investigation records' USING ERRCODE='22023'; END IF;
  v_old := coalesce(v_referral.investigation_records::jsonb,'[]'::jsonb);
  IF jsonb_typeof(v_old) <> 'array' OR jsonb_array_length(v_old) <> jsonb_array_length(p_records)
  THEN RAISE EXCEPTION 'Investigation count cannot change' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_records) > 0 THEN
  FOR i IN 0..jsonb_array_length(p_records)-1 LOOP
    v_new := p_records->i;
    v_item := v_old->i;
    IF jsonb_typeof(v_new) <> 'object'
      OR (v_new - 'result_file_path' - 'result_file_name' - 'result_file_type' - 'result_file_size')
         IS DISTINCT FROM (v_item - 'result_file_path' - 'result_file_name' - 'result_file_type' - 'result_file_size')
    THEN RAISE EXCEPTION 'Clinical investigation fields cannot change' USING ERRCODE='22023'; END IF;
    IF v_item ? 'result_file_path' AND v_new->>'result_file_path' IS DISTINCT FROM v_item->>'result_file_path'
    THEN RAISE EXCEPTION 'Existing investigation file cannot be replaced' USING ERRCODE='22023'; END IF;
    v_path := v_new->>'result_file_path';
    IF v_path IS NOT NULL AND (v_path !~ ('^' || p_referral_id::text || '/[^/]+$')
       OR NOT EXISTS (SELECT 1 FROM storage.objects o
          WHERE o.bucket_id='referral-investigation-results' AND o.name=v_path))
    THEN RAISE EXCEPTION 'Investigation file not found in referral storage' USING ERRCODE='22023'; END IF;
  END LOOP;
  END IF;
  UPDATE public.referrals SET investigation_records=p_records WHERE id=p_referral_id;
END; $$;
REVOKE ALL ON FUNCTION public.register_referral_investigation_files(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_referral_investigation_files(uuid,jsonb) TO authenticated;
