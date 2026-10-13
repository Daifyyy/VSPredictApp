# Research Over closing collection

The legacy Over research strategy used to be excluded from the priority queue.
Qualified research rows may now enter P1 in the existing 90-minute pre-kickoff
window. Production candidates and locked ticket fixtures remain P0.

- No change to prediction, qualification, settlement or CLV formulas.
- No historical closing is reconstructed or fabricated.
- Research watch rows remain excluded.
- CRITICAL closing-only mode continues excluding legacy research.
- Existing 12-fixture priority cap, daily provider budgets, retry reservation,
  database lease and workflow frequency remain unchanged.
- A fixture shared by research and production is fetched only once.

This can consume previously unused capacity; it is not a claim of zero additional
provider requests. No new cron, runner, database table or historical export is
introduced. Monitor actual provider calls and closing coverage after deployment.
The change alone does not explain missing 1X2 closing samples and does not
guarantee 30-minute coverage with a best-effort scheduler.

Production build identity is available at
https://vs-predict-app.vercel.app/api/build.
