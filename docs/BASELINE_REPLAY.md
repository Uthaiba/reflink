# Disposable baseline replay and drift comparison

The database workflow now creates a second database, reflink_baseline_replay, inside its disposable PostgreSQL container. It requires the loopback CI server, expected fixture database and a synthetic fixture marker before creating that database. It never connects to a hosted project.

After archive integrity checks, the harness applies all 22 recovered scripts in ledger order, using explicitly simplified managed-service dependencies. It compares public relations, columns, functions, constraints, triggers, views and public/storage-object policies with a fresh catalog-only snapshot of synthetic staging. Function bodies and view definitions are represented by fingerprints; no clinical/account/storage-object rows are in the snapshot.

The comparison reports hosted-only, replay-only and changed objects to baseline-replay-report.json, retained as a CI artifact. Known out-of-ledger PHC registration drift must be detected. A passing test means the harness detected that drift, not that the schema is ready for hosted deployment. Additional differences must be reviewed individually, never hidden to make the result green.

The harness then applies the actual two CLI-generated atomic migrations to the recovered public baseline and runs the clinical structural preflight. This exercises a substantially fuller baseline than the separate clinical fixtures, but does not simulate real Auth/Storage/Reatime services.

Excluded comparison scope: table/column grants, indexes, default privileges, bucket configuration rows, publication membership, managed service internals and Auth configuration. The stored snapshot is metadata-only and no hosted database changes were made to capture it.

Runtime evidence must come from the CI run for the current source. Syntax compilation of the Python runner alone is not a successful replay. The active migration directory still contains only the incremental candidates; the recovered historical archive remains quarantined.
