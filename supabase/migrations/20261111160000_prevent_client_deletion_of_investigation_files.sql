-- Staging security hardening: clinical investigation files must not be deleted by ordinary clients.
-- Existing application uploads use upsert:false; no client-side Storage remove() call was found.
-- Retain read/insert/update policies pending full attachment lifecycle review.
DROP POLICY IF EXISTS "Authorized users can delete investigation result files" ON storage.objects;