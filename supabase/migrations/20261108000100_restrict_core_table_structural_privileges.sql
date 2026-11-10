-- REFLINK proposal migration — NOT APPROVED FOR EXECUTION.
-- Expanded after a fresh read-only production privilege audit on 10 November 2026.
-- Authenticated had TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on 12 of
-- 14 public tables, and USAGE/SELECT/UPDATE on both public identity sequences.
-- RLS does not constrain TRUNCATE or MAINTAIN. This migration removes only
-- structural and sequence privileges; it deliberately leaves ordinary DML
-- and SELECT grants unchanged pending the separate column/write-path review.
--
-- Apply only to the reconstructed synthetic staging database after baseline
-- restore, exact ACL verification, app-call-site review, and synthetic tests.
-- Production is read-only and must never be targeted by this proposal.

BEGIN;

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE
    public.audit_log,
    public.counter_referrals,
    public.diagnosis_categories,
    public.facilities,
    public.feedback,
    public.profiles,
    public.referral_drafts,
    public.referral_notifications,
    public.referral_print_events,
    public.referral_updates,
    public.referrals,
    public.users
  FROM anon, authenticated;

REVOKE ALL PRIVILEGES
  ON SEQUENCE
    public.audit_log_id_seq,
    public.referral_print_events_id_seq
  FROM anon, authenticated;

DO $verification$
DECLARE
  v_table text;
  v_privilege text;
  v_sequence text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.audit_log',
    'public.counter_referrals',
    'public.diagnosis_categories',
    'public.facilities',
    'public.feedback',
    'public.profiles',
    'public.referral_drafts',
    'public.referral_notifications',
    'public.referral_print_events',
    'public.referral_updates',
    'public.referrals',
    'public.users'
  ]
  LOOP
    FOREACH v_privilege IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']
    LOOP
      IF has_table_privilege('anon', v_table, v_privilege)
         OR has_table_privilege('authenticated', v_table, v_privilege) THEN
        RAISE EXCEPTION 'Browser role retains % on %', v_privilege, v_table;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH v_sequence IN ARRAY ARRAY[
    'public.audit_log_id_seq',
    'public.referral_print_events_id_seq'
  ]
  LOOP
    IF has_sequence_privilege('anon', v_sequence, 'USAGE')
       OR has_sequence_privilege('anon', v_sequence, 'SELECT')
       OR has_sequence_privilege('anon', v_sequence, 'UPDATE')
       OR has_sequence_privilege('authenticated', v_sequence, 'USAGE')
       OR has_sequence_privilege('authenticated', v_sequence, 'SELECT')
       OR has_sequence_privilege('authenticated', v_sequence, 'UPDATE') THEN
      RAISE EXCEPTION 'Browser role retains sequence access on %', v_sequence;
    END IF;
  END LOOP;
END;
$verification$;

COMMIT;
