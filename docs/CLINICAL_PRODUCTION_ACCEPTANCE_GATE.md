# REFLINK v2.0 — clinical release acceptance gate

**Status: NO-GO for production.** Checked items have supporting evidence below. Open items still require verification. A successful frontend CI run is necessary but insufficient.

## 1. Referral creation and receiving-facility lifecycle

- [ ] PHC user creates a synthetic referral with validated patient age, urgency, destination and clinical reason.
- [ ] Receiving-facility user sees only referrals permitted by their facility and database RLS.
- [ ] Acknowledge `sent → acknowledged`; arrival `acknowledged → patient_arrived`; assessment `patient_arrived → under_assessment`.
- [ ] Repeating an action from two browser sessions cannot roll the referral backward or duplicate a clinical event.
- [ ] Attempted unauthorized updates are rejected by the **database**, including direct REST requests.
- [ ] Referral ID remains visible when an attachment fails after the referral has already been created.

## 2. Clinical documentation and counter-referral

- [ ] Receiving clinician records examination, final diagnosis, investigations, treatment, disposition and time stamps.
- [ ] Admitted patients have admission and discharge documentation, including follow-up plan.
- [x] Originating PHC can retrieve authorized receiving-facility feedback and discharge summary. Verified on the synthetic staging referral `RF-2026-117770`.
- [ ] Counter-referral acknowledgement and follow-up responsibilities are explicit and auditable.
- [ ] Simultaneous edits, stale tabs and interrupted saves do not silently discard clinical notes.
- [ ] Clinical lead approves the final forms and terminology using **synthetic** cases.

## 3. Mobile and low connectivity

- [ ] Test on 320px and 375px screens, keyboard-only, and screen readers.
- [ ] Offline warning is visible and no unsent referral is shown as successfully submitted.
- [ ] Any future offline patient-data storage is encrypted, access-controlled, time-limited, and reviewed for Nigerian data-protection compliance.
- [ ] Retry logic uses idempotency keys and explicit confirmation; no blind resubmission of uncertain writes.
- [ ] Printing and QR verification work in supported browsers without exposing patient details to unauthorized users.

## 4. Public-health intelligence

- [ ] Aggregates exclude `is_test=true` rows, do not disclose direct identifiers and report the authorization scope.
- [ ] Pagination is complete or an approved server-side aggregation endpoint is used.
- [ ] Suppress small cells in externally shared reports under an approved disclosure-control policy.
- [ ] Validate denominators, reporting periods, categories and duplicate-referral handling.
- [ ] District/state dashboards use an explicitly authorized reporting role, not a facility user's partial dataset.

## 5. Security, testing and release

- [ ] Frontend lint, build and unit tests pass on the final reviewed commit.
- [ ] Authenticated Supabase RLS tests cover PHC, receiving, admin, wrong-facility and revoked users.
- [ ] Verify private investigation attachment bucket, signed URLs, object access, retention and audit logs.
- [ ] Verify notification delivery, duplicate prevention, authorization and non-disclosure of clinical content.
- [ ] Back up production and verify a restore; reconcile the migration ledger.
- [ ] Run a synthetic staging end-to-end rehearsal with documented results.
- [ ] Clinical owner and authorized production operator explicitly approve the release.
- [ ] Only then merge/deploy using a rollback plan and monitor errors.

## Deployment protection

Keep PR #3 in draft and use its Vercel preview only for visual and synthetic-data checks. Confirm that preview environment variables do **not** expose or write to production clinical data. Do not create billable infrastructure, merge to `main`, or deploy production without explicit authorization.

## Staging evidence from 19 November 2026

The signed-in PHC view for synthetic referral RF-2026-117770 showed the hospital outcome “improved” and its sent time of 19 November at 8:53:07 PM. The contact attempt on 17 November at 6:08 PM and the completed encounter at 6:15 PM remained visible with their original timestamps. Times are as displayed in the staging browser. This verifies the originating PHC's access for this case. Database access checks for this case are recorded below.

On commit `a520707`, Chromium checked the two forms in isolation at 320, 390 and 768 pixels. Both forms rendered and fit within the viewport. Keyboard-only and screen-reader acceptance across the clinical workflow remains open. The frontend and synthetic database workflows passed. [Frontend run](https://github.com/Uthaiba/reflink/actions/runs/44616447050) · [Database run](https://github.com/Uthaiba/reflink/actions/runs/44616447119)

### Referral and final feedback access in synthetic staging

For RF-2026-117770, an originating PHC session could read the referral and final feedback. An authenticated user from an unrelated receiving facility could read zero matching rows from either table.

A rollback-only check created a temporary session for the synthetic referring user and reused its claims under the authenticated database role. Both records were visible while the account was active, hidden while banned, visible after restoration, and hidden after the temporary session was deleted. The transaction rolled back all fixture changes. These checks cover database reads. Browser sign-out and navigation evidence follows below.

### Browser sign-out and referral history

Chromium opened a synthetic PHC referral and signed out in a second tab. The first tab returned to sign-in and removed the referral identifier. Back navigation kept the identifier hidden both within the document and after navigating away. A separate test dispatched persisted page events and verified that the workspace was hidden before suspension and reloaded on restoration. Authentication responses were simulated. Actual browser cache retention depends on the browser.

Both workflows passed for commit `9aa3525`. [Frontend and browser checks](https://github.com/Uthaiba/reflink/actions/runs/44619287770) · [Synthetic database contracts](https://github.com/Uthaiba/reflink/actions/runs/44619287702)

### PHC follow-up with a screen reader

Chromium verified keyboard navigation from the referral list, reading hospital feedback in the accessibility tree, entering the encounter date and time with keystrokes, saving, and finding the saved entry in the history. [Keyboard and date-entry regression run](https://github.com/Uthaiba/reflink/actions/runs/44622901028)

Spoken output remains pending. In the staging preview, sign in as synthetic PHC staff and use Windows Narrator or NVDA with Chrome. Open RF-2026-117770 and navigate by heading to Final hospital feedback. Confirm the outcome is readable. Continue to PHC follow-up and record a contact attempt after discharge and before the current time. Use “Synthetic screen-reader check” for the outcome. Activate Save follow-up entry once and wait without moving focus. Record the screen reader, browser, and exact words heard. Pass the spoken save check only if the confirmation is announced automatically and the saved attempt can then be read in the history. If speech is silent, inspect the existing entry before retrying.

## Synthetic attachment download on Android — 21 November 2026

For SYNTHETIC-ATTACH-001, hosted staging contained one private object linked to the investigation. The referral and storage metadata both recorded 69 bytes. The mobile tester opened reflink-test.txt and supplied a screenshot showing the expected synthetic sentence and referral reference. The file viewer identifies the filename and visible text. It does not display the signed-in REFLINK account.

Separately, a rollback-only staging database check using temporary session claims found one visible attachment object for the assigned receiving facility and zero for the unrelated facility. Chromium compared the downloaded bytes against the original fixture using simulated storage responses in [the browser checks](https://github.com/Uthaiba/reflink/actions/runs/44895169467). Backup restoration and clinical approval remain separate release gates.

## Hosted escalation receipt and acknowledgement — 21 November 2026

Synthetic referral RF-TEST-F70C638C had one automatic escalation at 18:40:00 UTC and one staff receipt at 18:52:07 UTC. The receipt actor belonged to the assigned receiving facility. The referral acknowledgement was saved at 18:52:23 UTC, with one acknowledgement notification record. The receiving dashboard screenshot showed both earlier timestamps, Acknowledged status and the Mark Patient Arrived action. This completes the synthetic escalation-to-acknowledgement scenario.

## Hosted continuity milestones — 21 November 2026

For synthetic referral RF-TEST-F70C638C, the hospital sent final feedback at 19:13:46 UTC. The PHC screen confirmed a saved, performed encounter at 19:25 UTC. A read-only staging query found one hospital feedback record and one performed PHC encounter for this referral. This verifies the two milestones for this case. Monthly reporting on eligible referrals still requires separate reconciliation.

## Continuity report calculation check — 21 November 2026

Ran the deployed continuity RPC’s aggregation query against transaction-local fixture tables in synthetic staging and rolled back. Twelve eligible November discharges yielded seven distinct hospital feedback milestones and five performed PHC follow-ups. Duplicate events, attempted-only contact, test-flagged and synthetic-prefixed referrals, and a discharge at the next Lagos month boundary contributed no extra counts. With eight feedback and four follow-ups both cells were withheld (complementary four and primary four). With no events both returned visible zero. This covers the aggregation only. Authenticated dashboard, report draft, chart and CSV reconciliation on the same fixture remain open.

## Continuity report browser reconciliation — 22 November 2026

[Chromium CI](https://github.com/Uthaiba/reflink/actions/runs/44992358094) verified the chart, table, CSV download, on-screen draft and downloaded draft using the three staging calculation outputs as simulated RPC responses. Visible counts were 7 hospital feedback and 5 performed PHC follow-ups. Both withheld cells stayed undisclosed and both zero cells remained numeric zero. The browser used a simulated administrator. A hosted staging administrator session backed by the real reporting service remains open.

## Hosted administrator report — 22 November 2026

A signed-in administrator generated the November 2026 Africa/Lagos report on the protected synthetic staging preview at 06:42:55 UTC. The continuity chart and on-screen draft both showed zero hospital feedback and zero performed PHC follow-ups. Both the continuity CSV and the monthly draft finished downloading. The downloaded bytes were not inspected in this hosted run. The nonzero and suppressed fixtures are covered separately by the staging calculation and Chromium checks above.

## Review-branch release status — 22 November 2026

| Production checklist area | Verified evidence | Open before clinical production |
| --- | --- | --- |
| Database and recovery | Synthetic database contracts passed on the branded build. | Complete an isolated restore covering referral history, facility assignments, hosted authentication, private files and configuration. Rehearse migrations and rollback. |
| Staff access | Hosted administrator reporting and PHC feedback retrieval were observed. Database tests checked unrelated-facility and revoked-user access. | Complete the signed-in staging role matrix across PHC, receiving, administrator and unrelated-facility accounts. |
| Referral workflow | Chromium asserted exactly one timeline in both PHC and receiving referral details. Hosted escalation receipt, hospital feedback and PHC encounter evidence appear above. | Implement the receiving facility’s decline action and the referring PHC’s selection of the next facility. Verify the original referral, audit event and PHC notification in hosted staging. |
| Documents and offline use | Android opened the synthetic attachment. Chromium verified both official artwork files in the offline cache. | Verify interrupted attachment upload and offline retry through the hosted workflow, including duplicate checks. Obtain the approved retention period. |
| UI, UX and Public Health Intelligence | The hosted administrator generated the November report and downloaded both exports. Separate fixtures covered nonzero, zero and withheld counts. The approved logo is used on authentication screens, with its symbol in compact headers, print and app icons. | Complete phone and keyboard checks across the main screens and record spoken screen-reader results. |
| Release and sign-off | Frontend and database CI passed on application commit `3fb371c`. | Formally designate monitoring, recovery and rollback owners. Record clinical and deployment approvals, then deploy and verify the live release. |

[Frontend and Chromium evidence](https://github.com/Uthaiba/reflink/actions/runs/44995423050) · [Synthetic database evidence](https://github.com/Uthaiba/reflink/actions/runs/44995423064)

## Receiving-facility decline — 22 November 2026

Review of the receiving screen and the hosted synthetic staging schema found no referral decline action. The referral status constraint permits cancellation and onward referral. Neither establishes that a receiving clinician declined a referral. The rejection handling located in the closed-record addenda function applies to amendment requests. The end-to-end referral decline check remains blocked on workflow definition and implementation.

## Public Health Intelligence keyboard check at 375 pixels

Chromium rendered the report component at 375 × 812 with a simulated administrator. Keyboard input selected the reporting month, generated the report, selected the continuity dataset and downloaded a CSV containing the expected hospital feedback count. The report fit the viewport without horizontal page scrolling. This check covers this report component. Physical phone and spoken screen-reader testing remain open. [Browser run](https://github.com/Uthaiba/reflink/actions/runs/45036898534)

## Interrupted investigation attachment confirmation — 25 November 2026

The automated storage fixture committed an upload and then threw a connection error. While verification was offline, the upload remained unconfirmed. After reconnection the same file resolved to one stored object. A same-size object with different bytes failed verification. This covers the upload helper. The hosted check must also confirm that one referral attachment reference survives a reload and that the downloaded contents match the original. [Frontend regression run](https://github.com/Uthaiba/reflink/actions/runs/45037454079)

## Hosted staging migration reconciliation — 25 November 2026

Compared five release files at `f99dffd` with the SQL statements recorded in the synthetic staging migration ledger. Each pair matched after trimming leading and trailing whitespace. The ledger assigns different version identifiers. Account for these mappings during release rehearsal to avoid replaying already applied SQL. This comparison covers recorded statements only. Restore, rollback and production schema verification remain open.

| Migration | Repository version | Synthetic staging version |
| --- | --- | --- |
| `phc_follow_up` | `20261118130000` | `20261118133615` |
| `continuity_milestones` | `20261118160000` | `20261118154130` |
| `final_feedback` | `20261118210000` | `20261118214619` |
| `receiving_escalation_timestamp` | `20261121190000` | `20261121184226` |
| `receiving_escalation_receipt` | `20261121192000` | `20261121184534` |

## Hospital decline and rerouting ownership — 25 November 2026

The project lead selected the referring PHC to choose the next facility after a receiving hospital declines a synthetic staging referral. Preserve the original referral and decline history. The staging acceptance scenario must show the receiving clinician recording the decline, the PHC receiving the notification and selecting the next facility, and an audit history that connects the two steps. Implementation and authenticated staging verification remain open.

## Release decision — 25 November 2026

The founder authorized deployment. The review build at `eb83d13` is available for synthetic demonstrations. The [database rehearsal](https://github.com/Uthaiba/reflink/actions/runs/45606885403) passed the pre-release dump, restore and migration replay in disposable PostgreSQL. Hosted Auth, private object contents and deployment configuration still require an isolated recovery exercise. The clinical review and retention decision remain outstanding alongside the hosted workflow checks above. Clinical production promotion remains pending.

## Offline submission retest — 27 November 2026

The project lead reported a successful retest. Device, steps and final referral count were unspecified. The hosted staging ledger records `accept_standard_offline_referral_uuid` as `20261127183820`. Its SQL matches repository migration `20261127184000` after trimming surrounding whitespace. The active check accepts the standard UUID format and the previously accepted legacy format.

In hosted synthetic staging, a temporary table copied the referral table's checks and indexes. Two synthetic insert attempts with the same standard retry key left one row. The [isolated database test](https://github.com/Uthaiba/reflink/actions/runs/46050856649) also exercised two concurrent clients after restore. End-to-end verification of a queued referral through browser restart, reconnect and receipt at the receiving facility remains open.
