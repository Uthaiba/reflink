-- REVIEW-ONLY: apply after atomic_investigation_updates.sql in an isolated rehearsal.
-- No hosted database is changed by the CI workflow.
BEGIN;
CREATE TABLE private.clinical_operations (
  revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL, operation_id uuid NOT NULL,
  referral_id uuid NOT NULL REFERENCES public.referrals(id),
  operation_kind text NOT NULL CHECK (operation_kind IN ('assessment','admission','discharge')),
  request_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,operation_id)
);
ALTER TABLE private.clinical_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.clinical_operations FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_referral_clinical(
  p_referral_id uuid, p_kind text, p_expected jsonb, p_patch jsonb, p_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_facility uuid;
  v_ref public.referrals%ROWTYPE;
  v_expected public.referrals%ROWTYPE;
  v_input public.referrals%ROWTYPE;
  v_previous private.clinical_operations%ROWTYPE;
  v_compare text[];
  v_allowed text[];
  v_return_keys text[];
  v_hash text;
  v_revision bigint;
  v_result jsonb;
  v_time timestamptz := clock_timestamp();
BEGIN
  IF v_actor IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM auth.users u WHERE u.id=v_actor AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM auth.sessions s WHERE s.user_id=v_actor
    AND s.id::text=auth.jwt()->>'session_id'
    AND (s.not_after IS NULL OR s.not_after>now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  SELECT facility_id INTO v_facility FROM public.profiles
    WHERE id=v_actor AND role='receiving_staff' AND must_change_password=false FOR SHARE;
  IF NOT FOUND OR v_facility IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_ref FROM public.referrals
    WHERE id=p_referral_id AND receiving_facility_id=v_facility FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF v_ref.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'Clinical record is closed' USING ERRCODE='22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('assessment','admission','discharge')
    OR p_expected IS NULL OR jsonb_typeof(p_expected)<>'object'
    OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb
    OR pg_column_size(p_expected)>262144 OR pg_column_size(p_patch)>262144
  THEN RAISE EXCEPTION 'Invalid clinical update' USING ERRCODE='22023'; END IF;

  IF p_kind='assessment' THEN
    v_compare := ARRAY['status','assessment_findings','final_diagnosis','diagnosis_category',
      'diagnosis_status','treatment_provided','procedures_performed','clinical_feedback',
      'disposition','assessment_completed_at','admission_at','discharged_at'];
    v_allowed := ARRAY['assessment_findings','final_diagnosis','diagnosis_category',
      'diagnosis_status','treatment_provided','procedures_performed','clinical_feedback','disposition'];
  ELSE
    v_compare := ARRAY['status','admission_at','ward_unit','admission_diagnosis',
      'clinical_progress','inpatient_treatment','discharge_diagnosis','condition_at_discharge',
      'discharge_medications','follow_up_plan','discharged_at'];
    IF p_kind='admission' THEN
      v_allowed := ARRAY['admission_at','ward_unit','admission_diagnosis','clinical_progress','inpatient_treatment'];
    ELSE
      v_allowed := ARRAY['discharge_diagnosis','condition_at_discharge','discharge_medications','follow_up_plan'];
    END IF;
  END IF;
  IF NOT p_patch ?& v_allowed OR NOT p_expected ?& v_compare
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_expected) k WHERE NOT k=ANY(v_compare))
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE NOT k=ANY(v_allowed))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) e
      WHERE jsonb_typeof(e.value) NOT IN ('string','null') OR length(e.value#>>'{}')>20000)
  THEN RAISE EXCEPTION 'Unsupported clinical fields' USING ERRCODE='22023'; END IF;

  v_hash := encode(sha256(convert_to(jsonb_build_object('referral',p_referral_id,
    'kind',p_kind,'expected',p_expected,'patch',p_patch)::text,'UTF8')),'hex');
  SELECT * INTO v_previous FROM private.clinical_operations
    WHERE actor_id=v_actor AND operation_id=p_operation_id;
  v_return_keys := v_compare || v_allowed || ARRAY['id','referral_number'];
  IF FOUND THEN
    IF v_previous.request_hash<>v_hash THEN
      RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='22023';
    END IF;
    SELECT jsonb_object_agg(key,value) INTO v_result FROM jsonb_each(to_jsonb(v_ref))
      WHERE key=ANY(v_return_keys);
    RETURN jsonb_build_object('status','replayed','revision',v_previous.revision::text,'referral',v_result);
  END IF;

  -- Typed timestamps compare equivalent representations of the same instant.
  v_expected := jsonb_populate_record(NULL::public.referrals,p_expected);
  IF EXISTS (SELECT 1 FROM unnest(v_compare) k
    WHERE (to_jsonb(v_ref)->k) IS DISTINCT FROM (to_jsonb(v_expected)->k))
  THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF (p_kind='assessment' AND v_ref.status<>'under_assessment')
    OR (p_kind IN ('admission','discharge') AND v_ref.status<>'admitted')
  THEN RAISE EXCEPTION 'Clinical transition is not allowed' USING ERRCODE='22023'; END IF;
  v_input := jsonb_populate_record(NULL::public.referrals,p_patch);

  IF p_kind='assessment' THEN
    IF nullif(btrim(v_input.assessment_findings),'') IS NULL
      OR nullif(btrim(v_input.final_diagnosis),'') IS NULL
      OR nullif(btrim(v_input.diagnosis_category),'') IS NULL
      OR v_input.diagnosis_status IS NULL OR v_input.diagnosis_status NOT IN ('suspected','provisional','confirmed')
      OR v_input.disposition IS NULL OR v_input.disposition NOT IN ('admitted','discharged','referred_again','observation')
    THEN RAISE EXCEPTION 'Required assessment fields are invalid' USING ERRCODE='22023'; END IF;
  ELSIF p_kind='admission' THEN
    IF nullif(btrim(v_input.ward_unit),'') IS NULL OR nullif(btrim(v_input.admission_diagnosis),'') IS NULL
    THEN RAISE EXCEPTION 'Required admission fields are invalid' USING ERRCODE='22023'; END IF;
  ELSE
    IF nullif(btrim(v_input.discharge_diagnosis),'') IS NULL
      OR nullif(btrim(v_input.condition_at_discharge),'') IS NULL
      OR nullif(btrim(v_input.follow_up_plan),'') IS NULL
    THEN RAISE EXCEPTION 'Required discharge fields are invalid' USING ERRCODE='22023'; END IF;
  END IF;

  INSERT INTO private.clinical_operations(actor_id,operation_id,referral_id,operation_kind,request_hash)
    VALUES(v_actor,p_operation_id,p_referral_id,p_kind,v_hash) RETURNING revision INTO v_revision;
  IF p_kind='assessment' THEN
    UPDATE public.referrals SET
      assessment_findings=v_input.assessment_findings, final_diagnosis=v_input.final_diagnosis,
      diagnosis_category=v_input.diagnosis_category, diagnosis_status=v_input.diagnosis_status,
      treatment_provided=v_input.treatment_provided, procedures_performed=v_input.procedures_performed,
      clinical_feedback=v_input.clinical_feedback, disposition=v_input.disposition,
      assessment_completed_at=v_time,
      status=CASE WHEN v_input.disposition='observation' THEN 'under_assessment' ELSE v_input.disposition END,
      admission_at=CASE WHEN v_input.disposition='admitted' THEN v_time ELSE admission_at END,
      discharged_at=CASE WHEN v_input.disposition='discharged' THEN v_time ELSE discharged_at END
    WHERE id=p_referral_id RETURNING * INTO v_ref;
  ELSIF p_kind='admission' THEN
    UPDATE public.referrals SET admission_at=coalesce(v_input.admission_at,admission_at,v_time),
      ward_unit=v_input.ward_unit, admission_diagnosis=v_input.admission_diagnosis,
      clinical_progress=v_input.clinical_progress, inpatient_treatment=v_input.inpatient_treatment
    WHERE id=p_referral_id RETURNING * INTO v_ref;
  ELSE
    UPDATE public.referrals SET discharge_diagnosis=v_input.discharge_diagnosis,
      condition_at_discharge=v_input.condition_at_discharge,
      discharge_medications=v_input.discharge_medications,follow_up_plan=v_input.follow_up_plan,
      discharged_at=v_time,status='discharged'
    WHERE id=p_referral_id RETURNING * INTO v_ref;
  END IF;
  -- Existing audit/status triggers participate in this same transaction.
  SELECT jsonb_object_agg(key,value) INTO v_result FROM jsonb_each(to_jsonb(v_ref))
    WHERE key=ANY(v_return_keys);
  RETURN jsonb_build_object('status','saved','revision',v_revision::text,'referral',v_result);
END; $function$;
REVOKE ALL ON FUNCTION public.save_referral_clinical(uuid,text,jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_referral_clinical(uuid,text,jsonb,jsonb,uuid) TO authenticated;

CREATE FUNCTION public.guard_clinical_client_writes() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $guard$
DECLARE v_fields text[] := ARRAY['assessment_findings','final_diagnosis','diagnosis_category',
  'diagnosis_status','treatment_provided','procedures_performed','clinical_feedback','disposition',
  'assessment_completed_at','admission_at','ward_unit','admission_diagnosis','clinical_progress',
  'inpatient_treatment','discharge_diagnosis','condition_at_discharge','discharge_medications',
  'follow_up_plan','discharged_at'];
BEGIN
  IF current_user IN ('authenticated','anon') AND (
    EXISTS (SELECT 1 FROM unnest(v_fields) k WHERE (to_jsonb(NEW)->k) IS DISTINCT FROM (to_jsonb(OLD)->k))
    OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('admitted','discharged','referred_again'))
  ) THEN RAISE EXCEPTION 'Use the clinical update service' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $guard$;
REVOKE ALL ON FUNCTION public.guard_clinical_client_writes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_clinical_client_writes BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.guard_clinical_client_writes();
COMMIT;
