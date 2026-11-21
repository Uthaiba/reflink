
-- Avoid per-row evaluation of auth.uid() in RLS predicates.
DO $reflink$
DECLARE
  p record;
  v_using text;
  v_check text;
BEGIN
  FOR p IN
    SELECT * FROM pg_policies
    WHERE schemaname='public'
      AND (coalesce(qual,'') LIKE '%auth.uid()%'
        OR coalesce(with_check,'') LIKE '%auth.uid()%')
  LOOP
    v_using := p.qual;
    v_check := p.with_check;

    IF v_using IS NOT NULL THEN
      v_using := replace(v_using, 'SELECT auth.uid()', '__REFLINK_AUTH_UID_SCALAR__');
      v_using := replace(v_using, 'auth.uid()', '(select auth.uid())');
      v_using := replace(v_using, '__REFLINK_AUTH_UID_SCALAR__', 'SELECT auth.uid()');
    END IF;
    IF v_check IS NOT NULL THEN
      v_check := replace(v_check, 'SELECT auth.uid()', '__REFLINK_AUTH_UID_SCALAR__');
      v_check := replace(v_check, 'auth.uid()', '(select auth.uid())');
      v_check := replace(v_check, '__REFLINK_AUTH_UID_SCALAR__', 'SELECT auth.uid()');
    END IF;

    IF p.cmd IN ('SELECT','DELETE') THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',p.policyname,p.schemaname,p.tablename,v_using);
    ELSIF p.cmd='INSERT' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',p.policyname,p.schemaname,p.tablename,v_check);
    ELSIF p.cmd='UPDATE' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',p.policyname,p.schemaname,p.tablename,v_using,v_check);
    ELSIF p.cmd='ALL' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',p.policyname,p.schemaname,p.tablename,v_using,v_check);
    END IF;
  END LOOP;
END
$reflink$;
