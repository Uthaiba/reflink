-- Narrow referral notification log visibility to its actual clinical participants.
-- Preserve administrator reporting and the initiating referrer's access.
-- Facility-only membership no longer grants receiving-side access.
DROP POLICY IF EXISTS "Referral participants can view notification log" ON public.referral_notifications;
CREATE POLICY "Referral participants can view notification log"
ON public.referral_notifications FOR SELECT TO authenticated
USING (
 public.is_administrator()
 OR EXISTS (
   SELECT 1 FROM public.referrals r
   WHERE r.id = referral_notifications.referral_id
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
