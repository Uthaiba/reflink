
-- Merge equivalent permissive policies without changing their effective OR semantics.
-- Profiles SELECT: the administrator policy already includes self-access.
DROP POLICY "Users can view their own profile" ON public.profiles;

-- Profiles UPDATE: preserve administrator updates and the user's password-flag update path.
ALTER POLICY "Administrators can update profiles" ON public.profiles
USING (public.is_administrator() OR id = (SELECT auth.uid()))
WITH CHECK (public.is_administrator() OR id = (SELECT auth.uid()));
DROP POLICY "Users can clear own password change flag" ON public.profiles;

-- Notification log SELECT: preserve administrator and referral-participant visibility.
ALTER POLICY "Referral participants can view notification log" ON public.referral_notifications
USING (
  public.is_administrator()
  OR EXISTS (
    SELECT 1 FROM public.referrals r
    WHERE r.id = referral_notifications.referral_id
      AND (
        r.referring_user_id = (SELECT auth.uid())
        OR r.receiving_facility_id = (
          SELECT p.facility_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
        )
      )
  )
);
DROP POLICY "Admins can view notification log" ON public.referral_notifications;

-- Referral SELECT: preserve both the referring user's and receiving facility's access.
ALTER POLICY "PHC staff can view their referrals" ON public.referrals
USING (
  referring_user_id = (SELECT auth.uid())
  OR receiving_facility_id = (
    SELECT p.facility_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
  )
);
DROP POLICY "Receiving facilities can view assigned referrals" ON public.referrals;
