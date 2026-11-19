-- Disposable CI database only. Load the application report with minimal synthetic tables.
CREATE SCHEMA auth;
CREATE SCHEMA private;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION public.is_administrator() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE public.referrals(id integer PRIMARY KEY, discharged_at timestamptz, is_test boolean, patient_identifier text);
CREATE TABLE public.counter_referrals(referral_id integer);
CREATE TABLE private.phc_follow_up(referral_id integer, kind text);
\ir ../../supabase/migrations/20261118160000_continuity_milestones.sql

INSERT INTO public.referrals
SELECT i, '2026-11-01 00:00 Africa/Lagos', false, 'fixture-' || i FROM generate_series(1,20) i;
INSERT INTO public.referrals VALUES
  (21,'2026-11-15 12:00 Africa/Lagos',true,'flagged'),
  (22,'2026-11-15 12:00 Africa/Lagos',false,'SYNTHETIC-control'),
  (23,'2026-12-01 00:00 Africa/Lagos',false,'next-month');

INSERT INTO public.counter_referrals SELECT i FROM generate_series(1,7) i;
INSERT INTO public.counter_referrals VALUES (21),(22),(23);
INSERT INTO private.phc_follow_up SELECT i,'performed' FROM generate_series(6,10) i;
INSERT INTO private.phc_follow_up VALUES
  (6,'performed'),(6,'attempted'),(11,'attempted'),(11,'attempted'),
  (21,'performed'),(22,'performed'),(23,'performed');

DO $$ DECLARE counts bigint[]; BEGIN
  SELECT array_agg(referral_count ORDER BY milestone) INTO counts
    FROM public.get_admin_continuity_milestones('2026-11-01','2026-11-30');
  IF counts IS DISTINCT FROM ARRAY[7,5]::bigint[] THEN
    RAISE EXCEPTION 'Unexpected independent milestone counts %',counts;
  END IF;
END $$;
