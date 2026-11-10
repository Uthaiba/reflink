-- The notification enqueue function is trigger-only, not a client RPC.
-- Revoke direct API execution from all exposed client roles. The trigger owner
-- retains the ability to invoke it as part of the referral write operation.
REVOKE ALL ON FUNCTION public.enqueue_referral_dashboard_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_referral_dashboard_notification() FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_referral_dashboard_notification() FROM authenticated;
