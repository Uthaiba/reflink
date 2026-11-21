-- REPLAY-ONLY reconstruction of observed out-of-ledger schema definitions.
-- Not an approved hosted migration. Grants are intentionally not cloned.
BEGIN;
CREATE OR REPLACE FUNCTION public.register_referral_investigation_files(p_referral_id uuid, p_records jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF jsonb_typeof(p_records) IS DISTINCT FROM 'array' OR jsonb_array_length(p_records) > 50
  THEN RAISE EXCEPTION 'Invalid investigation records' USING ERRCODE='22023'; END IF;
  v_old := coalesce(v_referral.investigation_records::jsonb,'[]'::jsonb);
  IF jsonb_typeof(v_old) IS DISTINCT FROM 'array' OR jsonb_array_length(v_old) <> jsonb_array_length(p_records)
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
    -- Previously registered file metadata is immutable, not only its storage path.
    IF v_item ? 'result_file_path' AND
       (v_new->>'result_file_name' IS DISTINCT FROM v_item->>'result_file_name'
        OR v_new->>'result_file_type' IS DISTINCT FROM v_item->>'result_file_type'
        OR v_new->>'result_file_size' IS DISTINCT FROM v_item->>'result_file_size')
    THEN RAISE EXCEPTION 'Registered investigation file metadata cannot be modified' USING ERRCODE='22023'; END IF;
    -- A file descriptor must be complete and correspond to a stored object.
    -- Do not allow metadata-only records that imply an uploaded result.
    IF v_new ? 'result_file_path' THEN
      IF nullif(v_new->>'result_file_path','') IS NULL
         OR nullif(v_new->>'result_file_name','') IS NULL
         OR jsonb_typeof(v_new->'result_file_type') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_new->'result_file_size') IS DISTINCT FROM 'number'
         OR (v_new->>'result_file_size')::numeric <= 0
      THEN RAISE EXCEPTION 'Incomplete investigation file descriptor' USING ERRCODE='22023'; END IF;
    ELSIF v_new ? 'result_file_name' OR v_new ? 'result_file_type' OR v_new ? 'result_file_size'
    THEN RAISE EXCEPTION 'Investigation file metadata requires a storage path' USING ERRCODE='22023'; END IF;
    v_path := v_new->>'result_file_path';
    IF v_path IS NOT NULL AND (v_path !~ ('^' || p_referral_id::text || '/[^/]+$')
       OR NOT EXISTS (SELECT 1 FROM storage.objects o
          WHERE o.bucket_id='referral-investigation-results' AND o.name=v_path))
    THEN RAISE EXCEPTION 'Investigation file not found in referral storage' USING ERRCODE='22023'; END IF;
  END LOOP;
  END IF;
  UPDATE public.referrals SET investigation_records=p_records WHERE id=p_referral_id;
END; $function$;
REVOKE ALL ON FUNCTION public.register_referral_investigation_files(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_offline_submission_key_required CHECK (((sync_source IS DISTINCT FROM 'offline'::text) OR ((referring_user_id IS NOT NULL) AND (offline_client_id IS NOT NULL) AND (offline_client_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text))));
ALTER POLICY "Referral participants can view notification log" ON "public"."referral_notifications" TO "authenticated" USING ((public.is_administrator() OR (EXISTS ( SELECT 1
   FROM public.referrals r
  WHERE ((r.id = referral_notifications.referral_id) AND ((r.referring_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'receiving_staff'::text) AND (p.facility_id = r.receiving_facility_id))))))))));
ALTER POLICY "Authenticated users can view investigation result files" ON "storage"."objects" TO "authenticated" USING (((bucket_id = 'referral-investigation-results'::text) AND (EXISTS ( SELECT 1
   FROM public.referrals r
  WHERE (((r.id)::text = split_part(objects.name, '/'::text, 1)) AND ((r.referring_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'receiving_staff'::text) AND (p.facility_id = r.receiving_facility_id))))))))));
ALTER POLICY "Authorized users can upload investigation result files" ON "storage"."objects" TO "authenticated" WITH CHECK (((bucket_id = 'referral-investigation-results'::text) AND (EXISTS ( SELECT 1
   FROM public.referrals r
  WHERE (((r.id)::text = split_part(objects.name, '/'::text, 1)) AND ((r.referring_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'receiving_staff'::text) AND (p.facility_id = r.receiving_facility_id))))))))));
DROP POLICY "Authorized users can delete investigation result files" ON storage.objects;
DROP POLICY "Authorized users can replace investigation result files" ON storage.objects;
DROP POLICY "Authorized users can update investigation result files" ON storage.objects;
COMMIT;

