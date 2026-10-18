# Operational focus mode

`STRATEGY_FOCUS_MODE_ENABLED=false` preserves existing behavior. After deployment,
set it to `true` and redeploy to stop new BTTS, corners, cards, fouls and pressure
research captures. VALUE/ELO, main forecasts, 1X2 and both current/original Over
collections remain enabled. Original Over research is not distributed as a live tip.
Team-goal quarantine remains independent.

This is an operational pause, not a statistical rejection or validation. Existing
ledgers, financial losses, settlement and closing remain intact. New daily selection
entries and Telegram tips exclude paused sources; previously published outcomes
continue to be reported. Strategy pages retain history with a paused label.

No migration, new provider request, scheduled job or production credential change.
No historical records are deleted. Switch back to false to resume under existing
policies; never backdate missed observations.

Expected savings: fewer new ledger writes, no pressure inference/fallback, fewer
Telegram publication reads. Count diagnostics in the main forecast remain because
they have other consumers. Shared odds requests and historical settlement continue;
no measured API/compute reduction is claimed before provider usage is observed.

Acceptance after deployment: check both Over cohorts, 1X2, VALUE/ELO; verify paused
labels and Telegram absence of new paused tips; run existing settlement and confirm
old pending rows still settle. Compare actual Neon/Vercel usage without adding a cron.

Full Over/1X2 forecast replay remains a separate deliverable: the selected-tip ledger
is not a complete forecast cohort and cannot establish full-model calibration.
