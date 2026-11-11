-- Align private investigation-file access with the referral participant boundary.
-- A PHC user's facility membership alone must not expose another referrer's files.
-- Receiving staff must belong to the assigned receiving facility.
DROP POLICY IF EXISTS "Authenticated users can view investigation result files" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can upload investigation result files" ON storage.objects;
CREATE POLICY "Authenticated users can view investigation result files"
ON storage.objects FOR SELECT TO authenticated
USING (
 bucket_id = 'referral-investigation-results'
 AND EXISTS (
  SELECT 1 FROM public.referrals r
  WHERE r.id::text = split_part(name, '/', 1)
    AND (
      r.referring_user_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'receiving_staff'
          AND p.facility_id = r.receiving_facility_id
      )
    )
 )
);
CREATE POLICY "Authorized users can upload investigation result files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
 bucket_id = 'referral-investigation-results'
 AND EXISTS (
  SELECT 1 FROM public.referrals r
  WHERE r.id::text = split_part(name, '/', 1)
    AND (
      r.referring_user_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'receiving_staff'
          AND p.facility_id = r.receiving_facility_id
      )
    )
 )
);
