
-- Explicitly document and enforce the intended service-role-only access to internal ledgers.
CREATE POLICY "Service role only referral events" ON public.referral_events
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Service role only referral feedback" ON public.referral_feedback
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.referral_events IS
  'Internal referral event ledger. Authenticated access is intentionally denied; trusted backend service_role only.';
COMMENT ON TABLE public.referral_feedback IS
  'Internal referral feedback ledger. Authenticated access is intentionally denied; trusted backend service_role only.';
