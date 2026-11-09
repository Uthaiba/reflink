-- Read-only catalog snapshot of the nine public triggers found on
-- the linked REFLINK production project on 9 November 2026.
-- This file is a schema evidence artifact, not an approved migration.
-- Apply only to an isolated, empty staging reconstruction after review.

CREATE TRIGGER counter_referrals_audit_mutation
AFTER INSERT OR DELETE OR UPDATE ON public.counter_referrals
FOR EACH ROW EXECUTE FUNCTION public.audit_referral_mutation();

CREATE TRIGGER guard_profile_security_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_security_fields();

CREATE TRIGGER referral_draft_updated_at
BEFORE UPDATE ON public.referral_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_referral_draft_timestamp();

CREATE TRIGGER referral_ack_due_at_trigger
BEFORE INSERT OR UPDATE OF urgency, created_at ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.set_referral_ack_due_at();

CREATE TRIGGER referral_counter_referral_guard
BEFORE UPDATE OF status ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.require_counter_referral_before_completion();

CREATE TRIGGER referral_entry_validation_trigger
BEFORE INSERT OR UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.validate_referral_entry();

CREATE TRIGGER referral_status_audit_trigger
AFTER UPDATE OF status ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.log_referral_status_change();

CREATE TRIGGER referral_status_transition_validation
BEFORE UPDATE OF status ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.validate_referral_status_transition();

CREATE TRIGGER referrals_audit_mutation
AFTER INSERT OR DELETE OR UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.audit_referral_mutation();
