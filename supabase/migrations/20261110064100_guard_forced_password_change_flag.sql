-- Prevent authenticated users from clearing their own forced-password-change flag.
-- Password changes are completed through the authenticated change-password Edge
-- Function, which updates Auth and clears this flag using the service role.

CREATE OR REPLACE FUNCTION public.guard_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  -- Preserve trusted database and service-role operations.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Only administrators may alter protected identity, assignment and
  -- forced-password-change fields. Users cannot self-promote, move facilities,
  -- or bypass a required password change through direct table updates.
  IF NOT public.is_administrator()
     AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.full_name IS DISTINCT FROM OLD.full_name
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.facility_id IS DISTINCT FROM OLD.facility_id
       OR NEW.phone IS DISTINCT FROM OLD.phone
       OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
     )
  THEN
    RAISE EXCEPTION
      'Only administrators can change protected profile fields.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.guard_profile_security_fields() OWNER TO postgres;
