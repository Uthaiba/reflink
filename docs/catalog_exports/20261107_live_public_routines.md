# Live public routine definitions — metadata-only export

**Captured:** 7 November 2026  
**Source:** read-only `pg_get_functiondef` and `pg_proc` catalog query against the linked REFLINK Supabase project.  
**Objects:** 16 public functions.  
**Data scope:** function definitions, owner, security mode, function settings and ACL only. No table rows, patient records, auth-user records, secrets or storage contents were queried.

> **Not a migration. Do not execute this document or copy it into the migration history as-is.** It is a point-in-time evidence snapshot to support historical baseline reconstruction. Function ownership, ACLs and settings must be reviewed and validated in a disposable synthetic-data database before any remediation or replay.

## audit_referral_mutation()

- Owner: `postgres`
- SECURITY DEFINER: `true`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.audit_referral_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log(actor_user_id, action, table_name, record_id, new_data, client_ip)
    values (auth.uid(), 'CREATE', tg_table_name, new.id, to_jsonb(new), null);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log(actor_user_id, action, table_name, record_id, old_data, new_data, client_ip)
    values (auth.uid(), 'UPDATE', tg_table_name, new.id, to_jsonb(old), to_jsonb(new), null);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log(actor_user_id, action, table_name, record_id, old_data, client_ip)
    values (auth.uid(), 'DELETE', tg_table_name, old.id, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$function$

```

## get_facility_user_count(uuid)

- Owner: `postgres`
- SECURITY DEFINER: `true`
- Function settings: `search_path=""`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
authenticated=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.get_facility_user_count(p_facility_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    DECLARE
        caller_facility_id uuid;
            caller_role text;
                total_users bigint;
                BEGIN
                    IF auth.uid() IS NULL THEN
                            RAISE EXCEPTION 'Authentication is required.'
                                        USING ERRCODE = '42501';
                                            END IF;

                                                SELECT
                                                        facility_id,
                                                                lower(trim(role))
                                                                    INTO
                                                                            caller_facility_id,
                                                                                    caller_role
                                                                                        FROM public.profiles
                                                                                            WHERE id = auth.uid();

                                                                                                IF caller_role IS DISTINCT FROM 'administrator'
                                                                                                       AND (
                                                                                                                  p_facility_id IS NULL
                                                                                                                             OR caller_facility_id IS DISTINCT FROM p_facility_id
                                                                                                                                    )
                                                                                                                                        THEN
                                                                                                                                                RAISE EXCEPTION
                                                                                                                                                            'You are not authorized to view this facility user count.'
                                                                                                                                                                        USING ERRCODE = '42501';
                                                                                                                                                                            END IF;

                                                                                                                                                                                SELECT count(*)
                                                                                                                                                                                    INTO total_users
                                                                                                                                                                                        FROM public.profiles
                                                                                                                                                                                            WHERE facility_id = p_facility_id;

                                                                                                                                                                                                RETURN total_users;
                                                                                                                                                                                                END;
                                                                                                                                                                                                $function$

```

## get_facility_user_counts()

- Owner: `postgres`
- SECURITY DEFINER: `true`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
authenticated=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.get_facility_user_counts()
 RETURNS TABLE(facility_id uuid, user_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
BEGIN
  SELECT lower(trim(role))
  INTO caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_role IS DISTINCT FROM 'administrator' THEN
    RAISE EXCEPTION 'Administrator access is required to view all facility user counts.';
  END IF;

  RETURN QUERY
  SELECT
    p.facility_id,
    count(*)::bigint AS user_count
  FROM public.profiles AS p
  WHERE p.facility_id IS NOT NULL
  GROUP BY p.facility_id;
END;
$function$

```

## get_referral_analytics_summary()

- Owner: `postgres`
- SECURITY DEFINER: `true`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.get_referral_analytics_summary()
 RETURNS TABLE(total_referrals bigint, active_referrals bigint, admitted_referrals bigint, discharged_referrals bigint, completed_referrals bigint, referred_again bigint, cancelled_referrals bigint, classified_referrals bigint, unclassified_referrals bigint, diagnosis_classification_percentage numeric, acknowledgement_cases bigint, median_hours_to_acknowledge numeric, patient_arrival_cases bigint, median_hours_to_patient_arrival numeric, assessment_cases bigint, median_hours_to_assessment numeric, completed_episode_cases bigint, median_total_episode_hours numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN

  IF NOT public.is_current_user_administrator() THEN
    RAISE EXCEPTION
      'Administrator access required to view referral analytics.';
  END IF;

  RETURN QUERY
  SELECT
    s.total_referrals,
    s.active_referrals,
    s.admitted_referrals,
    s.discharged_referrals,
    s.completed_referrals,
    s.referred_again,
    s.cancelled_referrals,
    s.classified_referrals,
    s.unclassified_referrals,
    s.diagnosis_classification_percentage,
    s.acknowledgement_cases,
    s.median_hours_to_acknowledge,
    s.patient_arrival_cases,
    s.median_hours_to_patient_arrival,
    s.assessment_cases,
    s.median_hours_to_assessment,
    s.completed_episode_cases,
    s.median_total_episode_hours
  FROM public.referral_analytics_summary AS s;

END;
$function$

```

## guard_profile_security_fields()

- Owner: `postgres`
- SECURITY DEFINER: `false`
- Function settings: `search_path=""`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
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

                                                                                                                                                                                                  -- Non-administrators must not alter identity, role or
                                                                                                                                                                                                      -- facility-assignment fields on any profile.
                                                                                                                                                                                                          IF NOT public.is_administrator()
                                                                                                                                                                                                                 AND (
                                                                                                                                                                                                                            NEW.id IS DISTINCT FROM OLD.id
                                                                                                                                                                                                                                       OR NEW.full_name IS DISTINCT FROM OLD.full_name
                                                                                                                                                                                                                                                  OR NEW.role IS DISTINCT FROM OLD.role
                                                                                                                                                                                                                                                             OR NEW.facility_id IS DISTINCT FROM OLD.facility_id
                                                                                                                                                                                                                                                                        OR NEW.phone IS DISTINCT FROM OLD.phone
                                                                                                                                                                                                                                                                                   OR NEW.created_at IS DISTINCT FROM OLD.created_at
                                                                                                                                                                                                                                                                                          )
                                                                                                                                                                                                                                                                                              THEN
                                                                                                                                                                                                                                                                                                      RAISE EXCEPTION
                                                                                                                                                                                                                                                                                                                  'Only administrators can change protected profile fields.'
                                                                                                                                                                                                                                                                                                                              USING ERRCODE = '42501';
                                                                                                                                                                                                                                                                                                                                  END IF;

                                                                                                                                                                                                                                                                                                                                      RETURN NEW;
                                                                                                                                                                                                                                                                                                                                      END;
                                                                                                                                                                                                                                                                                                                                      $function$

```

## handle_new_user()

- Owner: `postgres`
- SECURITY DEFINER: `true`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    phone,
    role
  )
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      'REFLINK User'
    ),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    'phc_staff'
  );

  RETURN NEW;
END;
$function$

```

## is_administrator()

- Owner: `postgres`
- SECURITY DEFINER: `true`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
authenticated=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.is_administrator()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'administrator'
  );
$function$

```

## is_current_user_administrator()

- Owner: `postgres`
- SECURITY DEFINER: `true`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.is_current_user_administrator()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'administrator'
  );
$function$

```

## log_referral_print(uuid,text)

- Owner: `postgres`
- SECURITY DEFINER: `true`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
authenticated=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.log_referral_print(p_referral_id uuid, p_copy_label text DEFAULT 'REFERRAL COPY'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  next_number integer;
begin
  if not exists (
    select 1 from public.referrals r
    where r.id = p_referral_id
      and (
        public.is_administrator()
        or r.referring_user_id = auth.uid()
        or r.receiving_facility_id = (select p.facility_id from public.profiles p where p.id = auth.uid())
      )
  ) then raise exception 'Not authorized to print this referral.'; end if;

  select coalesce(max(print_number), 0) + 1 into next_number
  from public.referral_print_events where referral_id = p_referral_id;

  insert into public.referral_print_events(referral_id, printed_by, copy_label, print_number)
  values (p_referral_id, auth.uid(), coalesce(nullif(trim(p_copy_label), ''), 'REFERRAL COPY'), next_number);
  return next_number;
end;
$function$

```

## log_referral_read(uuid)

- Owner: `postgres`
- SECURITY DEFINER: `true`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
authenticated=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.log_referral_read(p_referral_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.referrals r
    where r.id = p_referral_id
      and (
        public.is_administrator()
        or r.referring_user_id = auth.uid()
        or r.receiving_facility_id = (select p.facility_id from public.profiles p where p.id = auth.uid())
      )
  ) then
    raise exception 'Not authorized to audit this referral read.';
  end if;
  insert into public.audit_log(actor_user_id, action, table_name, record_id, client_ip)
  values (auth.uid(), 'READ', 'referrals', p_referral_id, null);
end;
$function$

```

## log_referral_status_change()

- Owner: `postgres`
- SECURITY DEFINER: `true`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.log_referral_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN

    INSERT INTO public.referral_updates (
      referral_id,
      updated_by,
      status,
      notes
    )
    VALUES (
      NEW.id,
      auth.uid(),
      NEW.status,
      CASE NEW.status
        WHEN 'sent'
          THEN 'Referral sent by referring facility.'
        WHEN 'acknowledged'
          THEN 'Referral acknowledged by receiving facility.'
        WHEN 'patient_arrived'
          THEN 'Patient arrival confirmed.'
        WHEN 'under_assessment'
          THEN 'Patient is under clinical assessment.'
        WHEN 'admitted'
          THEN 'Patient admitted for further management.'
        WHEN 'discharged'
          THEN 'Patient discharged from receiving facility.'
        WHEN 'referred_again'
          THEN 'Patient referred again to another facility.'
        WHEN 'completed'
          THEN 'Referral episode completed.'
        WHEN 'cancelled'
          THEN 'Referral cancelled.'
        ELSE
          'Referral status updated.'
      END
    );

  END IF;

  RETURN NEW;
END;
$function$

```

## require_counter_referral_before_completion()

- Owner: `postgres`
- SECURITY DEFINER: `false`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.require_counter_referral_before_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    if not exists (select 1 from public.counter_referrals c where c.referral_id = new.id) then
      raise exception 'A structured counter-referral is required before completing this referral.';
    end if;
  end if;
  return new;
end;
$function$

```

## set_referral_ack_due_at()

- Owner: `postgres`
- SECURITY DEFINER: `false`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.set_referral_ack_due_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  minutes_due integer;
begin
  minutes_due := case lower(coalesce(new.urgency, 'routine'))
    when 'emergency' then 15
    when 'urgent' then 120
    else 1440
  end;
  new.ack_due_at := coalesce(new.created_at, now()) + make_interval(mins => minutes_due);
  return new;
end;
$function$

```

## update_referral_draft_timestamp()

- Owner: `postgres`
- SECURITY DEFINER: `false`
- Function settings: `search_path=""`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.update_referral_draft_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$

```

## validate_referral_entry()

- Owner: `postgres`
- SECURITY DEFINER: `false`
- Function settings: `search_path=public`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.validate_referral_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status <> 'draft' then
    if nullif(trim(coalesce(new.patient_identifier, '')), '') is null then raise exception 'Patient identifier is required.'; end if;
    if new.patient_age_months is null or new.patient_age_months < 0 then raise exception 'Patient age is required and must be valid.'; end if;
    if nullif(trim(coalesce(new.patient_sex, '')), '') is null then raise exception 'Patient sex is required.'; end if;
    if nullif(trim(coalesce(new.chief_complaint, '')), '') is null and nullif(trim(coalesce(new.chief_complaint_category, '')), '') is null then raise exception 'Chief complaint is required.'; end if;
    if nullif(trim(coalesce(new.urgency, '')), '') is null then raise exception 'Referral urgency is required.'; end if;
    if new.receiving_facility_id is null then raise exception 'Receiving facility is required.'; end if;
  end if;
  if lower(coalesce(new.urgency, 'routine')) = 'emergency'
     and nullif(trim(coalesce(new.physical_findings, '')), '') is null
     and coalesce(jsonb_array_length(new.physical_findings_structured), 0) = 0
  then raise exception 'Emergency referrals require clinical/physical findings.'; end if;
  return new;
end;
$function$

```

## validate_referral_status_transition()

- Owner: `postgres`
- SECURITY DEFINER: `false`
- Function settings: `search_path=""`
- ACL:
```text
postgres=X/postgres
service_role=X/postgres
```

```sql
CREATE OR REPLACE FUNCTION public.validate_referral_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN

  -- No transition to validate if the status hasn't changed.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  /*
    Valid referral workflow:

    sent
      -> acknowledged
      -> patient_arrived
      -> under_assessment
      -> admitted
      -> discharged
      -> completed

    under_assessment
      -> discharged

    under_assessment
      -> referred_again

    Cancellation is allowed before the referral episode is completed.
  */

  IF OLD.status = 'draft'
     AND NEW.status IN ('sent', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status = 'sent'
     AND NEW.status IN ('acknowledged', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status = 'acknowledged'
     AND NEW.status IN ('patient_arrived', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status = 'patient_arrived'
     AND NEW.status IN ('under_assessment', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status = 'under_assessment'
     AND NEW.status IN (
       'admitted',
       'discharged',
       'referred_again',
       'cancelled'
     ) THEN
    RETURN NEW;

  ELSIF OLD.status = 'admitted'
     AND NEW.status IN ('discharged', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status = 'discharged'
     AND NEW.status = 'completed' THEN
    RETURN NEW;

  ELSIF OLD.status = 'referred_again'
     AND NEW.status IN ('completed', 'cancelled') THEN
    RETURN NEW;

  ELSIF OLD.status IN ('completed', 'cancelled') THEN

    RAISE EXCEPTION
      'Invalid referral status transition: % -> %. This referral is already closed.',
      OLD.status,
      NEW.status;

  ELSE

    RAISE EXCEPTION
      'Invalid referral status transition: % -> %.',
      OLD.status,
      NEW.status;

  END IF;

END;
$function$

```
