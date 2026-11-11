-- Validate the previously added offline submission integrity constraint.
-- Run after checking for invalid historical offline rows; staging audit found zero.
-- PostgreSQL then marks the constraint validated for the entire table.
ALTER TABLE public.referrals VALIDATE CONSTRAINT referrals_offline_submission_key_required;
