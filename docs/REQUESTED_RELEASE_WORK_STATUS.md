# Requested release work — current evidence

17 November 2026. This table answers the seven specifically requested areas; it is not a full-completion certificate.

| Requested area | Actual status | Remaining requirement |
| --- | --- | --- |
| Hosted migration reconciliation | Two atomic migrations installed in synthetic staging; repository names match actual ledger; prior history retained; six structural checks pass | Full grant/index/default-privilege and managed-service reconciliation; production baseline remains separate |
| Authenticated clinical testing | Live anonymous RPC denial verified; real-user sign-in not completed | Protected preview and staging role-account sessions; full PHC/receiving/admin/wrong-facility/revoked lifecycle evidence |
| Controlled corrections | Existing guards protect ordinary direct writes | Reason-bearing request/review/application workflow, immutable correction history, clinical approval and negative tests are not implemented |
| Attachment reconciliation | Uncertain documents preserved; new atomic descriptors and legacy writer retirement installed in staging | Server-owned upload intents, authorized case-management/reconciliation UI and controlled resolution remain unimplemented |
| Workflow/design | Existing role screens, safer clinical saves, aggregate charts, connection notices, code splitting and limited Chromium/mobile checks | Explicit acceptance/rejection/escalation contracts, design-system consolidation, full accessibility and clinical workflow review |
| AI/interoperability | Traceable deterministic aggregate report drafts exist | They are not AI. Approved provider/configuration, institutional destinations, data contracts and validated FHIR/DHIS2 integration remain missing |
| Restore verification | Disposable pg_dump/pg_restore rehearsal passed with synthetic clinical row, audit, ledgers, selected grants and stub bucket metadata | Actual production backup, real Auth/files/encryption-key recovery, RPO/RTO and authorized operational restore rehearsal remain unverified |

Staging preview: https://reflink-697m49ttr-uthaibas-projects.vercel.app . It is Vercel-authentication protected and points only to synthetic staging. The secure browser authentication attempt was not completed; no retries, credential workarounds or weakened authentication settings were used. No synthetic accounts or signup emails were created.

Production is unchanged. Do not merge or promote based on isolated CI or structural preflight alone. The remaining source features above are openly unimplemented; their absence must not be described merely as awaiting deployment or sign-off.
