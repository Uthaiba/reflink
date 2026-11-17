-- REVIEW-ONLY CHANGESET. Not a production migration and never applied to hosted
-- projects by CI. Reconcile catalog/grants, generate a migration with the CLI,
-- review backup/rollback, then rehearse against synthetic staging before release.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.investigation_operations (
  revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  referral_id uuid NOT NULL REFERENCES public.referrals(id),
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, operation_id)
);
ALTER TABLE private.investigation_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.investigation_operations FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_referral_investigation(
  p_referral_id uuid, p_expected_records jsonb, p_index integer,
  p_patch jsonb, p_operation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_facility uuid;
  v_records jsonb;
  v_status text;
  v_referrer uuid;
  v_origin uuid;
  v_destination uuid;
  v_hash text;
  v_existing private.investigation_operations%ROWTYPE;
  v_revision bigint;
  v_record jsonb;
  v_path text;
  v_size bigint;
BEGIN
  IF v_actor IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  -- Lock current account/session/profile authorization against concurrent revocation.
  PERFORM 1 FROM auth.users u WHERE u.id=v_actor AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM auth.sessions s WHERE s.user_id=v_actor
    AND s.id::text=auth.jwt()->>'session_id'
    AND (s.not_after IS NULL OR s.not_after > now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  SELECT role, facility_id INTO v_role,v_facility FROM public.profiles
    WHERE id=v_actor AND must_change_password=false FOR SHARE;
  IF NOT FOUND OR v_role NOT IN ('phc_staff','receiving_staff') OR v_facility IS NULL
  THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;

  SELECT investigation_records,status,referring_user_id,referring_facility_id,receiving_facility_id
    INTO v_records,v_status,v_referrer,v_origin,v_destination
    FROM public.referrals
    WHERE id=p_referral_id AND (
      (v_role='receiving_staff' AND receiving_facility_id=v_facility) OR
      (v_role='phc_staff' AND referring_user_id=v_actor AND referring_facility_id=v_facility)
    ) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF v_status IN ('completed','cancelled') OR (v_role='phc_staff' AND v_status <> 'sent')
  THEN RAISE EXCEPTION 'Clinical record is not editable' USING ERRCODE='22023'; END IF;
  IF p_expected_records IS NULL OR jsonb_typeof(p_expected_records) <> 'array'
    OR pg_column_size(p_expected_records)>262144
    OR p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object'
    OR pg_column_size(p_patch)>16384 OR p_patch='{}'::jsonb
    OR p_index IS NULL OR p_index<0
  THEN RAISE EXCEPTION 'Invalid investigation update' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN (
    'result_status','result_value','result_unit','reference_range','interpretation','result_notes',
    'result_file_path','result_file_name','result_file_type','result_file_size'))
  THEN RAISE EXCEPTION 'Unsupported investigation field' USING ERRCODE='22023'; END IF;
  IF v_role='phc_staff' AND EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k
    WHERE k NOT IN ('result_file_path','result_file_name','result_file_type','result_file_size'))
  THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;

  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'referral',p_referral_id,'expected',p_expected_records,'index',p_index,'patch',p_patch
  )::text,'UTF8')),'hex');
  SELECT * INTO v_existing FROM private.investigation_operations
    WHERE actor_id=v_actor AND operation_id=p_operation_id;
  IF FOUND THEN
    IF v_existing.request_hash <> v_hash
    THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('status','replayed','revision',v_existing.revision::text,
      'investigation_records',v_records);
  END IF;
  -- The snapshot is sent in the request BODY, never a URL with clinical content.
  -- Holding the referral row lock makes the comparison and update atomic.
  IF v_records IS DISTINCT FROM p_expected_records THEN
    RETURN jsonb_build_object('status','conflict');
  END IF;
  IF p_index >= jsonb_array_length(v_records) OR jsonb_typeof(v_records->p_index)<>'object'
  THEN RAISE EXCEPTION 'Unsupported legacy investigation' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE e.key <> 'result_file_size'
    AND (jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>4000))
  THEN RAISE EXCEPTION 'Invalid investigation value' USING ERRCODE='22023'; END IF;
  IF p_patch ? 'result_status' AND p_patch->>'result_status' NOT IN (
    'pending','within_range','low','high','critical','invalid','normal','abnormal',
    'inconclusive','not_performed','positive','negative','reactive','non_reactive',
    'indeterminate','growth_detected','no_growth','detected','not_detected',
    'contaminated','no_significant_abnormality','abnormal_finding')
  THEN RAISE EXCEPTION 'Invalid investigation status' USING ERRCODE='22023'; END IF;

  IF p_patch ?| ARRAY['result_file_path','result_file_name','result_file_type','result_file_size'] THEN
    IF NOT p_patch ?& ARRAY['result_file_path','result_file_name','result_file_type','result_file_size']
      OR jsonb_typeof(p_patch->'result_file_size')<>'number'
      OR p_patch->>'result_file_type' NOT IN
        ('application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv')
      OR length(p_patch->>'result_file_name') NOT BETWEEN 1 AND 255
    THEN RAISE EXCEPTION 'Invalid attachment descriptor' USING ERRCODE='22023'; END IF;
    v_size := (p_patch->>'result_file_size')::bigint;
    v_path := p_patch->>'result_file_path';
    IF v_size<=0 OR v_size>10485760 OR (p_patch->>'result_file_size')::numeric<>v_size
      OR v_path !~ ('^'||p_referral_id::text||'/[0-9a-f-]{36}[.](pdf|jpg|png|webp|txt|csv)$')
      OR NOT EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.bucket_id='referral-investigation-results' AND o.name=v_path
          AND o.owner_id=v_actor::text
          AND (o.metadata->>'size')::bigint=v_size
          AND o.metadata->>'mimetype'=p_patch->>'result_file_type')
    THEN RAISE EXCEPTION 'Attachment verification failed' USING ERRCODE='22023'; END IF;
    IF v_role='phc_staff' AND nullif(v_records->p_index->>'result_file_path','') IS NOT NULL
    THEN RAISE EXCEPTION 'Registered document cannot be replaced by PHC' USING ERRCODE='22023'; END IF;
  END IF;

  v_record := (v_records->p_index)||p_patch;
  v_records := jsonb_set(v_records,ARRAY[p_index::text],v_record,false);
  INSERT INTO private.investigation_operations(actor_id,operation_id,referral_id,request_hash)
    VALUES(v_actor,p_operation_id,p_referral_id,v_hash) RETURNING revision INTO v_revision;
  UPDATE public.referrals SET investigation_records=v_records WHERE id=p_referral_id;
  -- Existing referral audit triggers execute in the same transaction. The private
  -- operation ledger adds actor/key/revision evidence without copying clinical JSON.
  RETURN jsonb_build_object('status','saved','revision',v_revision::text,
    'investigation_records',v_records);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_referral_investigation(uuid,jsonb,integer,jsonb,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_referral_investigation(uuid,jsonb,integer,jsonb,uuid)
  TO authenticated;

-- Ordinary REST updates must not bypass the atomic endpoint. Owner/service
-- maintenance remains privileged and requires a separate reviewed correction policy.
CREATE FUNCTION public.guard_investigation_client_writes()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
BEGIN
  IF current_user IN ('authenticated','anon') AND
    (NEW.investigation_records IS DISTINCT FROM OLD.investigation_records OR
     (OLD.status IN ('completed','cancelled') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)))
  THEN RAISE EXCEPTION 'Use the controlled clinical update service' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $guard$;
REVOKE ALL ON FUNCTION public.guard_investigation_client_writes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_investigation_client_writes BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.guard_investigation_client_writes();
-- Retire the legacy privileged attachment writer during coordinated cutover.
-- Its definition lacks the new session/password/closed-record checks.
DO $retire_legacy$
BEGIN
  IF to_regprocedure('public.register_referral_investigation_files(uuid,jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.register_referral_investigation_files(uuid,jsonb) FROM PUBLIC,anon,authenticated;
  END IF;
END;
$retire_legacy$;
COMMIT;
