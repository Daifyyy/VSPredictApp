# Complete opening 1X2 capture

Apply migration `20261018180000_opening_forecast_audit` BEFORE deploying generated
Prisma readers (even with the feature disabled). It adds one nullable JSONB column
to MarketSignalSnapshot, without backfill, indexes or new tables. No production
migration has been applied by this implementation.

After deploying, enable `OPENING_FORECAST_AUDIT_ENABLED=true` and redeploy. New
1X2 opening rows contain the first observed model vector, complete allowed-book
quotes, normalized market vector, fixture/team identity, versions and timestamps.
Existing unique fixture/market/policy records keep their existing content, including
null: never populate an older opening with a newer forecast. Database upsert uses
an empty update, so concurrent captures preserve whichever creation wins.

This covers ALL existing eligible opening signals, not just qualified bets, but
not fixtures lacking complete odds. Missing/invalid model timestamp, live/finished
status or post-kickoff capture means no new audit. The provider update time remains
unknown: capturedAt means collector observation, not certified price freshness.

Benchmark method NORMALIZED_PANEL_LOGIT_MEDIAN_1X2_V1 uses complete unique books
from the existing fixed CLV panel, de-vigs each complete book, takes sidewise logit
medians and normalizes the three results. Two books: PANEL; Pinnacle alone:
PINNACLE_SINGLE; another book alone: UNAVAILABLE with null benchmark. Raw quotes
remain available for audit. This full-vector normalization is not scalar CLV v2;
existing CLV, qualification and ranking are unchanged. Do not merge methodology
cohorts without explicit comparison.

Maximum five small book triplets, no additional provider call, DB query or cron.
No full source response stored. The field is only added to the existing create
payload; normal history/detail readers should continue using explicit projections.
Disable the flag to stop new audits; retain column and history for generated-client
compatibility. No deletion or historical probability reconstruction is necessary.

After deployment check a NEW opening row: identities, capturedAt before kickoff,
predictedAt no later than capturedAt, model and market sums one, source books and
version. Replay the odds job and verify byte-identical stored audit. Check an old
row stays null. Confirm actual daily DB/storage impact; do not claim measured
savings. This metadata does not yet activate any calibrated challenger or prove edge.
