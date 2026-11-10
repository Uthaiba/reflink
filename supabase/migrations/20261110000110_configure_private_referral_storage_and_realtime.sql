
-- Recreate the production private attachment bucket and referral-scoped policies in staging.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('referral-investigation-results','referral-investigation-results',false,10485760,
 ARRAY['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv']::text[])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE POLICY "Authenticated users can view investigation result files" ON storage.objects
FOR SELECT TO authenticated USING (
 bucket_id='referral-investigation-results' AND EXISTS (
  SELECT 1 FROM public.referrals r WHERE r.id::text=split_part(objects.name,'/',1)
  AND (r.referring_user_id=(SELECT auth.uid())
   OR r.referring_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid()))
   OR r.receiving_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid())))
 ));

CREATE POLICY "Authorized users can upload investigation result files" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
 bucket_id='referral-investigation-results' AND EXISTS (
  SELECT 1 FROM public.referrals r WHERE r.id::text=split_part(objects.name,'/',1)
  AND (r.referring_user_id=(SELECT auth.uid())
   OR r.referring_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid()))
   OR r.receiving_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid())))
 ));

CREATE POLICY "Authorized users can update investigation result files" ON storage.objects
FOR UPDATE TO authenticated USING (
 bucket_id='referral-investigation-results' AND EXISTS (
  SELECT 1 FROM public.referrals r WHERE r.id::text=split_part(objects.name,'/',1)
  AND (r.referring_user_id=(SELECT auth.uid())
   OR r.referring_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid()))
   OR r.receiving_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid())))
 )) WITH CHECK (
 bucket_id='referral-investigation-results' AND EXISTS (
  SELECT 1 FROM public.referrals r WHERE r.id::text=split_part(objects.name,'/',1)
  AND (r.referring_user_id=(SELECT auth.uid())
   OR r.referring_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid()))
   OR r.receiving_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid())))
 ));

CREATE POLICY "Authorized users can replace investigation result files" ON storage.objects
FOR UPDATE TO authenticated USING (
 bucket_id='referral-investigation-results' AND EXISTS (
  SELECT 1 FROM public.referrals r WHERE r.id::text=split_part(objects.name,'/',1)
  AND (r.referring_user_id=(SELECT auth.uid())
   OR r.referring_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid()))
   OR r.receiving_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid())))
 )) WITH CHECK (
 bucket_id='referral-investigation-results' AND EXISTS (
  SELECT 1 FROM public.referrals r WHERE r.id::text=split_part(objects.name,'/',1)
  AND (r.referring_user_id=(SELECT auth.uid())
   OR r.referring_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid()))
   OR r.receiving_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid())))
 ));

CREATE POLICY "Authorized users can delete investigation result files" ON storage.objects
FOR DELETE TO authenticated USING (
 bucket_id='referral-investigation-results' AND EXISTS (
  SELECT 1 FROM public.referrals r WHERE r.id::text=split_part(objects.name,'/',1)
  AND (r.referring_user_id=(SELECT auth.uid())
   OR r.referring_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid()))
   OR r.receiving_facility_id=(SELECT p.facility_id FROM public.profiles p WHERE p.id=(SELECT auth.uid())))
 ));

ALTER PUBLICATION supabase_realtime ADD TABLE public.referrals;
