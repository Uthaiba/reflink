-- Preserve clinical investigation result immutability for ordinary authenticated clients.
-- The staging application uses Storage upload(..., { upsert: false }) and does not
-- call Storage update(), move(), copy() or remove() for this bucket.
-- Existing SELECT and INSERT policies remain unchanged.
-- Replacements/corrections require a separately designed audited workflow.
DROP POLICY IF EXISTS "Authorized users can update investigation result files" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can replace investigation result files" ON storage.objects;
