-- REFLINK staging: validate the second receiving-hospital fixture without persistence.
-- Execute only on project rcskuzmvyugbanygizri. Never run against production.
-- The explicit ROLLBACK is mandatory. Do not change it to COMMIT.
BEGIN;
INSERT INTO public.facilities (name,facility_type,state,lga,is_active)
SELECT 'REFLINK TEST RECEIVING D','general_hospital','Yobe','Synthetic Test',true
WHERE NOT EXISTS (
 SELECT 1 FROM public.facilities WHERE name='REFLINK TEST RECEIVING D'
)
RETURNING name,facility_type,is_active;
ROLLBACK;
-- Verify separately in a new read-only query:
-- SELECT count(*) FROM public.facilities WHERE name='REFLINK TEST RECEIVING D';
