# Disposable baseline replay and drift comparison

The database workflow now creates a second database, reflink_baseline_replay, inside its disposable PostgreSQL container. It requires the loopback CI server, expected fixture database and a synthetic fixture marker before creating that database. It never connects to a hosted project.

After archive integrity checks, the harness applies all 22 recovered scripts in ledger order, using explicitly simplified managed-service dependencies. It compares public relations, columns, functions, constraints, triggers, views and public/storage-object policies with a fresh catalog-only snapshot of synthetic staging. Function bodies and view definitions are represented by fingerprints; no clinical/account/storage-object rows are in the snapshot.

The comparison reports hosted-only, replay-only and changed objects to baseline-replay-report.json, retained as a CI artifact. Known out-of-ledger PHC registration drift must be detected. A passing test means the harness detected that drift, not that the schema is ready for hosted deployment. Additional differences must be reviewed individually, never hidden to make the result green.

The harness then applies the actual two CLI-generated atomic migrations to the recovered public baseline and runs the clinical structural preflight. This exercises a substantially fuller baseline than the separate clinical fixtures, but does not simulate real Auth/Storage/Realtime services.

Excluded comparison scope: table/column grants, indexes, default privileges, bucket configuration rows, publication membership, managed service internals and Auth configuration. The stored snapshot is metadata-only and no hosted database changes were made to capture it.

Runtime evidence must come from the CI run for the current source. Syntax compilation of the Python runner alone is not a successful replay. The active migration directory still contains only the incremental candidates; the recovered historical archive remains quarantined.

## Observed drift and reviewed replay overlay

Initial replay #38 on source f7840d1 succeeded and found eight differences: two hosted-only objects (offline submission constraint and PHC registration function), three changed participant/storage policies and three obsolete storage mutation policies present only in replay. The separate tests/database/observed_staging_overlay.sql reconstructs those observed definitions and removes the obsolete policies only in the disposable database. CI requires a match in the selected metadata after that overlay, before applying the atomic candidates.

The legacy PHC registration function is captured for provenance but deliberately has no ordinary-client execution grant in this fixture. Its hosted definition lacks the new current-account/session/password and closed-record checks and is a privileged writer. Its actual hosted execution grants must be reviewed and the endpoint retired or replaced in the coordinated deployment. A matching function-body fingerprint is not a security endorsement. This overlay is test-only and must not be applied to either hosted environment.

Read-only grant inspection confirmed authenticated users can execute the hosted legacy function (anonymous users cannot). The pending investigation candidate and its matching migration now revoke PUBLIC/anonymous/authenticated execution when that legacy signature exists. The replay deliberately grants authenticated access before applying the candidates and requires its removal afterwards. This is a coordinated frontend/backend cutover requirement: old clients using the legacy function will be denied after installation. No hosted grant has been changed.

## Verified source

Code source aa1251949bc11af3ec0a5a1dc8ffb3a3c3747ff4 passed database workflow #42: archive integrity, prior contracts, all 22 migrations replayed, eight differences detected and reconciled within selected metadata, both atomic migrations applied/preflighted, and legacy endpoint execution revoked. Frontend workflows #117/#118 (112 unit tests, lint/build and synthetic Chromium smoke checks) and GitGuardian passed on the same source. This is disposable evidence; hosted service/authenticated workflow certification remains open.
