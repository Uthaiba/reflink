
-- Staging performance baseline: indexes for uncovered foreign keys.
CREATE INDEX IF NOT EXISTS counter_referrals_receiving_user_id_idx ON public.counter_referrals (receiving_user_id);
CREATE INDEX IF NOT EXISTS feedback_provided_by_idx ON public.feedback (provided_by);
CREATE INDEX IF NOT EXISTS feedback_referral_id_idx ON public.feedback (referral_id);
CREATE INDEX IF NOT EXISTS profiles_facility_id_idx ON public.profiles (facility_id);
CREATE INDEX IF NOT EXISTS referral_events_performed_by_idx ON public.referral_events (performed_by);
CREATE INDEX IF NOT EXISTS referral_events_referral_id_idx ON public.referral_events (referral_id);
CREATE INDEX IF NOT EXISTS referral_feedback_receiving_facility_id_idx ON public.referral_feedback (receiving_facility_id);
CREATE INDEX IF NOT EXISTS referral_feedback_referral_id_idx ON public.referral_feedback (referral_id);
CREATE INDEX IF NOT EXISTS referral_feedback_submitted_by_idx ON public.referral_feedback (submitted_by);
CREATE INDEX IF NOT EXISTS referral_print_events_printed_by_idx ON public.referral_print_events (printed_by);
CREATE INDEX IF NOT EXISTS referral_updates_referral_id_idx ON public.referral_updates (referral_id);
CREATE INDEX IF NOT EXISTS referral_updates_updated_by_idx ON public.referral_updates (updated_by);
CREATE INDEX IF NOT EXISTS referrals_receiving_facility_id_idx ON public.referrals (receiving_facility_id);
CREATE INDEX IF NOT EXISTS referrals_referring_facility_id_idx ON public.referrals (referring_facility_id);
CREATE INDEX IF NOT EXISTS referrals_referring_user_id_idx ON public.referrals (referring_user_id);
CREATE INDEX IF NOT EXISTS users_facility_id_idx ON public.users (facility_id);

-- Analytics views are service-role-only; enforce invoker semantics as defense in depth.
ALTER VIEW public.referral_analytics SET (security_invoker = true);
ALTER VIEW public.referral_analytics_summary SET (security_invoker = true);
