# Staging facility-isolation and referral lifecycle RLS review — 2026-11-11

Scope: **read-only live catalog queries** against synthetic staging project `rcskuzmvyugbanygizri`. These are policy/source observations, **not authenticated negative tests**. Original production project was not queried or changed during this review.

## Observed policies
- `referrals` INSERT: authenticated PHC user must be the `referring_user_id` and belong to `referring_facility_id`.
- `referrals` SELECT: referring user or receiving facility matching profile facility ID.
- `referrals` UPDATE: receiving staff of assigned receiving facility; USING and WITH CHECK enforce receiving facility.
- `counter_referrals` INSERT: receiving staff member tied to receiving facility of referenced referral.
- `counter_referrals` SELECT: PHC staff at referring facility or receiving staff at receiving facility. No blanket administrator clinical access in the reviewed policy.
- `referral_updates` SELECT: referring user or user with matching receiving facility.
- `referral_events` and `referral_feedback`: authenticated policies are explicit false, requiring separate authorized server pathways.
- `facilities` SELECT: all authenticated users; write operations restricted to administrators.
- `profiles` SELECT: own profile or administrator. UPDATE policy allows own row or administrator. A BEFORE UPDATE trigger `guard_profile_security_fields` additionally rejects non-administrator changes to id, full_name, role, facility_id, phone, must_change_password and created_at. The trigger's protection was confirmed by inspecting its live definition; **not** by attempting a malicious write.

## Findings / risk
1. Facility isolation is **expressed in the policies**, but still requires Auth-issued tests for PHC A, receiving B, unrelated PHC C and administrator. A catalog inspection cannot prove correct behavior under actual JWT sessions.
2. The `profiles` self-update policy is broad; a trigger currently provides defense against protected-field escalation. Review every profile column and consider least-privilege column grants so that a trigger is not the only protection. Do not remove the trigger or narrow grants blindly: first inspect all legitimate profile-update call sites and the password-change Edge Function.
3. `referrals` SELECT authorizes a referring user, not necessarily all staff at the referring facility; verify intended clinical workflow and avoid accidentally expanding visibility.
4. `referral_updates` SELECT uses receiving facility and referring user predicates; confirm no auxiliary RPC or view bypasses this restriction.
5. Verify column-level UPDATE grants on `referrals` with real role tokens, plus counter-referral insert, read and correction history.
6. Confirm clinical attachments in private Storage buckets require participant authorization for every download and signed URL issuance.

## Acceptance matrix (synthetic only)
- PHC A can create its own referral to receiving B; PHC C cannot read or edit it.
- Receiving B can view and update allowed clinical fields; unrelated receiving facility cannot.
- PHC A can view B's counter-referral; PHC C cannot.
- Non-admin self-update of `profiles.role`, `facility_id`, `must_change_password` fails.
- Non-admin cannot create administrator profiles or mutate facilities.
- Unauthorized direct reads of `referral_events` and `referral_feedback` fail.
- Clinical Storage object access and notification subscriptions enforce participant boundaries.
- Run positive and negative tests under **real signed-in staging sessions**, not a SQL editor superuser.

## Change control
No database write, production deployment or merge performed. PR #2 stays draft. Do not declare RLS gate passed until the above cases return expected results.
