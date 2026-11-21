# Aggregate reporting and offline shell continuation

The existing application now includes selectable count charts for each authorized R-PHI aggregate dataset, including LGA labels and facility/pathway comparisons. Tables remain available, withheld cells have no bars, and small or malformed counts are never displayed as valid values. Charts do not infer geography coordinates, population rates, trends across different months or service availability.

Monthly report drafts contain deterministic statements with RPC, row and field references. They preserve suppression and carry explicit human-review, coverage and interpretation limits. They are not AI-generated reports, diagnoses, outbreak confirmation or an approved external publication. The existing reporting authorization and aggregate-only service remain in force.

## Optional offline shell

`VITE_PWA_ENABLED=true` opts into a build-versioned static app-shell worker. It is disabled by default. The generated inventory contains the public Vite document, manifest, REFLINK icon and hashed JavaScript/CSS bundles only. Cross-origin requests, API paths, requests with authorization headers, queries and mutations are not intercepted or cached. Root navigation can fall back to the static shell after prior installation; no other navigation fallback is provided.

The worker does not cache patient responses, attachments, tokens, login responses or clinical form contents. It does not provide offline authentication or automatic synchronization. Existing encrypted device drafts remain a separate opt-in capability. Clinical submission still requires connectivity, authorization, duplicate prevention and confirmation. The global connection notice makes that boundary visible throughout the application.

Updates do not call skipWaiting, claim clients or reload an active clinical editor. A new worker activates through the normal browser lifecycle. Disabling the flag unregisters only REFLINK's worker and removes its named static caches on a subsequent online application load. It does not remove clinical drafts or unrelated application storage. The manifest uses an SVG icon; installation support varies by browser and platform.

Administrator, AnalysisHub and analytics code now load as separate chunks. The optional worker precaches those static chunks for a coherent offline shell; without the flag, they load on demand. The main bundle still exceeds Vite's 500 kB warning threshold and needs further modularization; no performance certification is claimed.

## Verification boundary

The local unit suite has 112 passing tests. It covers chart/draft suppression, source references, empty values, worker configuration and cache/interception boundaries alongside the existing clinical tests. Local build and lint were run; pre-existing lint warnings remain.

`npm run test:browser` builds with explicitly synthetic configuration, aborts non-local browser requests, then checks static offline reload, cached-path allowlisting and chart keyboard/suppression/layout behavior at 320, 375 and 1280 px. It does not sign in or use hosted accounts. Local Chromium launch is blocked by this execution environment's socket permissions; the dedicated CI browser job is the browser execution gate. Verified code source `cd448080f82b23bb4be7af2aad59f8c9220b8caa`: frontend quality gate #108 passed both the 112-test/lint/build job and the real Chromium synthetic browser job. Its logs confirm `browser_offline_static_shell_and_cache_boundary` and `browser_aggregate_chart_keyboard_suppression_and_responsive_layout` passed. PostgreSQL contracts #34 and GitGuardian passed on the same source. The initial browser attempt failed at dependency installation on ubuntu-latest; the dedicated job is now pinned to supported Ubuntu 24.04.

No hosted database, production deployment, production environment variable or account has been changed. Full clinical E2E, screen-reader/contrast assessment, cross-report disclosure review, migration-baseline reconstruction, corrections, reconciliation, full sync/interoperability, AI integration and restore/release approval remain open.
