# Prediction-focused application: context and operations

## Scope

Transfers are retired: `/transfers` redirects to Program; the old transfer read,
refresh and CSV-import endpoints return 410 without database/provider access.
Stored history remains intact. Shared CSV parsing used by odds imports remains.
No schema migration is required.

Fixture detail `/zapas/[fixtureId]` offers a lazy PRO-only context panel:
last ten available competitive matches, venue averages, metric-specific sample
sizes, five results, recorded rest interval, historical formations, observed
coach continuity, model snapshot and referee factor. This is descriptive context,
not the exact weighted training matrix. Formations/coach do not change selections.
Coach observations do not establish employment tenure. Missing values are not zero.

The prediction job builds the compact context from already loaded team profiles.
Only results more than three hours before capture are eligible, and tactical data
must have been observed by capture. The first saved context is retained by later
prediction runs. Historical finished fixtures are not reconstructed. A moved
kickoff or mismatched identity makes the reader reject the old context.

The context API selects only the relevant JSON subdocument for one fixture. It
does not read team history, infer predictions or call API-Football. Authorization
precedes its data query; private responses are not shared-cacheable. The additional
cost is a bounded snapshot in the existing JSON and one read on explicit expansion.
No export, training or data movement to a different service is introduced.

Historical tactics refresh remains daily but only for teams in at most 50 saved
upcoming fixtures within 72 hours. It looks back at most 90 days and processes at
most 30 missing fixtures. No upcoming program means no history/provider request.
Personnel shadow and player-profile collection are NOT reactivated.

## Actions to keep

Keep both repository workflow files:

- `ci.yml` / **Quality gates**: push/PR checks, not a recurring data collector.
- `cron.yml` / **Cron**: the shared scheduler; deleting it stops predictions,
  closing capture, settlement and Telegram together.

Keep scheduled `warm`, `refresh-league-styles`, `refresh-elo`,
`predict-upcoming`, `snapshot-odds`, `snapshot-odds-priority`,
`settle-results`, `settle-tips`, `daily-selection`, `telegram-digest`,
`calibrate-models`, `audit-pipeline`, `refresh-referees`, `refresh-tactics`.
`send-notifications` remains for existing favorite-fixture Web Push reminders;
it is not live data collection (96 planned slots/day).
`personnel-shadow` and `player-profiles` remain manual-only; do not run them for
normal prediction operation. No new scheduled task was added.

Removed scheduler entries: live collection/schedule refresh (previous commit),
and transfer refresh (this change). No separate legacy workflow files exist in
the checked repository. Old run logs may remain; deleting logs does not disable
future runs and does not reduce provider/DB consumption.

After deploy: run `refresh-tactics` if desired, then `predict-upcoming` to capture
context for upcoming fixtures. Do not trigger historical replays or transfer imports.
Existing resource guards still apply. Do not enable paused experiments to fill gaps.

## Reproducible savings, not estimated billing claims

Run `node scripts/reportCronScheduleSavings.mjs` locally; it reads git history and
the current workflow only, without provider or Neon access.

| Scheduled UTC-day slots | Count |
| --- | ---: |
| Before prediction-focused refactor (`e732368`) | 366 |
| Previous live-removal commit (`6b62fd9`) | 222 |
| Current workflow | 221 |

Total reduction: `(366 - 221) / 366 = 39.6175%`.
Incremental transfer removal: `(222 - 221) / 222 = 0.4505%`.
The removed features' scheduled collectors have no remaining slots.

These are trigger slots, NOT actual executions, API calls, runner minutes or Neon
bytes. Jobs may skip, retry or call many batched endpoints. Previous live preflight
may already have skipped calls. Thus actual total provider and Neon savings are
unknown until comparable before/after provider readings are collected. In
particular, do not report a 39.6% Neon saving. Measure equivalent days (including
weekends), fixture counts, provider attempts and provider-reported transfer.
