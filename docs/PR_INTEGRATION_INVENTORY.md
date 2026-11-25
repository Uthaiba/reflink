# REFLINK v2.0 integration inventory

The four open change requests target two branches. This inventory lists every changed path reported by GitHub for these request heads. The request numbers identify which pull requests touched each path. Shared paths need a content comparison before integration. A missing request number alone does not establish that functionality is absent from the candidate.

| Request | Base | Reviewed head | Changed paths |
| --- | --- | --- | ---: |
| [#1](https://github.com/Uthaiba/reflink/pull/1) | v2.0-release | `a5655b11acf700de7f5b14ac07052ab92e6e3ca9` | 141 |
| [#2](https://github.com/Uthaiba/reflink/pull/2) | main | `eaf2e1ba30f8068241815032de415e361e57bb54` | 90 |
| [#3](https://github.com/Uthaiba/reflink/pull/3) | main | `7836113049fed6a1543b64f7227e615f44686ea1` | 40 |
| [#4](https://github.com/Uthaiba/reflink/pull/4) | main | `ee6fc466a8b0a73385d1bba71421df7d196c0b9b` | 140 |

The three earlier heads have diverged from request 4. Request 4 contains the approved logo and its offline assets. The release checklist tracks hosted acceptance, clinical approval and recovery evidence. [Release checklist](CLINICAL_PRODUCTION_ACCEPTANCE_GATE.md)

| Changed path | Requests |
| --- | --- |
| `.github/workflows/database-contracts.yml` | #3, #4 |
| `.github/workflows/frontend-quality-gate.yml` | #3, #4 |
| `.github/workflows/quality.yml` | #1 |
| `.github/workflows/reflink-lockfile-security-repair.yml` | #2 |
| `.github/workflows/reflink-quality-gate.yml` | #2 |
| `README.md` | #3, #4 |
| `api/referral-sms.js` | #1 |
| `database/baselines/synthetic-staging-20261117/20261110063521_reconstruct_production_schema_in_staging.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110063620_configure_private_referral_storage_and_realtime.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110063704_add_staging_foreign_key_indexes_and_secure_views.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110063756_optimize_rls_auth_context_evaluation.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110063844_merge_equivalent_permissive_rls_policies.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110063912_pin_security_definer_search_paths.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110063935_explicitly_deny_client_access_to_internal_ledgers.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110065403_harden_concurrent_referral_print_auditing.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110065634_guard_forced_password_change_flag.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110134607_minimize_phi_in_audit_ledger.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110134826_add_idempotent_referral_notification_queue.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110135058_restrict_notification_trigger_function.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110135145_add_privacy_preserving_public_health_aggregate.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110135512_exclude_referral_identifiers_from_audit.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110142053_publish_referral_notifications_to_realtime.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110181053_restore_admin_reporting_and_counter_referral_workflows.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110181810_fix_admin_facility_reporting_output_qualification.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110182140_allow_referring_facility_to_read_counter_referral.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110182502_fix_counter_referral_completed_at_ambiguity.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110194223_restrict_counter_referral_clinical_read_to_participants.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110202141_restrict_referral_update_columns.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/20261110203341_require_authenticated_referral_read_audit.sql` | #4 |
| `database/baselines/synthetic-staging-20261117/README.md` | #4 |
| `database/baselines/synthetic-staging-20261117/catalog_inventory.json` | #4 |
| `database/baselines/synthetic-staging-20261117/manifest.json` | #4 |
| `database/changes/atomic_clinical_updates.sql` | #4 |
| `database/changes/atomic_investigation_updates.sql` | #3, #4 |
| `database/checks/clinical_staging_preflight.sql` | #4 |
| `database/checks/public_baseline_inventory.sql` | #4 |
| `database/staging/synthetic_overdue_ack_dashboard_drill.sql` | #4 |
| `docs/ACCOUNT_PROVISIONING_RELEASE_RUNBOOK.md` | #1 |
| `docs/ADMIN_ANALYTICS_PRIVACY_BOUNDARY_REVIEW.md` | #1 |
| `docs/AGGREGATE_AND_OFFLINE_CONTINUATION.md` | #4 |
| `docs/ATOMIC_CLINICAL_SAVES.md` | #4 |
| `docs/ATOMIC_INVESTIGATION_UPDATE_SPEC.md` | #3, #4 |
| `docs/ATOMIC_MIGRATION_PACKAGE.md` | #4 |
| `docs/AUDIT_AND_PRINT_EVENT_DEPENDENCY_AUDIT.md` | #1 |
| `docs/AUDIT_LOG_DATA_MINIMIZATION_MIGRATION_CANDIDATE.md` | #1 |
| `docs/AUDIT_LOG_PHI_MINIMIZATION_DESIGN.md` | #1 |
| `docs/AUDIT_LOG_PRIVILEGE_RESTRICTION_CANDIDATE.md` | #1 |
| `docs/AUTH_PROVISIONING_SECURITY_REVIEW.md` | #1 |
| `docs/BASELINE_FUNCTION_SECURITY_REVIEW.md` | #1 |
| `docs/BASELINE_REPLAY.md` | #4 |
| `docs/CI_CREDENTIAL_REMEDIATION_2026-11-17.md` | #4 |
| `docs/CLINICAL_DRAFT_NAVIGATION.md` | #4 |
| `docs/CLINICAL_GOVERNANCE_REFERRAL_DECLINE.md` | #1 |
| `docs/CLINICAL_PRODUCTION_ACCEPTANCE_GATE.md` | #3, #4 |
| `docs/CLINICAL_SAVE_RECOVERY.md` | #4 |
| `docs/CLINICAL_STAGING_CHECKPOINT.md` | #4 |
| `docs/DATABASE_PRIVILEGED_OBJECT_DEPENDENCY_GRAPH.md` | #1 |
| `docs/DEPENDENCY_SECURITY_TRIAGE.md` | #1 |
| `docs/FACILITY_USER_COUNT_RPC_SECURITY_REVIEW.md` | #1 |
| `docs/HOSTED_STAGING_INSTALLATION_2026-11-17.md` | #4 |
| `docs/IDENTITY_AND_ACCOUNT_PROVISIONING_RECONCILIATION.md` | #1 |
| `docs/INVESTIGATION_ATTACHMENT_RECONCILIATION.md` | #3, #4 |
| `docs/IN_APP_NOTIFICATION_CENTRE.md` | #1 |
| `docs/LIVE_DATABASE_AUTHORIZATION_EVIDENCE_20261110.md` | #1 |
| `docs/MASTER_PLAN_AUDIT_2026-11-16.md` | #3, #4 |
| `docs/MASTER_PLAN_COMPLETION_REGISTER.md` | #4 |
| `docs/MASTER_PRODUCT_TRANSFORMATION_STATUS.md` | #1 |
| `docs/MASTER_SYSTEM_AUDIT_20261110.md` | #1 |
| `docs/MIGRATION_GOVERNANCE.md` | #1 |
| `docs/MIGRATION_RECONCILIATION_PLAN.md` | #1 |
| `docs/NOTIFICATION_INBOX_ADAPTER.md` | #1 |
| `docs/NOTIFICATION_INBOX_SCHEMA_AND_ACCESS_DESIGN.md` | #1 |
| `docs/NOTIFICATION_OUTBOX_DESIGN.md` | #1 |
| `docs/NOTIFICATION_RECIPIENT_AND_DELIVERY_CONTRACT.md` | #1 |
| `docs/NOTIFICATION_RECIPIENT_ELIGIBILITY.md` | #1 |
| `docs/OFFLINE_PHI_THREAT_MODEL.md` | #1 |
| `docs/PASSWORD_CHANGE_RECOVERY.md` | #3, #4 |
| `docs/PHASE_1_AUDIT_AND_REMEDIATION.md` | #1 |
| `docs/PRIVILEGED_FUNCTION_AND_INVESTIGATION_STORAGE_REVIEW_20261110.md` | #1 |
| `docs/PRIVILEGED_FUNCTION_HARDENING_DESIGN.md` | #1 |
| `docs/PRIVILEGED_RPC_SECURITY_REVIEW.md` | #1 |
| `docs/PRIVILEGED_RPC_SECURITY_REVIEW_20261110.md` | #1 |
| `docs/PRIVILEGED_RPC_SOURCE_RECONCILIATION.md` | #1 |
| `docs/PRODUCTION_COMPLETION_RUNBOOK.md` | #3, #4 |
| `docs/PRODUCTION_SCHEMA_EXPORT_RUNBOOK.md` | #1 |
| `docs/PRODUCTION_SCHEMA_RECONCILIATION_20261110.md` | #1 |
| `docs/RECEIVING_FORM_NAVIGATION.md` | #4 |
| `docs/REFERRAL_ANALYTICS_VIEW_SECURITY_REVIEW.md` | #1 |
| `docs/REFERRAL_APPLICATION_WRITE_PATH_INVENTORY_20261110.md` | #1 |
| `docs/REFERRAL_CREATE_DATABASE_BOUNDARY_REVIEW.md` | #1 |
| `docs/REFERRAL_LIFECYCLE_FACILITY_ISOLATION_AUDIT.md` | #1 |
| `docs/REFERRAL_PRINT_ACCEPTANCE_2026-11-17.md` | #4 |
| `docs/REFERRAL_PRINT_EVENT_INTEGRITY_CANDIDATE.md` | #1 |
| `docs/REFERRAL_PRINT_SEQUENCE_CONCURRENCY_DESIGN.md` | #1 |
| `docs/REFERRAL_PUBLIC_HEALTH_INTELLIGENCE.md` | #1 |
| `docs/REFERRAL_ROW_AND_COLUMN_AUTHORIZATION_REVIEW_20261110.md` | #1 |
| `docs/REFERRAL_WRITE_SURFACE_COLUMN_AUTHORIZATION_MATRIX.md` | #1 |
| `docs/REFLINK_BRANCH_RECONCILIATION_REVIEW_20261110.md` | #2 |
| `docs/REFLINK_CONTINUITY_HANDOFF.md` | #1 |
| `docs/REFLINK_FILE_LEVEL_INTEGRATION_MATRIX_20261111.md` | #2 |
| `docs/REFLINK_MASTER_PRODUCTION_RELEASE_GATE_20261112.md` | #2 |
| `docs/REFLINK_OFFLINE_SYNC_SECURITY_DECISION_20261111.md` | #2 |
| `docs/REFLINK_STAGING_ACCEPTANCE_TEST_PLAN.md` | #2 |
| `docs/REFLINK_STAGING_BASELINE_STATUS.md` | #2 |
| `docs/REFLINK_STAGING_EXACT_DEFINITION_VERIFICATION_20261111.md` | #2 |
| `docs/REFLINK_STAGING_FACILITY_ISOLATION_RLS_REVIEW_20261111.md` | #2 |
| `docs/REFLINK_STAGING_IDENTITY_BOOTSTRAP_RUNBOOK.md` | #2 |
| `docs/REFLINK_STAGING_INVESTIGATION_FUNCTION_BODY_MATCH_20261111.md` | #2 |
| `docs/REFLINK_STAGING_MIGRATION_LEDGER_REPAIR_RUNBOOK_20261111.md` | #2 |
| `docs/REFLINK_STAGING_MIGRATION_RECONCILIATION_20261111.md` | #2 |
| `docs/REFLINK_STAGING_POST_BASELINE_CATALOG_AUDIT_20261111.md` | #2 |
| `docs/REFLINK_STAGING_POST_BASELINE_MIGRATION_INVENTORY_20261111.md` | #2 |
| `docs/REFLINK_STAGING_REAL_AUTH_ACCEPTANCE_20261111.md` | #2 |
| `docs/REFLINK_STAGING_VERIFICATION_EVIDENCE_20261112.md` | #2 |
| `docs/REFLINK_V2_BRANCH_RECONCILIATION_20261111.md` | #2 |
| `docs/REFLINK_V2_STAGING_RELEASE_GATE_20261111.md` | #2 |
| `docs/REQUESTED_RELEASE_WORK_STATUS.md` | #4 |
| `docs/RPHI_INDICATOR_DATA_DICTIONARY.md` | #1 |
| `docs/RPHI_SCHEMA_AND_FUNCTION_REVIEW.md` | #1 |
| `docs/SECRET_SCAN_TRIAGE.md` | #1 |
| `docs/SECURITY_AND_WORKFLOW_TEST_MATRIX.md` | #1 |
| `docs/SECURITY_HARDENING_PROPOSAL.md` | #1 |
| `docs/STAGING_BASELINE_RECONSTRUCTION_REVIEW_PACKET.md` | #1 |
| `docs/STAGING_BASELINE_RECONSTRUCTION_RUNBOOK.md` | #1 |
| `docs/STAGING_PREFLIGHT_2026-11-17.md` | #4 |
| `docs/STAGING_SYNTHETIC_TEST_PLAN.md` | #1 |
| `docs/STAGING_TRIGGER_COMPATIBILITY_2026-11-17.md` | #4 |
| `docs/SUPABASE_LIVE_PREFLIGHT_20261106.md` | #1 |
| `docs/SYNTHETIC_RESTORE_VERIFICATION.md` | #4 |
| `docs/TARGET_ARCHITECTURE.md` | #1 |
| `docs/VERIFICATION_2026-11-16.md` | #3, #4 |
| `docs/catalog_exports/20261107_live_public_routines.md` | #1 |
| `docs/catalog_exports/20261107_live_public_schema_catalog.md` | #1 |
| `docs/catalog_exports/20261108_public_schema_export_manifest.md` | #1 |
| `docs/catalog_exports/20261108_staging_baseline_dependency_manifest.md` | #1 |
| `docs/catalog_exports/20261109_live_public_trigger_snapshot.sql` | #1 |
| `docs/catalog_exports/reflink-production-schema.sql` | #1 |
| `index.html` | #1, #4 |
| `package-lock.json` | #1, #2, #4 |
| `package.json` | #1, #3, #4 |
| `public/manifest.webmanifest` | #4 |
| `public/reflink-icon.svg` | #4 |
| `public/reflink-logo.png` | #4 |
| `public/reflink-symbol.png` | #4 |
| `public/sw.js` | #1 |
| `scripts/reflink-release-evidence-gate.mjs` | #2 |
| `scripts/staging-authenticated-referral-access.mjs` | #2 |
| `scripts/staging-create-synthetic-referral.mjs` | #2 |
| `scripts/staging-provision-synthetic-clinical-users.mjs` | #2 |
| `src/App.css` | #1 |
| `src/App.jsx` | #1, #2, #3, #4 |
| `src/admin-workspace.css` | #1 |
| `src/aggregate-reporting.css` | #4 |
| `src/components/ClinicalAddenda.jsx` | #4 |
| `src/components/ConnectivityNotice.jsx` | #3, #4 |
| `src/components/CounterReferralForm.css` | #2 |
| `src/components/CounterReferralForm.jsx` | #2 |
| `src/components/EncryptedDraftPanel.jsx` | #3, #4 |
| `src/components/HospitalFeedback.jsx` | #4 |
| `src/components/PhcFollowUp.jsx` | #4 |
| `src/components/continuity-panel.css` | #4 |
| `src/components/dashboards/AdminDashboard.jsx` | #1, #2, #3, #4 |
| `src/components/dashboards/AdminPublicHealthReporting.jsx` | #2 |
| `src/components/dashboards/AggregateChart.jsx` | #4 |
| `src/components/dashboards/AnalysisHub.jsx` | #3, #4 |
| `src/components/dashboards/AnalyticsDashboard.jsx` | #3, #4 |
| `src/components/dashboards/PublicHealthIntelligence.jsx` | #3, #4 |
| `src/components/notifications/NotificationCenter.css` | #2 |
| `src/components/notifications/NotificationCenter.jsx` | #1, #2 |
| `src/components/notifications/notification-center.css` | #1 |
| `src/components/notifications/notificationCenterModel.js` | #1 |
| `src/components/offline/OfflineDraftVault.css` | #2 |
| `src/components/offline/OfflineDraftVault.jsx` | #2 |
| `src/lib/aggregatePresentation.js` | #4 |
| `src/lib/clinicalDraftNavigation.js` | #4 |
| `src/lib/clinicalFormState.js` | #4 |
| `src/lib/clinicalSaveRecovery.js` | #4 |
| `src/lib/clinicalTransaction.js` | #4 |
| `src/lib/diagnosisRecords.js` | #3, #4 |
| `src/lib/encryptedDrafts.js` | #3, #4 |
| `src/lib/investigationAttachmentRecovery.js` | #3, #4 |
| `src/lib/investigationAttachments.js` | #3, #4 |
| `src/lib/investigationUpdates.js` | #3, #4 |
| `src/lib/notificationInbox.js` | #1 |
| `src/lib/offlineDraftVault.js` | #2 |
| `src/lib/offlineQueueCrypto.js` | #1 |
| `src/lib/offlineQueueKeyVault.js` | #1 |
| `src/lib/offlineReferralQueue.js` | #1 |
| `src/lib/offlineShell.js` | #4 |
| `src/lib/offlineVaultLockChannel.js` | #1 |
| `src/lib/passwordChange.js` | #3, #4 |
| `src/lib/publicHealthReports.js` | #3, #4 |
| `src/lib/receivingReferralMetrics.js` | #1 |
| `src/lib/referralAnalytics.js` | #3, #4 |
| `src/lib/referralCreation.js` | #1 |
| `src/lib/referralPresentation.js` | #4 |
| `src/lib/referralPriority.js` | #1 |
| `src/lib/referralSubmission.js` | #3, #4 |
| `src/lib/referralTimeline.js` | #1 |
| `src/lib/reportingUtils.js` | #3, #4 |
| `src/lib/rphiDisclosure.js` | #1 |
| `src/lib/rphiFacilityReporting.js` | #1 |
| `src/main.jsx` | #1, #4 |
| `src/offline-worker.template.js` | #4 |
| `src/referral-print.css` | #4 |
| `src/reflink-clinical-accessibility.css` | #3, #4 |
| `src/reflink-logo.css` | #4 |
| `src/reflink-workspace-quality.css` | #1 |
| `supabase/functions/_shared/accountProvisioningPolicy.js` | #1 |
| `supabase/functions/change-password/index.ts` | #2 |
| `supabase/functions/create-user/index.ts` | #1, #2 |
| `supabase/functions/index.ts` | #1 |
| `supabase/migrations/20261105000100_admin_aggregate_referral_volume.sql` | #1 |
| `supabase/migrations/20261105000200_admin_lga_referral_summary.sql` | #1 |
| `supabase/migrations/20261105000300_admin_facility_reporting_coverage.sql` | #1 |
| `supabase/migrations/20261105000400_admin_referral_pathway_intelligence.sql` | #1 |
| `supabase/migrations/20261105000500_admin_acknowledgement_delay_alerts.sql` | #1 |
| `supabase/migrations/20261105000600_notification_outbox_foundation.sql` | #1 |
| `supabase/migrations/20261106000100_referral_acknowledgement_notification_hooks.sql` | #1 |
| `supabase/migrations/20261107000100_restrict_notification_log_column_access.sql` | #1 |
| `supabase/migrations/20261108000100_restrict_core_table_structural_privileges.sql` | #1 |
| `supabase/migrations/20261109000100_enforce_referral_create_context.sql` | #1 |
| `supabase/migrations/20261110063521_reconstruct_production_schema_in_staging.sql` | #2 |
| `supabase/migrations/20261110063620_configure_private_referral_storage_and_realtime.sql` | #2 |
| `supabase/migrations/20261110063704_add_staging_foreign_key_indexes_and_secure_views.sql` | #2 |
| `supabase/migrations/20261110063756_optimize_rls_auth_context_evaluation.sql` | #2 |
| `supabase/migrations/20261110063844_merge_equivalent_permissive_rls_policies.sql` | #2 |
| `supabase/migrations/20261110063912_pin_security_definer_search_paths.sql` | #2 |
| `supabase/migrations/20261110063935_explicitly_deny_client_access_to_internal_ledgers.sql` | #2 |
| `supabase/migrations/20261110065403_harden_concurrent_referral_print_auditing.sql` | #2 |
| `supabase/migrations/20261110065634_guard_forced_password_change_flag.sql` | #2 |
| `supabase/migrations/20261110134607_minimize_phi_in_audit_ledger.sql` | #2 |
| `supabase/migrations/20261110134826_add_idempotent_referral_notification_queue.sql` | #2 |
| `supabase/migrations/20261110135058_restrict_notification_trigger_function.sql` | #2 |
| `supabase/migrations/20261110135145_add_privacy_preserving_public_health_aggregate.sql` | #2 |
| `supabase/migrations/20261110135512_exclude_referral_identifiers_from_audit.sql` | #2 |
| `supabase/migrations/20261110142053_publish_referral_notifications_to_realtime.sql` | #2 |
| `supabase/migrations/20261110181053_restore_admin_reporting_and_counter_referral_workflows.sql` | #2 |
| `supabase/migrations/20261110181810_fix_admin_facility_reporting_output_qualification.sql` | #2 |
| `supabase/migrations/20261110182140_allow_referring_facility_to_read_counter_referral.sql` | #2 |
| `supabase/migrations/20261110182502_fix_counter_referral_completed_at_ambiguity.sql` | #2 |
| `supabase/migrations/20261110184000_restrict_counter_referral_clinical_read_to_participants.sql` | #2 |
| `supabase/migrations/20261110202141_restrict_referral_update_columns.sql` | #2 |
| `supabase/migrations/20261110203341_require_authenticated_referral_read_audit.sql` | #2 |
| `supabase/migrations/20261111160000_prevent_client_deletion_of_investigation_files.sql` | #2 |
| `supabase/migrations/20261111163000_prevent_client_replacement_of_investigation_files.sql` | #2 |
| `supabase/migrations/20261111170000_align_investigation_file_access_with_referral_participants.sql` | #2 |
| `supabase/migrations/20261111173000_offline_referral_idempotency_unique_index.sql` | #2 |
| `supabase/migrations/20261111180000_restrict_referral_notification_log_to_participants.sql` | #2 |
| `supabase/migrations/20261111183000_require_offline_referral_retry_key.sql` | #2 |
| `supabase/migrations/20261111184500_validate_offline_referral_retry_key.sql` | #2 |
| `supabase/migrations/20261111190000_register_referral_investigation_files.sql` | #2 |
| `supabase/migrations/20261111191500_handle_empty_investigation_arrays.sql` | #2 |
| `supabase/migrations/20261111193000_allow_guarded_admin_analytics_rpc.sql` | #2 |
| `supabase/migrations/20261111194500_lock_registered_investigation_file_metadata.sql` | #2 |
| `supabase/migrations/20261111200000_reject_null_investigation_registration_payload.sql` | #2 |
| `supabase/migrations/20261111201500_require_complete_investigation_file_descriptors.sql` | #2 |
| `supabase/migrations/20261117144634_atomic_investigation_updates.sql` | #4 |
| `supabase/migrations/20261117144653_atomic_clinical_updates.sql` | #4 |
| `supabase/migrations/20261118130000_phc_follow_up.sql` | #4 |
| `supabase/migrations/20261118160000_continuity_milestones.sql` | #4 |
| `supabase/migrations/20261118210000_final_feedback.sql` | #4 |
| `supabase/migrations/20261119211802_clinical_read_session_guard.sql` | #4 |
| `supabase/migrations/20261121092952_closed_record_addenda.sql` | #4 |
| `supabase/migrations/20261121093113_clarify_addendum_reviewer.sql` | #4 |
| `supabase/migrations/20261121190000_receiving_escalation_timestamp.sql` | #4 |
| `supabase/migrations/20261121192000_receiving_escalation_receipt.sql` | #4 |
| `supabase/tests/referral_update_column_privileges.sql` | #2 |
| `supabase/tests/staging_admin_predicate_and_print_audit_role_matrix.sql` | #2 |
| `supabase/tests/staging_admin_reporting_rpc_role_matrix.sql` | #2 |
| `supabase/tests/staging_administrator_analytics_positive.sql` | #2 |
| `supabase/tests/staging_auth_profile_consistency_readonly.sql` | #2 |
| `supabase/tests/staging_authenticated_role_missing_identity_negative.sql` | #2 |
| `supabase/tests/staging_clinical_fixture_readiness_readonly.sql` | #2 |
| `supabase/tests/staging_exposed_security_definer_inventory_readonly.sql` | #2 |
| `supabase/tests/staging_investigation_registration_unauthenticated_negative.sql` | #2 |
| `supabase/tests/staging_migration_equivalence_readonly.sql` | #2 |
| `supabase/tests/staging_migration_repair_data_preflight_readonly.sql` | #2 |
| `supabase/tests/staging_post_baseline_migration_effect_matrix_readonly.sql` | #2 |
| `supabase/tests/staging_post_baseline_migration_ledger_readonly.sql` | #2 |
| `supabase/tests/staging_privileged_rpc_unassigned_identity_negative.sql` | #2 |
| `supabase/tests/staging_second_receiving_hospital_rollback_probe.sql` | #2 |
| `supabase/tests/staging_unassigned_authenticated_identity_negative.sql` | #2 |
| `supabase/tests/staging_unassigned_profile_confidentiality_rls.sql` | #2 |
| `supabase/verification/admin_analytics_privilege_review.sql` | #1 |
| `supabase/verification/auth_provisioning_security_review.sql` | #1 |
| `supabase/verification/default_privilege_effective_access.sql` | #1 |
| `supabase/verification/privileged_rpc_security_review.sql` | #1 |
| `supabase/verification/profile_role_delegation_review.sql` | #1 |
| `supabase/verification/profile_role_delegation_trigger_design.sql` | #1 |
| `supabase/verification/referral_analytics_view_privilege_review.sql` | #1 |
| `supabase/verification/staging_baseline_catalog_verification.sql` | #1 |
| `tests/accountProvisioningContract.test.js` | #1 |
| `tests/adminAnalyticsPrivacyBoundary.test.js` | #1 |
| `tests/aggregatePresentation.test.mjs` | #4 |
| `tests/browser-smoke.mjs` | #4 |
| `tests/browser/offline-queue-harness.js` | #1 |
| `tests/browser/offline-queue.html` | #1 |
| `tests/browser/offline-queue.spec.js` | #1 |
| `tests/clinicalDraftNavigation.test.mjs` | #4 |
| `tests/clinicalFormState.test.mjs` | #4 |
| `tests/clinicalSaveRecovery.test.mjs` | #4 |
| `tests/clinicalTransaction.test.mjs` | #4 |
| `tests/continuity-export-browser.mjs` | #4 |
| `tests/coreTablePrivilegeProposal.test.js` | #1 |
| `tests/counterReferralAccessibility.test.js` | #1 |
| `tests/database/baseline_archive_contracts.py` | #4 |
| `tests/database/baseline_replay_contracts.py` | #4 |
| `tests/database/clinical_contracts.py` | #4 |
| `tests/database/clinical_fixture.sql` | #4 |
| `tests/database/continuity_counts.sql` | #4 |
| `tests/database/fixture.sql` | #3, #4 |
| `tests/database/investigation_contracts.py` | #3, #4 |
| `tests/database/managed_schema_stubs.sql` | #4 |
| `tests/database/migration_package_contracts.py` | #4 |
| `tests/database/observed_staging_overlay.sql` | #4 |
| `tests/database/restore_contracts.py` | #4 |
| `tests/database/staging_trigger_contracts.py` | #4 |
| `tests/database/staging_trigger_fixture.sql` | #4 |
| `tests/diagnosisRecords.test.mjs` | #3, #4 |
| `tests/encryptedDrafts.test.mjs` | #3, #4 |
| `tests/facilityUserCountSecurity.test.js` | #1 |
| `tests/investigationAttachmentRecovery.test.mjs` | #3, #4 |
| `tests/investigationAttachments.test.mjs` | #3, #4 |
| `tests/investigationUpdates.test.mjs` | #3, #4 |
| `tests/migrationGovernance.test.js` | #1 |
| `tests/notificationCenterModel.test.js` | #1 |
| `tests/notificationInbox.test.js` | #1 |
| `tests/offlineQueueCrypto.test.js` | #1 |
| `tests/offlineQueueIndexedDb.test.js` | #1 |
| `tests/offlineQueueIntegration.test.js` | #1 |
| `tests/offlineQueueKeyVault.test.js` | #1 |
| `tests/offlineQueueSecurity.test.js` | #1 |
| `tests/offlineQueueVaultStorage.test.js` | #1 |
| `tests/offlineShell.test.mjs` | #4 |
| `tests/offlineVaultLockChannel.test.js` | #1 |
| `tests/passwordChange.test.mjs` | #3, #4 |
| `tests/privilegedRpcSecurityReview.test.js` | #1 |
| `tests/profileRoleDelegationBoundary.test.js` | #1 |
| `tests/receivingRealtime.test.js` | #1 |
| `tests/receivingReferralMetrics.test.js` | #1 |
| `tests/referral-print-browser.mjs` | #4 |
| `tests/referralAnalytics.test.mjs` | #3, #4 |
| `tests/referralAnalyticsViewSecurity.test.js` | #1 |
| `tests/referralCreateDatabaseBoundary.test.js` | #1 |
| `tests/referralCreationContract.test.js` | #1 |
| `tests/referralFormAccessibility.test.js` | #1 |
| `tests/referralLifecycleConcurrency.test.js` | #1 |
| `tests/referralLifecycleEndToEnd.test.js` | #1 |
| `tests/referralPresentation.test.mjs` | #4 |
| `tests/referralPriority.test.js` | #1 |
| `tests/referralSmsSecurity.test.js` | #1 |
| `tests/referralTimeline.test.js` | #1 |
| `tests/reporting.test.mjs` | #3, #4 |
| `tests/rphiDisclosure.test.js` | #1 |
| `tests/rphiFacilityReporting.test.js` | #1 |
| `tests/schemaExportManifest.test.js` | #1 |
| `tests/securityHardeningProposal.test.js` | #1 |
| `tests/sql/reflink-staging-baseline-assertions.sql` | #2 |
| `vite.config.js` | #4 |
