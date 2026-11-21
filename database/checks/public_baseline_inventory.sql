-- Catalog metadata only; no clinical, account or storage-object rows.
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path=pg_catalog;
WITH objects AS (
 SELECT 'relation'::text AS kind,n.nspname||'.'||c.relname AS name,
   jsonb_build_object('kind',c.relkind,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions) AS detail
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','v')
 UNION ALL
 SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,
   jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
     'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity)
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname='public' AND c.relkind IN ('r','v') AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
   jsonb_build_object('body_md5',md5(p.prosrc),'definer',p.prosecdef,'config',p.proconfig,
     'volatility',p.provolatile,'result',pg_get_function_result(p.oid),'owner',pg_get_userbyid(p.proowner))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 UNION ALL
 SELECT 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,
   jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal
 UNION ALL
 SELECT 'policy',schemaname||'.'||tablename||'.'||policyname,
   jsonb_build_object('permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check)
 FROM pg_policies WHERE schemaname='public' OR (schemaname='storage' AND tablename='objects')
 UNION ALL
 SELECT 'constraint',n.nspname||'.'||c.relname||'.'||k.conname,
   jsonb_build_object('definition',pg_get_constraintdef(k.oid),'validated',k.convalidated)
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
 UNION ALL
 SELECT 'view',n.nspname||'.'||c.relname,jsonb_build_object('definition_md5',md5(pg_get_viewdef(c.oid)))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v'
)
SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'name',name,'detail',detail) ORDER BY kind,name),'[]'::jsonb) AS inventory FROM objects;
COMMIT;
