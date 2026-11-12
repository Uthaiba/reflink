-- REFLINK synthetic staging: explicit post-baseline migration ledger gap report.
-- Read-only. No migration-history writes; do not run against production.
WITH expected(version, migration_name) AS (VALUES
  ('20261111160000', 'prevent_client_deletion_of_investigation_files'),
  ('20261111163000', 'prevent_client_replacement_of_investigation_files'),
  ('20261111170000', 'align_investigation_file_access_with_referral_participants'),
  ('20261111173000', 'offline_referral_idempotency_unique_index'),
  ('20261111180000', 'restrict_referral_notification_log_to_participants'),
  ('20261111183000', 'require_offline_referral_retry_key'),
  ('20261111184500', 'validate_offline_referral_retry_key'),
  ('20261111190000', 'register_referral_investigation_files'),
  ('20261111191500', 'handle_empty_investigation_arrays'),
  ('20261111193000', 'allow_guarded_admin_analytics_rpc'),
  ('20261111194500', 'lock_registered_investigation_file_metadata'),
  ('20261111200000', 'reject_null_investigation_registration_payload'),
  ('20261111201500', 'require_complete_investigation_file_descriptors')
)
SELECT e.version, e.migration_name,
  CASE WHEN m.version IS NULL THEN 'MISSING_FROM_LEDGER' ELSE 'RECORDED' END AS ledger_status,
  m.name AS recorded_name
FROM expected e
LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
ORDER BY e.version;
