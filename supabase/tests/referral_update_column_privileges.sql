-- Read-only assertions for the referral UPDATE column boundary.
-- Run in the synthetic staging database with a role allowed to inspect privileges.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.referrals', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated unexpectedly retains table-level UPDATE on referrals';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.referrals', 'status', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated cannot update the workflow status column';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.referrals', 'investigation_records', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated cannot update investigation result metadata';
  END IF;

  IF has_column_privilege('authenticated', 'public.referrals', 'referring_facility_id', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.referrals', 'receiving_facility_id', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.referrals', 'referring_user_id', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.referrals', 'patient_identifier', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.referrals', 'offline_client_id', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated retains UPDATE on a protected provenance/identity column';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.referrals', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT required by the application';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.referrals', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role UPDATE privilege changed unexpectedly';
  END IF;
END;
$$;
