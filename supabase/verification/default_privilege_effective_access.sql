-- REFLINK effective function/default-privilege verification
-- READ-ONLY: catalog SELECTs only. No DDL, DML, temporary objects, grants, or revokes.
--
-- Run only against the isolated synthetic staging project after its baseline exists.
-- This verifier reports catalog state; it does NOT prove future-object behavior.
-- PostgreSQL combines global and per-schema default ACLs additively. A disposable
-- function create/rollback test per approved creator is still required in staging
-- after explicit authorization.

-- 1. Show global and schema-scoped default function ACL entries separately.
--    Keeping these rows separate is intentional: per-schema REVOKE cannot cancel
--    a privilege granted by the global default ACL.
SELECT
  pg_get_userbyid(d.defaclrole) AS object_creator,
  CASE WHEN d.defaclnamespace = 0 THEN '<global>'
       ELSE n.nspname END AS default_scope,
  d.defaclobjtype AS object_type_code,
  x.grantee,
  CASE WHEN x.grantee = 0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(x.grantee) END AS grantee_name,
  x.privilege_type,
  x.is_grantable
FROM pg_default_acl AS d
LEFT JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) AS x
WHERE d.defaclobjtype = 'f'
ORDER BY object_creator, default_scope, grantee_name, privilege_type;

-- 2. Effective EXECUTE privilege on every existing public function.
--    This includes inherited PUBLIC/role membership effects as evaluated by
--    has_function_privilege; it is not a prediction of future function ACLs.
WITH target_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role'),
         ('postgres'), ('supabase_admin')
),
public_functions AS (
  SELECT p.oid, n.nspname, p.proname,
         pg_get_function_identity_arguments(p.oid) AS identity_arguments,
         pg_get_userbyid(p.proowner) AS owner_name,
         p.prosecdef AS security_definer
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
)
SELECT
  f.nspname AS schema_name,
  f.proname AS function_name,
  f.identity_arguments,
  f.owner_name,
  f.security_definer,
  r.role_name,
  has_function_privilege(r.role_name, f.oid, 'EXECUTE') AS effective_execute
FROM public_functions AS f
CROSS JOIN target_roles AS r
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.role_name)
ORDER BY f.proname, f.identity_arguments, r.role_name;

-- 3. Explicit/current function ACL entries (not the default ACL for future
--    functions). A NULL proacl means PostgreSQL's built-in owner/PUBLIC default.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_userbyid(p.proowner) AS owner_name,
  CASE WHEN x.grantee = 0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(x.grantee) END AS grantee_name,
  x.privilege_type,
  x.is_grantable,
  (p.proacl IS NULL) AS using_builtin_default_acl
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(p.proacl, acldefault('f', p.proowner))
) AS x
WHERE n.nspname = 'public'
ORDER BY p.proname, identity_arguments, grantee_name, x.privilege_type;

-- 4. Creator roles with recorded default ACL entries. This is an inventory,
--    not a guarantee that these are the only roles able to create public
--    functions. Compare with actual object ownership and deployment tooling.
SELECT DISTINCT
  pg_get_userbyid(d.defaclrole) AS object_creator
FROM pg_default_acl AS d
WHERE d.defaclobjtype = 'f'
ORDER BY object_creator;
