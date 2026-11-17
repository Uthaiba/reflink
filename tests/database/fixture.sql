CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY, banned_until timestamptz, deleted_at timestamptz);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid, not_after timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text, facility_id uuid, must_change_password boolean NOT NULL DEFAULT false);
CREATE TABLE public.referrals(id uuid PRIMARY KEY, investigation_records jsonb, status text,
  referring_user_id uuid, referring_facility_id uuid, receiving_facility_id uuid);
CREATE TABLE storage.objects(bucket_id text,name text,owner_id text,metadata jsonb);
CREATE TABLE public.audit_log(id bigint GENERATED ALWAYS AS IDENTITY,referral_id uuid);
CREATE FUNCTION public.fixture_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.investigation_records->0->>'result_notes'='reject_fixture'
  THEN RAISE EXCEPTION 'Synthetic audit rejection'; END IF;
  INSERT INTO public.audit_log(referral_id) VALUES (NEW.id);
  RETURN NEW;
END; $$;
CREATE TRIGGER fixture_audit AFTER UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.fixture_audit();
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY assigned ON public.referrals TO authenticated USING
  (receiving_facility_id=(SELECT facility_id FROM public.profiles WHERE id=auth.uid()));
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,UPDATE ON public.referrals TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
