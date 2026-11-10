# Secret Scanner Triage — 7 November 2026

## Current GitGuardian result

The latest pull-request scan reports two **Generic Password** findings in historical test commits:

| Finding | Historical commit | File | Original value | Assessment |
|---|---|---|---|---|
| 39734474 | `acaec3fbee5adb414afb1d10257a59f7af29490d` | `tests/offlineQueueVaultStorage.test.js` | `must-not-be-stored` | Synthetic test marker passed as a dummy `passphrase` property to verify that an envelope validator does not persist plaintext credentials. |
| 39736180 | `a9849992ab8a85e7e284d7a81162b5ce5608dfa5` | `tests/offlineVaultLockChannel.test.js` | `must-not-be-used` | Synthetic test marker passed as a dummy `passphrase` property in a BroadcastChannel message to verify that the lock handler ignores unrelated fields. |

These values are explanatory test strings, not production credentials, API keys, passwords used for authentication, or provider secrets. No corresponding secret rotation is indicated by the source context. The findings are still scanner incidents and should be explicitly reviewed/dismissed as false positives by an authorized repository/security owner.

## Source remediation

The current branch no longer contains those password-like strings:
- The vault storage test uses `TEST_SENTINEL_VALUE`.
- The lock-channel test uses `TEST_SENTINEL_VALUE`.
- Browser vault tests use repeated-character synthetic passphrases (for example, `"p".repeat(32)`) rather than credential-like prose.

The findings remain attached to historical commits in the PR's 250-commit scan window. Editing the current files does not erase historical occurrences. A history rewrite could remove the strings but would rewrite a large branch history and risk disrupting the open PR; no history rewrite was performed or authorized.

## Required owner action

1. Review the two incidents in the GitGuardian dashboard and confirm the values are non-credential test fixtures.
2. Mark the incidents as false positives / accepted test fixtures through the authorized dashboard workflow, if the scanner policy permits.
3. If policy requires removal from all Git history, agree on a controlled branch-history rewrite and coordinate contributor clones before doing so.

Do not add broad scanner exclusions or disable secret detection. No real credentials were found in these two specific snippets, and no production secret rotation or deployment action was performed.
