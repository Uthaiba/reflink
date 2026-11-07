# Dependency Security Triage — 7 November 2026

## Baseline evidence

The REFLINK quality workflow was extended to print the full npm audit package/advisory summary. On commit `9410ad4e55d1d40d98481b41518d07c540a37b03`, CI ran `npm audit --json` after `npm ci`.

The report identified **2 high-severity vulnerable package entries**, no critical or moderate package entries in the npm summary:

| Package | Installed | Severity | Affected range | Advisory | Fix available |
|---|---:|---|---|---|---|
| `source-map-js` | 1.2.1 | High | `>=1.0.0 <1.2.2` | GHSA-68fv-2mgg-jv7q — event-loop denial of service through indexed source-map section offsets | Yes |
| `vite` | 8.2.1 | High | npm audit package range `8.2.0 - 8.2.2` | GHSA-587h-7wmj-h5pm — launch-editor Windows `fs.existsSync()` bypass | Yes |

The Vite package also carried additional advisories in the same vulnerable version range: GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22 and GHSA-vfpm-58rq-9qcg. Their individual severities range from low to moderate; npm's two-high summary counts the affected package entries, not the number of advisories.

## Remediation applied in source

- Updated the direct development dependency `vite` from `^8.2.0` to `^8.2.4`, staying on the supported Vite 8.2 patch line.
- Updated the lockfile Vite package to 8.2.4 and its compatible `rolldown` dependency/bindings to 1.2.4.
- Updated `source-map-js` from 1.2.1 to 1.2.2, the first release outside the affected range.
- Kept React and Supabase runtime dependency versions unchanged; neither was named in the CI audit report.
- Added a CI report step so future npm audit findings include exact package names, severities, affected ranges, advisories and fix availability instead of only the generic npm install summary.

The package-lock integrity values and package metadata were sourced from npm registry package-lock records and checked into the lockfile. CI must verify `npm ci`, the full audit, unit tests, lint, production build and Chromium suite on the exact resulting commit before this remediation is considered complete.

## Validation status

- Baseline audit: commit `9410ad4e55d1d40d98481b41518d07c540a37b03`, workflow run #42324087799.
- Remediation commits: `77589bfabb650fad76d484c9835f1cd5518c613c` (manifest) and `36866f38adf0f1b91c0a2df8a6fc51ac61011649` (lockfile).
- The post-remediation audit report on commit `cac6bae50e71e17c02746f7246799b67ea981c5f` returned zero vulnerabilities (0 critical, 0 high, 0 moderate, 0 low). That run was cancelled during the Chromium installation after the audit, unit tests, lint and production build had completed successfully; therefore it proves the audit result for the unchanged dependency tree, but not the complete suite on the final documentation/test head. Exact latest-head full CI remains pending.

No production deployment, Supabase change, database migration or provider action was performed.
