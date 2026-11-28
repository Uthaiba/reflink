-- Catalog-only readiness report. No patient/account rows or function bodies are read.
-- Structural checks are necessary, not authenticated clinical release approval.
BEGIN TRANSACTION READ ONLY;
WITH required_columns(table_schema,table_name,column_name,data_type) AS (
 VALUES
 ('public','profiles','must_change_password','boolean'),
 ('public','profiles','facility_id','uuid'),
 ('public','referrals','id','uuid'),
 ('public','referrals','referral_number','text'),
 ('public','referrals','receiving_facility_id','uuid'),
 ('public','referrals','status','text'),
 ('public','referrals','assessment_findings','text'),
 ('public','referrals','final_diagnosis','text'),
 ('public','referrals','diagnosis_category','text'),
 ('public','referrals','diagnosis_status','text'),
 ('public','referrals','treatment_provided','text'),
 ('public','referrals','procedures_performed','text'),
 ('public','referrals','clinical_feedback','text'),
 ('public','referrals','disposition','text'),
 ('public','referrals','assessment_completed_at','timestamp with time zone'),
 ('public','referrals','admission_at','timestamp with time zone'),
 ('public','referrals','discharged_at','timestamp with time zone'),
 ('public','referrals','ward_unit','text'),
 ('public','referrals','admission_diagnosis','text'),
 ('public','referrals','clinical_progress','text'),
 ('public','referrals','inpatient_treatment','text'),
 ('public','referrals','discharge_diagnosis','text'),
 ('public','referrals','condition_at_discharge','text'),
 ('public','referrals','discharge_medications','text'),
 ('public','referrals','follow_up_plan','text'),
 ('auth','users','deleted_at','timestamp with time zone'),
 ('auth','users','banned_until','timestamp with time zone'),
 ('auth','sessions','id','uuid'),
 ('auth','sessions','user_id','uuid'),
 ('auth','sessions','not_after','timestamp with time zone')
), missing_columns AS (
 SELECT r.table_schema||'.'||r.table_name||'.'||r.column_name AS name
 FROM required_columns r LEFT JOIN information_schema.columns c
 USING(table_schema,table_name,column_name)
 WHERE c.column_name IS NULL OR c.data_type<>r.data_type
), rpc AS (
 SELECT p.* FROM pg_catalog.pg_proc p
 WHERE p.oid=to_regprocedure('public.save_referral_clinical(uuid,text,jsonb,jsonb,uuid)')
), ledger AS (
 SELECT c.* FROM pg_catalog.pg_class c
 WHERE c.oid=to_regclass('private.clinical_operations')
), checks(name,passed,detail) AS (
 SELECT 'clinical_column_contract',NOT EXISTS(SELECT 1 FROM missing_columns),
   coalesce((SELECT string_agg(name,', ' ORDER BY name) FROM missing_columns),'Required column types present')
 UNION ALL
 SELECT 'clinical_rpc_security',coalesce((SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM rpc),false),
   'Requires reviewed SECURITY DEFINER function with empty search_path'
 UNION ALL
 SELECT 'clinical_rpc_grants',coalesce((SELECT
   has_function_privilege('authenticated',oid,'EXECUTE')
   AND NOT has_function_privilege('anon',oid,'EXECUTE')
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a
     WHERE a.grantee=0 AND a.privilege_type='EXECUTE') FROM rpc),false),
   'Authenticated execution only; authorization inside function needs separate review'
 UNION ALL
 SELECT 'private_ledger',coalesce((SELECT relrowsecurity
   AND NOT has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')
   AND NOT has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') FROM ledger),false),
   'Ledger requires RLS and no ordinary-client data privileges'
 UNION ALL
 SELECT 'clinical_direct_write_guard',EXISTS(
   SELECT 1 FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid=to_regclass('public.referrals') AND NOT t.tgisinternal
   AND t.tgname='guard_clinical_client_writes' AND t.tgenabled IN ('O','A')
   AND t.tgfoid=to_regprocedure('public.guard_clinical_client_writes()')),
   'Expected enabled clinical direct-write guard'
 UNION ALL
 SELECT 'closed_record_guard',EXISTS(
   SELECT 1 FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgrelid=to_regclass('public.referrals') AND NOT t.tgisinternal
   AND t.tgenabled IN ('O','A') AND p.proname='guard_investigation_client_writes'),
   'Investigation candidate closed-record guard must also be installed'
)
SELECT jsonb_build_object(
 'scope','catalog_only_not_release_approval',
 'blocking_checks',count(*) FILTER(WHERE NOT passed),
 'checks',jsonb_agg(jsonb_build_object('name',name,'passed',passed,'detail',detail) ORDER BY name)
) FROM checks;
COMMIT;
