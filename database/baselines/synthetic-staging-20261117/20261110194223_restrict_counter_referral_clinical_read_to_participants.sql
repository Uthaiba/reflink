-- Keep individual counter-referral clinical feedback within the referring and receiving facilities.
-- Administrator public-health reporting remains aggregate-only through the dedicated reporting RPCs.
drop policy if exists "Participants can view counter referrals" on public.counter_referrals;

create policy "Participants can view counter referrals"
on public.counter_referrals
for select
to authenticated
using (
  exists (
    select 1
    from public.referrals r
    join public.profiles p on p.id = (select auth.uid())
    where r.id = counter_referrals.referral_id
      and (
        (p.role = 'phc_staff' and r.referring_facility_id = p.facility_id)
        or
        (p.role = 'receiving_staff' and r.receiving_facility_id = p.facility_id)
      )
  )
);
