# Atomic clinical saves — review candidate

The proposed `database/changes/atomic_clinical_updates.sql` adds a transaction for receiving assessment, admission and discharge saves. It locks the authorized referral, compares a complete clinical snapshot, validates an allowlisted patch, records an idempotent operation and executes existing audit triggers in one transaction. Response projections exclude patient identity fields. Active account/session, receiving role, facility and password-reset checks run on replay as well as first save.

Apply only after the investigation candidate in an isolated rehearsal. This file is not an applied migration. Its direct-write trigger would reject the existing frontend clinical writes: do not apply it to a hosted environment before the frontend adapter and release flag are implemented and rehearsed together. Current frontend behaviour is unchanged.

`tests/database/clinical_contracts.py` first runs the investigation contracts, then adds synthetic clinical columns and tests concurrent assessment edits, replay, admission/discharge lifecycle, authorization, validation, rollback and direct-write denial. The fixture is not a complete Supabase/RLS/storage rehearsal. Existing audit triggers must be inspected against the actual baseline before promotion. This change does not implement privileged corrections or attachment reconciliation.

Release work still required: frontend RPC integration behind a disabled flag; authenticated staging workflow tests; migration-history reconciliation; clinical review; rollback rehearsal. Never enable the client flag before the backend is verified. Neither hosted database nor production is changed by these tests.
