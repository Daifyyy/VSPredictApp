import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
const source=readFileSync('lib/data/predictions.ts','utf8');
const workflow=readFileSync('.github/workflows/cron.yml','utf8');
it('retains historical CLV logic but blocks new collection before reads',()=>{
 expect(source).toContain('ODDS_CLOSING_HOURS = 3');
 expect(source).toContain('if (MODEL_ONLY_MODE) throw new Error("ODDS_COLLECTION_RETIRED")');
 expect(source).toContain('await saveCurrentOddsBooks(item.fixtureId, odds.books, now)');
});
it('does not register old odds or priority collection',()=>{
 expect(workflow).not.toContain('path="snapshot-odds"');
 expect(workflow).not.toContain('path="snapshot-odds-priority"');
 expect(workflow).not.toMatch(/- cron: "(20 \*|5,35,50)/);
});
