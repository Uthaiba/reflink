# REFLINK — Privileged Function and Investigation Storage Review

**Review date:** 10 November 2026  
**Environment:** Production Reflink, read-only catalog inspection  
**Scope:** Public SECURITY DEFINER functions, referral triggers, Storage object policies and effective privileges. No patient/referral rows or file contents were queried; no changes were applied.

## 1. Referral audit triggers and PHI handling

The six enabled triggers on referrals include referrals_audit_mutation and referral_status_audit_trigger. The mutation trigger calls public.audit_referral_mutation(), a SECURITY DEFINER function owned by postgres.

Observed behavior: on INSERT it stores to_jsonb(NEW) in audit_log.new_data; on UPDATE it stores to_jsonb(OLD) and to_jsonb(NEW) in audit_log.old_data/new_data; on DELETE it stores to_jsonb(OLD). The referrals row includes patient_identifier, patient_phone, patient_address, relative_name, relative_relationship, relative_phone and extensive clinical fields.

Implication: the audit log duplicates the full referral row, including sensitive patient and clinical information, on every mutation. This may be necessary for some forensic purposes, but the current design is not data-minimised. Audit access, retention, encryption, export, backup, and the ability to erase or correct patient data need a formal privacy/clinical governance decision. Do not silently remove audit evidence; design a field-level allowlist or a separate protected clinical audit strategy.

Additional critical finding: effective privilege inspection shows authenticated has TRUNCATE on audit_log. RLS does not protect against TRUNCATE. This could destroy audit history despite the audit_log SELECT policy being administrator-only. Revoke planning must be prioritised, but do not apply a change until the full privilege/dependency and operational matrix is reviewed.

## 2. SECURITY DEFINER function inventory

Catalog inspection found the following SECURITY DEFINER functions in public. All are owned by postgres:

| Function | Authenticated EXECUTE | Observed purpose / guard | Review note |
|---|---:|---|---|
| audit_referral_mutation() | No (service_role and postgres only) | Trigger writes full OLD/NEW row JSON to audit_log | PHI duplication and audit-log retention concern; effective authenticated TRUNCATE on audit_log remains critical |
| log_referral_status_change() | No (service_role and postgres only) | Trigger appends status narrative to referral_updates | SECURITY DEFINER trigger; review recipient-table policies and minimal audit content |
| get_facility_user_count(uuid) | Yes | Requires auth.uid(); non-admin caller may request only their own facility; administrator may request any facility | Guard is explicit; retain regression tests for null facility and role/facility mismatch |
| get_facility_user_counts() | Yes | Requires caller profile role administrator before returning all facility counts | Guard is explicit; preserve while reviewing admin profile trust |
| get_referral_analytics_summary() | No (service_role and postgres only) | Checks is_current_user_administrator() and returns aggregate view | Service-role-only grant is an important boundary; view itself is not browser-readable per prior grant review |
| is_administrator() | Yes | Checks profile role for auth.uid() | Used by multiple RLS policies; do not revoke or replace without dependency migration and tests |
| is_current_user_administrator() | No (service_role and postgres only) | Checks profile role for auth.uid() | Used by analytics summary; avoid duplicate role helper divergence |
| log_referral_print(uuid,text) | Yes | Checks referral participant/admin then inserts print event and returns copy number | Receiving-facility branch checks facility equality but not receiving_staff role |
| log_referral_read(uuid) | Yes | Checks referral participant/admin then writes READ audit event | Receiving-facility branch checks facility equality but not receiving_staff role |
| handle_new_user() | No (service_role and postgres only) | Auth lifecycle function | Review trigger binding and identity/profile creation path before any changes |

All seven inspected functions use an explicit search_path setting. Several use search_path=public; get_facility_user_count uses an empty search_path and fully qualified public references. The public schema ACL inspection shows CREATE is not granted to authenticated or anon, which reduces untrusted object-shadowing exposure in public; nevertheless, preserve explicit qualification and least-privilege execution grants.

## 3. Investigation-result Storage policy findings

The storage.objects policies for bucket referral-investigation-results are:

- SELECT: authenticated users can view files when the referral's referrer is auth.uid(), or the caller profile facility equals the referring facility, or the caller profile facility equals the receiving facility.
- INSERT: the same referral participant/facility condition is used in WITH CHECK.
- UPDATE: two policies (update and replace) use the same facility/referrer predicate in USING and WITH CHECK.
- DELETE: the same facility/referrer predicate is used in USING.

These policies do not explicitly require the caller's role to match the operation. A profile assigned to a facility may satisfy the facility branch even if it is not the intended PHC or receiving clinical role. The policies also grant facility-wide file access rather than limiting access to the individual referral's assigned care team, if the intended model is narrower.

Before changing policies, establish the intended file lifecycle: who uploads PHC investigation results, who may read them at the receiving facility, whether receiving staff may upload additional results, who may replace/delete files, and how corrections are audited. Then test both database row access and Storage object access using synthetic accounts for PHC, receiving staff, non-clinical facility profiles, administrators and wrong-facility users.

## 4. Related RPC access boundaries

- log_referral_print and log_referral_read are callable by authenticated users and contain participant checks. Their receiving-facility checks currently rely on facility equality without an explicit receiving_staff role check.
- get_facility_user_count and get_facility_user_counts are callable by authenticated users but perform explicit authorization checks in their function bodies. Keep negative tests for cross-facility count access and non-admin global count access.
- is_administrator is called by multiple policies. Its dependencies must be mapped before any revocation or signature change.
- get_referral_analytics_summary is not executable by authenticated according to the observed ACL and should remain unavailable to browser users unless a separate reviewed interface is approved.

## 5. Prioritised follow-up

1. Treat authenticated TRUNCATE on audit_log as a critical release blocker. Build a complete effective-privilege matrix for all public tables and inherited roles; then prepare a narrow revocation plan and validate application behavior in staging.
2. Decide on a privacy-preserving audit schema that does not indiscriminately copy all patient and clinical columns into old_data/new_data. Preserve event integrity and traceability.
3. Define a referral file access matrix and update Storage policies only after role, facility, referral participation and correction semantics are approved.
4. Review SECURITY DEFINER ownership, search_path, ACLs and function dependencies together. Do not revoke is_administrator while policies depend on it.
5. Execute tests against the synthetic staging environment once the full schema, functions, policies, triggers, Storage bucket and synthetic identities have been reconstructed.

## Release status

No production or staging changes were made. These findings are evidence from read-only catalog inspection and are not a substitute for authenticated integration tests. Production remains unchanged and the synthetic staging project remains empty pending an approved complete baseline.