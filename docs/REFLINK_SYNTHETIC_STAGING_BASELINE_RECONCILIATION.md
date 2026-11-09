# REFLINK — Production-to-Synthetic-Staging Baseline Reconciliation

**Review date:** 9 November 2026  
**Production inspection:** metadata/catalog only; no application rows were queried or modified.  
**Staging target:** `reflink-synthetic-staging` (isolated Supabase project).  
**Staging changes:** none applied in this review.

## 1. Environment verification

The connected Supabase account exposes two projects relevant to REFLINK:

- Production: `Reflink`.
- Isolated staging: `reflink-synthetic-staging`.

The staging project is active and currently has no public application tables, no recorded migrations and no development branches. It is the correct target for a synthetic reconstruction; production was used only for read-only catalog inspection.

The production migration ledger contains exactly one entry: `20260928203447_reflink_v2_rural_first`. The repository's subsequent remediation migrations are not represented in that ledger. This remains a migration-history reconciliation issue; the current schema must not be falsely represented as a replay of the missing historical migration source.

## 2. Corrected schema-export finding

The owner-supplied `reflink-production-schema.sql` is 64,434 bytes and 1,612 lines. Its static inventory contains 14 public tables, 16 functions, two views, 30 RLS policies, 10 explicit indexes, 23 foreign keys, and RLS enabled on all 14 tables.

**Critical correction:** the SQL artifact contains zero `CREATE TRIGGER` statements. The prior manifest incorrectly counted the nine triggers observed in the live catalog as though they were included in the file. The manifest has been corrected. The nine live trigger definitions are now recorded separately in:

`docs/catalog_exports/20261109_live_public_trigger_snapshot.sql`

The trigger snapshot records:
1. `counter_referrals_audit_mutation` — counter-referral audit.
2. `guard_profile_security_fields` — protected profile-field guard.
3. `referral_draft_updated_at` — draft timestamp.
4. `referral_ack_due_at_trigger` — acknowledgement deadline.
5. `referral_counter_referral_guard` — counter-referral-before-completion guard.
6. `referral_entry_validation_trigger` — referral intake validation.
7. `referral_status_audit_trigger` — status history.
8. `referral_status_transition_validation` — lifecycle transition validation.
9. `referrals_audit_mutation` — referral audit.

The trigger definitions were read from PostgreSQL's `pg_trigger` and `pg_get_triggerdef`; their function definitions were read from `pg_get_functiondef`. They were not inferred from function names.

## 3. Live authorization findings

The live `public.referrals` INSERT policy, `PHC staff can create referrals`, requires the inserted referrer identity to equal `auth.uid()` and the caller's profile to be PHC staff at the inserted referring facility. It does not itself validate that the receiving facility is active or force system-controlled initial-state fields.

The live receiving-facility SELECT policy is named `Receiving facilities can view assigned referrals`. Its predicate checks that the referral's receiving facility matches the caller's profile facility, but does not explicitly require `role = 'receiving_staff'`. Consequently, any authenticated profile at that facility that can satisfy the policy may receive the same SELECT visibility. This needs a role-specific policy candidate and negative tests.

The live receiving UPDATE policy does check `role = 'receiving_staff'` and facility equality in both `USING` and `WITH CHECK`. However, the authenticated database role has broad table UPDATE privilege on referrals; RLS limits rows, not which columns on an allowed row can be modified. A column-level write boundary or transactional workflow API is still required to protect referral provenance and PHC-originated clinical data.

The live authenticated role has `TRUNCATE` on the core application tables. PostgreSQL RLS does not protect against `TRUNCATE`; this is a structural privilege issue, not an RLS-policy issue. The existing structural-privilege remediation candidate must be verified against the actual complete grant matrix.

## 4. Default-privilege discrepancy

The production catalog confirms default ACL entries for both `postgres` and `supabase_admin` in the public schema. For both creators, the observed default table ACLs grant the broad table privilege set to `anon`, `authenticated`, `postgres`, and `service_role`; sequence ACLs include SELECT/UPDATE/USAGE; and function EXECUTE defaults include the corresponding roles.

The supplied export includes nine default-privilege statements for `postgres`, but omits the `supabase_admin` creator defaults. Do not treat the export as a complete representation of production default ACLs. A safe staging baseline should explicitly decide whether to reproduce the observed unsafe defaults for regression testing or apply a least-privilege target baseline. The latter is preferred for an operational staging environment, but tests of the current production ACL exposure must use a controlled snapshot or isolated test role.

## 5. View security and managed services

The two production views have no `security_invoker=true` reloption. Supabase documents that views normally execute with owner privileges and can bypass underlying RLS; however, the supplied grant snapshot shows SELECT on the analytics views is service-role-only. Keep them inaccessible to browser roles unless a separate security review approves an invoker-safe design.

The schema export does not represent Storage bucket policies, Auth configuration, Realtime publication membership, extension versions, or non-public schemas. These must be inventoried separately if the staging environment is intended to emulate those services.

## 6. Staging reconstruction decision

The staging project is empty, but the supplied SQL alone is not a faithful production reconstruction because it omits all nine trigger attachments and the `supabase_admin` default ACL state. The trigger snapshot closes the trigger-definition gap, but the remaining ACL and managed-service decisions still need an explicit staging target specification.

**No schema was applied to staging in this step.** This is deliberate: applying a partial baseline would create a misleading test environment and could give false confidence in lifecycle/security verification.

### Next execution gates

1. Build a reviewed staging baseline from the 14-table/16-function/2-view/30-policy export plus the nine-trigger snapshot.
2. Decide whether staging should reproduce the current broad ACLs for regression testing or use a least-privilege baseline; do not silently copy production default ACLs.
3. Verify all objects and grants after baseline restore using PostgreSQL catalogs.
4. Load only synthetic users, facilities and referral fixtures. Never copy production Auth users, patients, referrals, audit logs or Storage objects.
5. Apply the referral-creation trigger candidate only after its exact columns, trigger ordering and role behavior are confirmed against this reconstructed schema.
6. Execute positive and negative RLS/trigger tests with synthetic JWT identities for PHC staff, receiving staff, wrong-facility users and administrators.
7. Keep production read-only until the complete staging suite passes and the release review is approved.
