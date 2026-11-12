-- Allow authorised PHC staff at the referring facility and receiving staff at the receiving facility
-- to read the counter-referral attached to a referral they are authorised to access.
drop policy if exists "Participants can view counter referrals" on public.counter_referrals;

create policy "Participants can view counter referrals"
on public.counter_referrals
for select
to authenticated
using (
  public.is_administrator()
  or exists (
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
