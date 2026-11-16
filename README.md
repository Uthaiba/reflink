# REFLINK

**REFLINK** is a healthcare referral coordination application designed to support referral continuity between primary healthcare facilities and receiving hospitals, including low-connectivity environments.

## Application

The existing frontend is built with React and Vite and uses Supabase for application data and authentication. The repository includes referral workflows, clinical information capture, receiving-facility processes, administration, and analytics components. The implementation and security of each workflow must be validated before production release.

## Local development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev
```

For static analysis and a production bundle:

```bash
npm run lint
npm run build
```

Configure environment variables locally using the names expected by `src/lib/supabase.js`. **Never commit Supabase secrets, service-role keys, patient information, or local `.env` files.** The browser must use only a publishable/anon key; all authorization must be enforced by server-side policies.

## Environments and release boundaries

- **Production:** `uwwzbljufqbzkjflpnll`. Do not deploy, change database schema, or use live clinical records for tests without an approved release and a verified recovery plan.
- **Synthetic staging:** `rcskuzmvyugbanygizri`. Use only approved synthetic data and explicitly authorized operations.
- **Local development:** Isolated database and frontend checks, without hosted production changes.

The `frontend-quality-gate.yml` workflow runs lint and build only. A passing workflow does **not** establish clinical safety, RLS correctness, end-to-end authenticated access, backup recoverability, or production readiness.

## Release requirements

Before production deployment, verify:
1. Reviewed and approved source-code changes, with passing automated checks.
2. Database migration compatibility, verified backup and tested recovery.
3. Real authenticated PHC, receiving-clinician, outsider and administrator authorization tests.
4. Referral lifecycle, counter-referral, audit and notification behavior.
5. Clinical documentation, attachments, privacy and retention controls.
6. Offline draft confidentiality, synchronization conflict handling and recovery.
7. Accessibility, responsive design, performance and operational monitoring.
8. Written deployment approval, rollback instructions and post-release verification.

Do not merge or deploy changes simply because the frontend builds successfully.

## Scope

REFLINK is an existing product. Improvements should preserve working features, historical records, facility assignments, patient confidentiality and the original referral-continuity mission.
