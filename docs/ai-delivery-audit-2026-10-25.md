# AI delivery: read-only check 25 October 2026

Source: production database, bounded read-only SQL in `scripts/auditAITipDelivery.ts`.
Checked 08:10 UTC (09:10 Europe/Prague). No provider calls, writes or messages.

- Latest daily-selection: 04:59 UTC, HEALTHY; AI COMPLETED, 15 newly captured
  predictions and two deferred fixtures. Earlier reason detail identified
  WAITING_PRIOR_DAY_RESULTS; rejected counts belong to the run, not the day's cohort.
- Today's projection: 22 forecasts, five ledger picks, updated 04:59 UTC.
  Its age exceeds the 90-minute presentation limit. Five stored picks do not mean
  five presently eligible offers: price freshness, kickoff and currentEligible
  still apply. Telegram fails closed on stale projections.
- Yesterday: 19 forecasts, six stored picks. STRATEGIES publication marked SENT
  at 08:56 UTC on October 24; its frozen payload contains six AI ledger picks.
  This is not proof that six AI tips were rendered or read: formatter selects
  up to three currently eligible items. No current-day publication was found in
  the last ten records at audit time; this does not prove a future scheduled failure.
- Production inference and opportunity creation have demonstrably run. Current
  UI/Telegram environment flags were not inspected; database history does not
  establish their present values or the user's PRO access.

Next: after deployment, run existing odds refresh then daily-selection; verify
fresh asOf and currentEligible. Check AI panel under Over with PRO and `/tipy ai`.
If disabled, verify AI_RESEARCH_UI_ENABLED and AI_RESEARCH_TELEGRAM_ENABLED in
production. Do not weaken freshness or selection gates to force a tip.

Severity: stale projection is a current distribution blocker; model execution
failure is not supported by these records. Do not claim profitable/validated AI.
