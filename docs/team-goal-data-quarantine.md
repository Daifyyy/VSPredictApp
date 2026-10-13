# Team-goal quote quarantine (2026-10-13)

The strategy audit found inverted same-book, same-time Over ladders. The former
parser could merge full-time and partial-period market names. Historical profit
is therefore descriptive, not evidence of a tradable edge.

## Safety boundary

- Strict full-time name allowlist; exactly one provider market per team.
- Reject conflicting duplicate prices and inverted Over/Under ladders.
- Preserve provider market ID/name/period with newly parsed books.
- Quarantine all team-price readers, including cached legacy books and v5 team
  opportunities. Do not synthesize missing closing probabilities.
- Exclude affected rows from validation and Daily Selection evidence.
- Strategy Hub and Telegram show the block; Model Lab preserves historical
  outcomes with a data warning and prevents validation of the team strategy.
- No database migration, history rewrite, extra provider calls or cron required.

## Reopening

Verify provider identities against actual full-time quotes, including both sides
and nested lines, before removing quarantine. Start a new policy cohort; never
retroactively promote legacy quotes. Existing forecasts and settlement history
remain immutable. Rebuild existing monitoring summaries after deployment.

## Validation priorities

Ordinary 1X2 and original Over research deserve continued prospective observation,
not automatic promotion. Their existing filters remain unchanged. Separate model,
policy and context; report sample size, ROI uncertainty, price CLV coverage and
same-row market calibration. High hit rate alone is not evidence of profitability.
Research v5 remains research. This patch does not repair or relabel historical
post-kickoff ticket captures; those must stay outside clean pre-match comparisons.

No production data were changed by this repair. Deployment and provider
verification are separate operational steps.
