
-- Pin SECURITY DEFINER routines to an empty search_path.
-- Their table and auth references are schema-qualified; pg_catalog remains implicitly available.
ALTER FUNCTION public.audit_referral_mutation() SET search_path = '';
ALTER FUNCTION public.get_facility_user_count(uuid) SET search_path = '';
ALTER FUNCTION public.get_facility_user_counts() SET search_path = '';
ALTER FUNCTION public.get_referral_analytics_summary() SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.is_administrator() SET search_path = '';
ALTER FUNCTION public.is_current_user_administrator() SET search_path = '';
ALTER FUNCTION public.log_referral_print(uuid,text) SET search_path = '';
ALTER FUNCTION public.log_referral_read(uuid) SET search_path = '';
ALTER FUNCTION public.log_referral_status_change() SET search_path = '';
