-- REFLINK staging-only preflight before any migration ledger repair.
-- Read-only: reports row counts, duplicate retry keys, invalid offline keys,
-- and the number of post-baseline migrations currently recorded.
-- Does not assert that the migration files are equivalent to the live schema.
WITH snapshot AS (
 SELECT
  (SELECT count(*) FROM public.referrals) AS referrals,
  (SELECT count(*) FROM public.profiles) AS profiles,
  (SELECT count(*) FROM public.facilities) AS facilities,
  (SELECT count(*) FROM public.referrals WHERE offline_client_id IS NOT NULL) AS offline_keyed_referrals,
  (SELECT count(*) FROM (
    SELECT referring_user_id,offline_client_id FROM public.referrals
    WHERE offline_client_id IS NOT NULL GROUP BY 1,2 HAVING count(*)>1
  ) duplicate_keys) AS duplicate_offline_keys,
  (SELECT count(*) FROM public.referrals
   WHERE sync_source='offline' AND (
     referring_user_id IS NULL OR offline_client_id IS NULL
     OR offline_client_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   )) AS invalid_offline_keys,
  (SELECT count(*) FROM supabase_migrations.schema_migrations
   WHERE version IN ('20261111160000','20261111163000','20261111170000',
    '20261111173000','20261111180000','20261111183000',
    '20261111184500','20261111190000','20261111191500',
    '20261111193000','20261111194500','20261111200000',
    '20261111201500')) AS post_baseline_ledger_count
)
SELECT *, CASE WHEN duplicate_offline_keys=0 AND invalid_offline_keys=0
  THEN 'PASS: no retry-key conflicts in current rows' ELSE 'STOP: review retry-key conflicts' END AS data_integrity_preflight,
 CASE WHEN post_baseline_ledger_count=13 THEN 'RECORDED'
      WHEN post_baseline_ledger_count=0 THEN 'ALL MISSING'
      ELSE 'PARTIAL: review before repair' END AS migration_history_state
FROM snapshot;
