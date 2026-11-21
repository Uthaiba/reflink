BEGIN;
CREATE TABLE private.phc_follow_up (
  operation_id uuid PRIMARY KEY,
  referral_id uuid NOT NULL REFERENCES public.referrals(id),
  facility_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('attempted','performed')),
  encounter_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (length(btrim(outcome)) BETWEEN 1 AND 2000),
  next_action text NOT NULL CHECK (length(next_action) <= 2000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON private.phc_follow_up(referral_id, encounter_at);
ALTER TABLE private.phc_follow_up ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.phc_follow_up FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.phc_follow_up_history(p_referral uuid, p_operation uuid DEFAULT NULL,
 p_kind text DEFAULT NULL, p_encounter timestamptz DEFAULT NULL, p_outcome text DEFAULT NULL,
 p_next text DEFAULT '') RETURNS TABLE(kind text, encounter_at timestamptz, outcome text, next_action text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE facility uuid; discharge timestamptz; previous private.phc_follow_up%ROWTYPE;
BEGIN
 SELECT r.referring_facility_id,r.discharged_at INTO facility,discharge
 FROM public.referrals r JOIN public.profiles p ON p.facility_id=r.referring_facility_id
 JOIN auth.users u ON u.id=p.id JOIN auth.sessions s ON s.user_id=u.id
 WHERE r.id=p_referral AND r.status IN ('discharged','completed') AND p.id=auth.uid()
 AND p.role='phc_staff' AND p.must_change_password=false AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=now()) AND s.id::text=auth.jwt()->>'session_id'
 AND (s.not_after IS NULL OR s.not_after>now()) FOR SHARE OF r,p,u,s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Follow-up unavailable' USING ERRCODE='42501'; END IF;
 IF p_operation IS NOT NULL THEN
   IF p_encounter IS NULL OR NOT isfinite(p_encounter) OR p_encounter>clock_timestamp() OR p_encounter<discharge THEN
     RAISE EXCEPTION 'Invalid encounter time'; END IF;
   INSERT INTO private.phc_follow_up(operation_id,referral_id,facility_id,actor_id,kind,encounter_at,outcome,next_action)
   VALUES(p_operation,p_referral,facility,auth.uid(),p_kind,p_encounter,btrim(p_outcome),btrim(p_next))
   ON CONFLICT(operation_id) DO NOTHING;
   SELECT * INTO STRICT previous FROM private.phc_follow_up WHERE operation_id=p_operation;
   IF ROW(previous.referral_id,previous.actor_id,previous.kind,previous.encounter_at,previous.outcome,previous.next_action)
     IS DISTINCT FROM ROW(p_referral,auth.uid(),p_kind,p_encounter,btrim(p_outcome),btrim(p_next)) THEN
     RAISE EXCEPTION 'Conflicting follow-up submission'; END IF;
 END IF;
 RETURN QUERY SELECT f.kind,f.encounter_at,f.outcome,f.next_action FROM private.phc_follow_up f
 WHERE f.referral_id=p_referral AND f.facility_id=facility ORDER BY f.encounter_at DESC,f.recorded_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.phc_follow_up_history(uuid,uuid,text,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phc_follow_up_history(uuid,uuid,text,timestamptz,text,text) TO authenticated;
COMMIT;
