


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."audit_referral_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."audit_referral_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_facility_user_count"("p_facility_id" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
                                                                                                                                                                                                $$;


ALTER FUNCTION "public"."get_facility_user_count"("p_facility_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_facility_user_counts"() RETURNS TABLE("facility_id" "uuid", "user_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_facility_user_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_referral_analytics_summary"() RETURNS TABLE("total_referrals" bigint, "active_referrals" bigint, "admitted_referrals" bigint, "discharged_referrals" bigint, "completed_referrals" bigint, "referred_again" bigint, "cancelled_referrals" bigint, "classified_referrals" bigint, "unclassified_referrals" bigint, "diagnosis_classification_percentage" numeric, "acknowledgement_cases" bigint, "median_hours_to_acknowledge" numeric, "patient_arrival_cases" bigint, "median_hours_to_patient_arrival" numeric, "assessment_cases" bigint, "median_hours_to_assessment" numeric, "completed_episode_cases" bigint, "median_total_episode_hours" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_referral_analytics_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profile_security_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
                                                                                                                                                                                                                                                                                                                                      $$;


ALTER FUNCTION "public"."guard_profile_security_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_administrator"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'administrator'
  );
$$;


ALTER FUNCTION "public"."is_administrator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_current_user_administrator"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'administrator'
  );
$$;


ALTER FUNCTION "public"."is_current_user_administrator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_referral_print"("p_referral_id" "uuid", "p_copy_label" "text" DEFAULT 'REFERRAL COPY'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."log_referral_print"("p_referral_id" "uuid", "p_copy_label" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_referral_read"("p_referral_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."log_referral_read"("p_referral_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_referral_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."log_referral_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_counter_referral_before_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    if not exists (select 1 from public.counter_referrals c where c.referral_id = new.id) then
      raise exception 'A structured counter-referral is required before completing this referral.';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."require_counter_referral_before_completion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_referral_ack_due_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."set_referral_ack_due_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_referral_draft_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_referral_draft_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_referral_entry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_referral_entry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_referral_status_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_referral_status_transition"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "client_ip" "inet",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_log_action_check" CHECK (("action" = ANY (ARRAY['CREATE'::"text", 'READ'::"text", 'UPDATE'::"text", 'DELETE'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."counter_referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referral_id" "uuid" NOT NULL,
    "receiving_user_id" "uuid" NOT NULL,
    "final_diagnosis" "text" NOT NULL,
    "treatment_provided" "text",
    "outcome" "text" NOT NULL,
    "follow_up_instructions" "text",
    "referred_further_to" "text",
    "additional_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "counter_referrals_outcome_check" CHECK (("outcome" = ANY (ARRAY['recovered'::"text", 'improved'::"text", 'referred_further'::"text", 'died'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."counter_referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diagnosis_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."diagnosis_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "facility_type" "text" NOT NULL,
    "address" "text",
    "state" "text",
    "lga" "text",
    "phone" "text",
    "email" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "referral_notification_phone" "text"
);


ALTER TABLE "public"."facilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referral_id" "uuid" NOT NULL,
    "provided_by" "uuid",
    "clinical_feedback" "text",
    "outcome" "text",
    "follow_up_required" boolean DEFAULT false NOT NULL,
    "follow_up_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "role" "text" NOT NULL,
    "facility_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "must_change_password" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['phc_staff'::"text", 'receiving_staff'::"text", 'administrator'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."must_change_password" IS 'When true, the user is required to replace the temporary password after sign-in.';



CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referral_number" "text" NOT NULL,
    "patient_identifier" "text" NOT NULL,
    "patient_age_months" integer,
    "patient_sex" "text",
    "chief_complaint" "text",
    "clinical_summary" "text",
    "physical_findings" "text",
    "provisional_diagnosis" "text",
    "investigations" "text",
    "treatment_given" "text",
    "referral_reason" "text",
    "urgency" "text",
    "referring_facility_id" "uuid",
    "receiving_facility_id" "uuid",
    "referring_user_id" "uuid",
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "acknowledged_at" timestamp with time zone,
    "patient_arrived_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "assessment_findings" "text",
    "final_diagnosis" "text",
    "treatment_provided" "text",
    "procedures_performed" "text",
    "clinical_feedback" "text",
    "disposition" "text",
    "assessment_completed_at" timestamp with time zone,
    "discharged_at" timestamp with time zone,
    "admission_at" timestamp with time zone,
    "ward_unit" "text",
    "admission_diagnosis" "text",
    "clinical_progress" "text",
    "inpatient_treatment" "text",
    "discharge_diagnosis" "text",
    "condition_at_discharge" "text",
    "discharge_medications" "text",
    "follow_up_plan" "text",
    "patient_phone" "text",
    "patient_address" "text",
    "relative_name" "text",
    "relative_relationship" "text",
    "relative_phone" "text",
    "diagnosis_status" "text",
    "diagnosis_records" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "investigation_categories" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "investigation_records" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "diagnosis_category" "text",
    "investigation_category" "text",
    "is_test" boolean DEFAULT false NOT NULL,
    "offline_client_id" "text",
    "sync_source" "text" DEFAULT 'online'::"text",
    "ack_due_at" timestamp with time zone,
    "chief_complaint_category" "text",
    "chief_complaint_other" "text",
    "physical_findings_structured" "jsonb" DEFAULT '[]'::"jsonb",
    "treatment_given_structured" "jsonb" DEFAULT '[]'::"jsonb",
    "diagnosis_category_other" "text",
    CONSTRAINT "referrals_diagnosis_status_check" CHECK ((("diagnosis_status" IS NULL) OR ("diagnosis_status" = ANY (ARRAY['suspected'::"text", 'provisional'::"text", 'confirmed'::"text"])))),
    CONSTRAINT "referrals_disposition_check" CHECK ((("disposition" IS NULL) OR ("disposition" = ANY (ARRAY['admitted'::"text", 'discharged'::"text", 'referred_again'::"text", 'observation'::"text"])))),
    CONSTRAINT "referrals_patient_sex_check" CHECK (("patient_sex" = ANY (ARRAY['male'::"text", 'female'::"text", 'other'::"text"]))),
    CONSTRAINT "referrals_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'acknowledged'::"text", 'patient_arrived'::"text", 'under_assessment'::"text", 'admitted'::"text", 'discharged'::"text", 'referred_again'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "referrals_urgency_check" CHECK (("urgency" = ANY (ARRAY['routine'::"text", 'urgent'::"text", 'emergency'::"text"])))
);


ALTER TABLE "public"."referrals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."referrals"."diagnosis_records" IS 'JSON array of diagnosis objects: [{status, category, diagnosis}]';



COMMENT ON COLUMN "public"."referrals"."investigation_categories" IS 'JSON array of selected investigation category names';



COMMENT ON COLUMN "public"."referrals"."investigation_records" IS 'JSON array of investigation objects: [{category, investigation}]';



CREATE OR REPLACE VIEW "public"."referral_analytics" AS
 SELECT "id",
    "referral_number",
    "patient_identifier",
    "status",
    "urgency",
    "referring_facility_id",
    "receiving_facility_id",
    "provisional_diagnosis",
    "final_diagnosis",
    "diagnosis_category",
    "diagnosis_status",
    "created_at",
    "acknowledged_at",
    "patient_arrived_at",
    "assessment_completed_at",
    "admission_at",
    "discharged_at",
    "completed_at",
        CASE
            WHEN ("acknowledged_at" IS NOT NULL) THEN (EXTRACT(epoch FROM ("acknowledged_at" - "created_at")) / (3600)::numeric)
            ELSE NULL::numeric
        END AS "hours_to_acknowledge",
        CASE
            WHEN (("acknowledged_at" IS NOT NULL) AND ("patient_arrived_at" IS NOT NULL)) THEN (EXTRACT(epoch FROM ("patient_arrived_at" - "acknowledged_at")) / (3600)::numeric)
            ELSE NULL::numeric
        END AS "hours_to_patient_arrival",
        CASE
            WHEN (("patient_arrived_at" IS NOT NULL) AND ("assessment_completed_at" IS NOT NULL)) THEN (EXTRACT(epoch FROM ("assessment_completed_at" - "patient_arrived_at")) / (3600)::numeric)
            ELSE NULL::numeric
        END AS "hours_to_assessment",
        CASE
            WHEN (COALESCE("completed_at", "discharged_at") IS NOT NULL) THEN (EXTRACT(epoch FROM (COALESCE("completed_at", "discharged_at") - "created_at")) / (3600)::numeric)
            ELSE NULL::numeric
        END AS "total_episode_hours"
   FROM "public"."referrals" "r"
  WHERE (COALESCE("is_test", false) = false);


ALTER VIEW "public"."referral_analytics" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."referral_analytics_summary" AS
 SELECT "count"(*) AS "total_referrals",
    "count"(*) FILTER (WHERE ("status" = ANY (ARRAY['sent'::"text", 'acknowledged'::"text", 'patient_arrived'::"text", 'under_assessment'::"text"]))) AS "active_referrals",
    "count"(*) FILTER (WHERE ("status" = 'admitted'::"text")) AS "admitted_referrals",
    "count"(*) FILTER (WHERE ("status" = 'discharged'::"text")) AS "discharged_referrals",
    "count"(*) FILTER (WHERE ("status" = 'completed'::"text")) AS "completed_referrals",
    "count"(*) FILTER (WHERE ("status" = 'referred_again'::"text")) AS "referred_again",
    "count"(*) FILTER (WHERE ("status" = 'cancelled'::"text")) AS "cancelled_referrals",
    "count"(*) FILTER (WHERE (("diagnosis_category" IS NOT NULL) AND (TRIM(BOTH FROM "diagnosis_category") <> ''::"text"))) AS "classified_referrals",
    "count"(*) FILTER (WHERE (("diagnosis_category" IS NULL) OR (TRIM(BOTH FROM "diagnosis_category") = ''::"text"))) AS "unclassified_referrals",
    "round"(((("count"(*) FILTER (WHERE (("diagnosis_category" IS NOT NULL) AND (TRIM(BOTH FROM "diagnosis_category") <> ''::"text"))))::numeric * 100.0) / (NULLIF("count"(*), 0))::numeric), 1) AS "diagnosis_classification_percentage",
    "count"(*) FILTER (WHERE ("hours_to_acknowledge" IS NOT NULL)) AS "acknowledgement_cases",
    "round"(("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (("hours_to_acknowledge")::double precision)))::numeric, 2) AS "median_hours_to_acknowledge",
    "count"(*) FILTER (WHERE ("hours_to_patient_arrival" IS NOT NULL)) AS "patient_arrival_cases",
    "round"(("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (("hours_to_patient_arrival")::double precision)))::numeric, 2) AS "median_hours_to_patient_arrival",
    "count"(*) FILTER (WHERE ("hours_to_assessment" IS NOT NULL)) AS "assessment_cases",
    "round"(("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (("hours_to_assessment")::double precision)))::numeric, 2) AS "median_hours_to_assessment",
    "count"(*) FILTER (WHERE ("total_episode_hours" IS NOT NULL)) AS "completed_episode_cases",
    "round"(("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (("total_episode_hours")::double precision)))::numeric, 2) AS "median_total_episode_hours"
   FROM "public"."referral_analytics";


ALTER VIEW "public"."referral_analytics_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "facility_id" "uuid",
    "draft_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."referral_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referral_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_description" "text",
    "performed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."referral_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referral_id" "uuid" NOT NULL,
    "receiving_facility_id" "uuid",
    "diagnosis" "text",
    "investigations_done" "text",
    "treatment_provided" "text",
    "outcome" "text",
    "follow_up_required" boolean DEFAULT false,
    "feedback_notes" "text",
    "submitted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."referral_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referral_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "channel" "text" DEFAULT 'sms'::"text" NOT NULL,
    "recipient_phone" "text",
    "provider" "text",
    "provider_message_id" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    CONSTRAINT "referral_notifications_channel_check" CHECK (("channel" = ANY (ARRAY['sms'::"text", 'dashboard'::"text"]))),
    CONSTRAINT "referral_notifications_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['referral_sent'::"text", 'referral_acknowledged'::"text", 'sla_escalation'::"text"]))),
    CONSTRAINT "referral_notifications_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."referral_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_print_events" (
    "id" bigint NOT NULL,
    "referral_id" "uuid" NOT NULL,
    "printed_by" "uuid" NOT NULL,
    "copy_label" "text" DEFAULT 'REFERRAL COPY'::"text" NOT NULL,
    "print_number" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."referral_print_events" OWNER TO "postgres";


ALTER TABLE "public"."referral_print_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."referral_print_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."referral_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referral_id" "uuid" NOT NULL,
    "updated_by" "uuid",
    "status" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."referral_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "role" "text" DEFAULT 'referrer'::"text" NOT NULL,
    "facility_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."counter_referrals"
    ADD CONSTRAINT "counter_referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."counter_referrals"
    ADD CONSTRAINT "counter_referrals_referral_id_key" UNIQUE ("referral_id");



ALTER TABLE ONLY "public"."diagnosis_categories"
    ADD CONSTRAINT "diagnosis_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."diagnosis_categories"
    ADD CONSTRAINT "diagnosis_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facilities"
    ADD CONSTRAINT "facilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_drafts"
    ADD CONSTRAINT "referral_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_feedback"
    ADD CONSTRAINT "referral_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_notifications"
    ADD CONSTRAINT "referral_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_print_events"
    ADD CONSTRAINT "referral_print_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_updates"
    ADD CONSTRAINT "referral_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referral_number_key" UNIQUE ("referral_number");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_log_actor_idx" ON "public"."audit_log" USING "btree" ("actor_user_id", "created_at" DESC);



CREATE INDEX "audit_log_record_idx" ON "public"."audit_log" USING "btree" ("table_name", "record_id", "created_at" DESC);



CREATE INDEX "counter_referrals_referral_idx" ON "public"."counter_referrals" USING "btree" ("referral_id");



CREATE INDEX "referral_drafts_facility_id_idx" ON "public"."referral_drafts" USING "btree" ("facility_id");



CREATE INDEX "referral_drafts_updated_at_idx" ON "public"."referral_drafts" USING "btree" ("updated_at" DESC);



CREATE INDEX "referral_drafts_user_id_idx" ON "public"."referral_drafts" USING "btree" ("user_id");



CREATE INDEX "referral_notifications_referral_idx" ON "public"."referral_notifications" USING "btree" ("referral_id", "created_at" DESC);



CREATE INDEX "referral_print_events_referral_idx" ON "public"."referral_print_events" USING "btree" ("referral_id", "created_at" DESC);



CREATE INDEX "referrals_ack_due_at_idx" ON "public"."referrals" USING "btree" ("ack_due_at") WHERE ("status" = 'sent'::"text");



CREATE UNIQUE INDEX "referrals_offline_client_id_uidx" ON "public"."referrals" USING "btree" ("offline_client_id") WHERE ("offline_client_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "counter_referrals_audit_mutation" AFTER INSERT OR DELETE OR UPDATE ON "public"."counter_referrals" FOR EACH ROW EXECUTE FUNCTION "public"."audit_referral_mutation"();



CREATE OR REPLACE TRIGGER "guard_profile_security_fields" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_security_fields"();



CREATE OR REPLACE TRIGGER "referral_ack_due_at_trigger" BEFORE INSERT OR UPDATE OF "urgency", "created_at" ON "public"."referrals" FOR EACH ROW EXECUTE FUNCTION "public"."set_referral_ack_due_at"();



CREATE OR REPLACE TRIGGER "referral_counter_referral_guard" BEFORE UPDATE OF "status" ON "public"."referrals" FOR EACH ROW EXECUTE FUNCTION "public"."require_counter_referral_before_completion"();



CREATE OR REPLACE TRIGGER "referral_draft_updated_at" BEFORE UPDATE ON "public"."referral_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."update_referral_draft_timestamp"();



CREATE OR REPLACE TRIGGER "referral_entry_validation_trigger" BEFORE INSERT OR UPDATE ON "public"."referrals" FOR EACH ROW EXECUTE FUNCTION "public"."validate_referral_entry"();



CREATE OR REPLACE TRIGGER "referral_status_audit_trigger" AFTER UPDATE OF "status" ON "public"."referrals" FOR EACH ROW EXECUTE FUNCTION "public"."log_referral_status_change"();



CREATE OR REPLACE TRIGGER "referral_status_transition_validation" BEFORE UPDATE OF "status" ON "public"."referrals" FOR EACH ROW EXECUTE FUNCTION "public"."validate_referral_status_transition"();



CREATE OR REPLACE TRIGGER "referrals_audit_mutation" AFTER INSERT OR DELETE OR UPDATE ON "public"."referrals" FOR EACH ROW EXECUTE FUNCTION "public"."audit_referral_mutation"();



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."counter_referrals"
    ADD CONSTRAINT "counter_referrals_receiving_user_id_fkey" FOREIGN KEY ("receiving_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."counter_referrals"
    ADD CONSTRAINT "counter_referrals_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_provided_by_fkey" FOREIGN KEY ("provided_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_drafts"
    ADD CONSTRAINT "referral_drafts_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_drafts"
    ADD CONSTRAINT "referral_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_feedback"
    ADD CONSTRAINT "referral_feedback_receiving_facility_id_fkey" FOREIGN KEY ("receiving_facility_id") REFERENCES "public"."facilities"("id");



ALTER TABLE ONLY "public"."referral_feedback"
    ADD CONSTRAINT "referral_feedback_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_feedback"
    ADD CONSTRAINT "referral_feedback_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."referral_notifications"
    ADD CONSTRAINT "referral_notifications_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_print_events"
    ADD CONSTRAINT "referral_print_events_printed_by_fkey" FOREIGN KEY ("printed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."referral_print_events"
    ADD CONSTRAINT "referral_print_events_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_updates"
    ADD CONSTRAINT "referral_updates_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_updates"
    ADD CONSTRAINT "referral_updates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_receiving_facility_id_fkey" FOREIGN KEY ("receiving_facility_id") REFERENCES "public"."facilities"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referring_facility_id_fkey" FOREIGN KEY ("referring_facility_id") REFERENCES "public"."facilities"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referring_user_id_fkey" FOREIGN KEY ("referring_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE SET NULL;



CREATE POLICY "Administrators can add facilities" ON "public"."facilities" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'administrator'::"text")))));



CREATE POLICY "Administrators can create profiles" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_administrator"());



CREATE POLICY "Administrators can delete facilities" ON "public"."facilities" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'administrator'::"text")))));



CREATE POLICY "Administrators can insert users" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_administrator"());



CREATE POLICY "Administrators can update facilities" ON "public"."facilities" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'administrator'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'administrator'::"text")))));



CREATE POLICY "Administrators can update profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_administrator"()) WITH CHECK ("public"."is_administrator"());



CREATE POLICY "Administrators can update users" ON "public"."users" FOR UPDATE TO "authenticated" USING ("public"."is_administrator"()) WITH CHECK ("public"."is_administrator"());



CREATE POLICY "Administrators can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."is_administrator"() OR ("id" = "auth"."uid"())));



CREATE POLICY "Administrators can view audit log" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_administrator"());



CREATE POLICY "Administrators can view users" ON "public"."users" FOR SELECT TO "authenticated" USING ("public"."is_administrator"());



CREATE POLICY "Admins can view notification log" ON "public"."referral_notifications" FOR SELECT TO "authenticated" USING ("public"."is_administrator"());



CREATE POLICY "Authenticated users can view diagnosis categories" ON "public"."diagnosis_categories" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Authenticated users can view facilities" ON "public"."facilities" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "PHC staff can create referrals" ON "public"."referrals" FOR INSERT TO "authenticated" WITH CHECK ((("referring_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."facility_id" = "referrals"."referring_facility_id") AND ("p"."role" = 'phc_staff'::"text"))))));



CREATE POLICY "PHC staff can view their referrals" ON "public"."referrals" FOR SELECT TO "authenticated" USING (("referring_user_id" = "auth"."uid"()));



CREATE POLICY "Participants can view counter referrals" ON "public"."counter_referrals" FOR SELECT TO "authenticated" USING (("public"."is_administrator"() OR (EXISTS ( SELECT 1
   FROM "public"."referrals" "r"
  WHERE (("r"."id" = "counter_referrals"."referral_id") AND (("r"."referring_user_id" = "auth"."uid"()) OR ("r"."receiving_facility_id" = ( SELECT "p"."facility_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"())))))))));



CREATE POLICY "Participants can view print history" ON "public"."referral_print_events" FOR SELECT TO "authenticated" USING (("public"."is_administrator"() OR (EXISTS ( SELECT 1
   FROM "public"."referrals" "r"
  WHERE (("r"."id" = "referral_print_events"."referral_id") AND (("r"."referring_user_id" = "auth"."uid"()) OR ("r"."receiving_facility_id" = ( SELECT "p"."facility_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"())))))))));



CREATE POLICY "Receiving facilities can view assigned referrals" ON "public"."referrals" FOR SELECT TO "authenticated" USING (("receiving_facility_id" = ( SELECT "profiles"."facility_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Receiving staff can create counter referrals" ON "public"."counter_referrals" FOR INSERT TO "authenticated" WITH CHECK ((("receiving_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."profiles" "p"
     JOIN "public"."referrals" "r" ON (("r"."id" = "counter_referrals"."referral_id")))
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'receiving_staff'::"text") AND ("p"."facility_id" = "r"."receiving_facility_id"))))));



CREATE POLICY "Receiving staff can update assigned referrals" ON "public"."referrals" FOR UPDATE TO "authenticated" USING (("receiving_facility_id" = ( SELECT "profiles"."facility_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'receiving_staff'::"text"))))) WITH CHECK (("receiving_facility_id" = ( SELECT "profiles"."facility_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'receiving_staff'::"text")))));



CREATE POLICY "Referral participants can view notification log" ON "public"."referral_notifications" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."referrals" "r"
  WHERE (("r"."id" = "referral_notifications"."referral_id") AND (("r"."referring_user_id" = "auth"."uid"()) OR ("r"."receiving_facility_id" = ( SELECT "p"."facility_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"()))))))));



CREATE POLICY "Users can clear own password change flag" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can create their own referral drafts" ON "public"."referral_drafts" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own referral drafts" ON "public"."referral_drafts" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can submit referral feedback" ON "public"."feedback" FOR INSERT TO "authenticated" WITH CHECK ((("provided_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."referrals" "r"
  WHERE (("r"."id" = "feedback"."referral_id") AND (("r"."referring_user_id" = "auth"."uid"()) OR ("r"."receiving_facility_id" = ( SELECT "p"."facility_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"())))))))));



CREATE POLICY "Users can update their own referral drafts" ON "public"."referral_drafts" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view referral feedback" ON "public"."feedback" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."referrals" "r"
  WHERE (("r"."id" = "feedback"."referral_id") AND (("r"."referring_user_id" = "auth"."uid"()) OR ("r"."receiving_facility_id" = ( SELECT "p"."facility_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"()))))))));



CREATE POLICY "Users can view referral updates" ON "public"."referral_updates" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."referrals" "r"
  WHERE (("r"."id" = "referral_updates"."referral_id") AND (("r"."referring_user_id" = "auth"."uid"()) OR ("r"."receiving_facility_id" = ( SELECT "p"."facility_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"()))))))));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can view their own referral drafts" ON "public"."referral_drafts" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."counter_referrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."diagnosis_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_print_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_referral_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_referral_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_facility_user_count"("p_facility_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_facility_user_count"("p_facility_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_facility_user_count"("p_facility_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_facility_user_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_facility_user_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_facility_user_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_referral_analytics_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_referral_analytics_summary"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_profile_security_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_profile_security_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_administrator"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_administrator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_administrator"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_current_user_administrator"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_current_user_administrator"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_referral_print"("p_referral_id" "uuid", "p_copy_label" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_referral_print"("p_referral_id" "uuid", "p_copy_label" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_referral_print"("p_referral_id" "uuid", "p_copy_label" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_referral_read"("p_referral_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_referral_read"("p_referral_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_referral_read"("p_referral_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_referral_status_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_referral_status_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."require_counter_referral_before_completion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."require_counter_referral_before_completion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_referral_ack_due_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_referral_ack_due_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_referral_draft_timestamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_referral_draft_timestamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_referral_entry"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_referral_entry"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_referral_status_transition"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_referral_status_transition"() TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."counter_referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."counter_referrals" TO "service_role";



GRANT ALL ON TABLE "public"."diagnosis_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."diagnosis_categories" TO "service_role";



GRANT ALL ON TABLE "public"."facilities" TO "authenticated";
GRANT ALL ON TABLE "public"."facilities" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT ALL ON TABLE "public"."referral_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."referral_analytics_summary" TO "service_role";



GRANT ALL ON TABLE "public"."referral_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."referral_events" TO "service_role";



GRANT ALL ON TABLE "public"."referral_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."referral_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."referral_print_events" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_print_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."referral_print_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."referral_print_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."referral_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_updates" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






