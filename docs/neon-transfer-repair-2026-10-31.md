# Oprava přenosů Neonu — 31. 10. 2026

Lokální implementace bez připojení k pozastavené produkční databázi.
Tento balík není důkazem, že celý provoz již splní 4 GB měsíčně.

## Změny

- Dokončení existujících lokálních změn cache: assemble čte pouze potřebné
  fixture; soupeřova projekce obsahuje pouze používané střelecké metriky.
- cachedJson při upsertu nevrací celý právě uložený payload.
- Denní výběr načítá kurzové podklady pouze pro fixture zdrojových kandidátů.
  MarketSignalSnapshot vrací pouze používané skaláry, ne auditní JSON/time series.
- Místo celého inputSnapshot se pro relevantní signály jedním parametrizovaným
  SQL načte capturedAt, obě týmové identity a případně poddokument tlakového
  modelu. Při vypnutém v5 se tlakový poddokument nepřenáší.
- Žádné relevantní signály znamenají žádný auditní SQL dotaz; žádní kandidáti
  znamenají žádné čtení nabídky z FixturePrediction v tomto adaptéru.
- Prázdný program VALUE/ELO nespouští historické/pedigree dotazy.
- AI opportunity/settlement nečte inputAudit. AI denní upsert vrací jen klíč.

## Kapacitní dopad a omezení

Nevzniká externí API volání, další služba, nová cache ani migrační tabulka.
Denní adaptér může mít jeden dávkový SQL dotaz navíc pro malé auditní projekce;
počet dotazů neroste s počtem zápasů. Jde o lookup podle fixture ID, nikoli
historickou agregaci. Méně přenesených dat by mělo snížit deserializaci Vercelu.
Skutečný query plan, čas a účtovanou spotřebu je nutné změřit po obnově DB.
Roční historie VALUE/ELO a sezónní AI historie zatím nejsou inkrementální;
nejde o kompletní odstranění všech opakovaných historických čtení.

## Nasazení

Žádná migrace. Zahrnout také již rozpracované cache.ts, cache.test.ts a
realRepository.ts; nesouvisející lokální experimenty do tohoto balíku nepatří.
Nemění se kvalifikace, model, ceny, settlement, CLV ani historie publikací.
GitHub pauza a produkční env nebyly v tomto kroku měněny.
Neobnovovat plošně všechny crony jen proto, že začne nové období: nejprve
ověřit jednotlivý predikční a kurzový běh, DB projekce a odečet přenosu.
Neprohlašovat kapacitní problém za vyřešený bez odečtů poskytovatele.

## Lokální ověření

233 testovacích souborů / 1844 testů prošlo; typecheck prošel.
Lint bez chyb, jedno existující varování v nesouvisejícím
scripts/reportStrategyPerformance.mjs. Testy ověřují vynechání prázdných
dotazů, omezení fixture, SQL parametrizaci, projekci polí a chybějící hodnoty.
Nový SQL dotaz zatím nebyl spuštěn nad produkcí: Neon je pozastavený.
