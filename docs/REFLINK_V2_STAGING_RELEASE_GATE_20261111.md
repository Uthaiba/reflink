# REFLINK v2.0 — Staging release gate and security evidence (2026-11-11)

**Scope:** Existing REFLINK application, staging branch `reflink/staging-baseline-reconstruction-20261110`, synthetic staging project `rcskuzmvyugbanygizri`. Production project `uwwzbljufqbzkjflpnll` is out of scope.

## Verified

- GitHub quality gate #408 succeeded on commit `612b00e52473a268e0a7e23fba7434eb88e6d598`. Later commits require their own successful CI runs.
- Read-only migration effect matrix: 13/13 final-state controls present; the 13 post-baseline versions remain absent from the staging migration ledger. Presence of final effects does **not** prove historical SQL execution or full source equivalence.
- Data preflight: 0 referrals, 1 administrator profile, 3 synthetic facilities; no offline retry-key conflicts (empty referral table).
- Staging negative authorization: unassigned synthetic identity rejected by investigation registration, administrator analytics, facility user count RPCs, referral read/print audit RPCs and counter-referral submission.
- Six administrator reporting RPCs: 6/6 reject unassigned identity and 6/6 permit the staging administrator at the database-role/JWT-subject simulation layer.
- Profile RLS: unassigned synthetic identity could not read the existing administrator profile.
- Security Advisor warnings: 14 exposed authenticated-executable SECURITY DEFINER functions, plus disabled leaked-password protection. Catalog review shows auth-related guard references, but each privileged function requires full semantic review. Warnings are not proof of exploitation.

## Release blockers — do not declare complete

1. **Backup:** independently verify and retain a restorable staging backup before any ledger repair.
2. **Migration equivalence:** independent final source-to-live-catalog review and approval; do not reapply superseded intermediate SQL. After approval use the existing staging-only migration repair runbook and re-run the matrix.
3. **Real Auth clinical acceptance:** provision synthetic PHC, receiving, unrelated-facility and admin users using approved account provisioning; create a synthetic referral. Run `scripts/staging-authenticated-referral-access.mjs` using private local credentials. Follow with write-side clinical lifecycle, attachments, offline retry and notifications tests.
4. **Auth configuration:** evaluate enabling leaked-password protection in staging and confirm impact on account provisioning; do not change production configuration as part of this staging audit.
5. **Security review:** manually verify the 14 SECURITY DEFINER functions' role, facility and referral ownership enforcement. Do not revoke necessary execution rights without checking frontend dependencies.
6. **Final CI and release signoff:** all workflows green for final commit, complete clinical acceptance evidence, explicit release approval before merging or deploying.

## Go / no-go

**Current decision: NO-GO for production promotion.** Staging read-only evidence is positive, but backup, migration-history reconciliation and real Auth clinical acceptance are not complete. Do not create a billable Supabase branch or write to production.
