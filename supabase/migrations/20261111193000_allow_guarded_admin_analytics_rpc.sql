-- Allow authenticated administrators to call the existing aggregate analytics RPC.
-- The SECURITY DEFINER function itself rejects non-administrators via
-- public.is_current_user_administrator(); anonymous access remains denied.
-- This grants no direct SELECT privilege on the underlying analytics view.
REVOKE ALL ON FUNCTION public.get_referral_analytics_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_analytics_summary() TO authenticated;
