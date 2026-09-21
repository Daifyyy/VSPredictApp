# Denní výběr — provozní a metodický kontrakt v1

## Nasazení

Migrace `20260921160000_daily_selection` byla 21. 9. 2026 nasazena do připojeného
Neonu. Přidává pouze DailySelectionDay, DailySelectionItem a DailySelectionEvent.
Staré tipy ani jejich bilance se nepřepisují; nový selektor nemá zpětnou bilanci.

Všechny přepínače jsou implicitně vypnuté:

```env
DAILY_SELECTION_COLLECT_ENABLED=false
DAILY_SELECTION_UI_ENABLED=false
DAILY_SELECTION_TELEGRAM_ENABLED=false
```

1. Po deployi ověřit autorizovaný GET /api/cron/daily-selection?dryRun=1 nebo lokální skript.
2. Zapnout COLLECT a UI, redeploy; spustit workflow daily-selection.
3. Zkontrolovat /denni-vyber, uložené ceny, časy, zdroje a prázdné stavy.
4. Teprve potom zapnout TELEGRAM a ověřit /vyber.

Tento commit nemění proměnné Vercelu ani neposílá skutečné zprávy. Navigace obsahuje
odkaz; při vypnutém UI stránka ukazuje pouze informaci o přípravě. Čtecí API je
vypnuté. Po zapnutí anonym dostane jen počty a bilance; detail chrání serverový PRO gate.

## Pravidla a důkazy

Nejvýše 5 publikací za pražský den, jedna na fixture, dvě na ligu. Přímý kurz
1,50–3,00, stáří nejvýše 90 minut, výkop nejméně za 30 minut. Žádné minimum.
Publikované položky se nevyměňují; stažení nezruší obsazené místo ani pozdější prohru.

Zdroje: autonomní ledger, kvalifikované týmové góly, povolený Průběh v5,
kvalifikované jednotlivé přímé nohy VALUE/ELO včetně rezerv. Kombinovaná noha není
celý akumulátor. Cena a čas pocházejí z oddsCurrentBooks/oddsCurrentAt; starým
oddsBooks nelze přiřadit čerstvý čas. Každý zdroj znovu splní vlastní cenové brány.
ELO nemá přidaný EV filtr. Incidenty, neplatná identita a blokovaná verze brání vstupu.
Sběr nevolá poskytovatele ani modelovou inferenci.

Pořadí: důkazová úroveň, síla důkazů, úplnost dat, tržní pásmo po 5 p. b.,
srovnatelný model, čerstvost, výkop, stabilní ID. Smíšené modelové rodiny v tie-break
skupině neporovnáváme nesouměřitelně. Duplicita zachová všechny způsobilé source IDs.

Po auditu je přidána konzervativní pojistka: samotný počet výsledků nezvýhodní
ztrátový nebo hůře kalibrovaný zdroj. Priorita za vzorek vyžaduje n≥50, ≥10 herních
dnů, kladný ROI a log-loss i Brier nejvýše jako opening trh na stejných řádcích.
To není optimalizace ROI ani důkaz, že pořadí je nejlepší. Pozdější změna pravidel
vyžaduje novou policy verzi.

Numerické brány používají modelLabSummary: přesná kohorta a verze, CLV v2,
200 výsledků, coverage, blokový interval, kalibrace, holdout, segmenty a herní dny.
Model a trh mají stejné jmenovatele; celý holdoutový den zůstává na jedné straně.
Chybějící metrika není splněná brána. Research je vždy neověřený.

Historické kombinované nohy bez přesného kontextu a odmaržovatelného trhu nemají
přenositelné důkazy. ROI celého tiketu se nikdy nepřebírá. Chybějící kombinovaný
benchmark je označen; taková noha se řadí až za srovnatelný benchmark.

Ruční schválení přesné kohorty se ukládá do
ModelStrategyDefinition.decisionCriteria.dailySelectionApprovals a do
ModelStrategyStatusAudit. Skript odmítne research i nesplněné numerické brány:

```powershell
node --env-file=.env --import ./scripts/registerServerOnly.mjs --import tsx scripts/approveDailySelectionSource.ts '<exact cohort JSON>' '<reviewer>'
```

Žádný zdroj nebyl při implementaci schválen. Selektor je sám neověřený; zdrojová
výkonnost není jeho výkonností. Kontrolní body: 50/100/200 uzavřených singlů.

## Úlohy a výkon

GET /api/cron/daily-selection vyžaduje existující CRON_SECRET. GitHub Actions volá
ranní UTC sloty 07:00 a 08:00; místní čas se kontroluje uvnitř. Pozdní sestavení
uchová skutečný čas, ne předstíraných 09:00. Idempotence platí i při změně DST.

Po dokončení plného kurzového sběru, predikcí a telegram-digest následuje samostatná
invokace. Priority CLV průchody neměníme. Po settle-results se volá ?settle=1.
Přímé ruční volání původního HTTP endpointu mimo workflow následnou úlohu nespouští;
v tom případě zavolejte i daily-selection.

Lease brání současnému přepočtu; pg_advisory_xact_lock chrání denní zápis.
SQL CHECK rank 1–5 a unikátní day/rank + day/fixture tvoří další pojistky.
Transakce zapisuje položku i událost; expirovatelná cache lease není obchodní historie.

Evidence se dávkově přepočítá po settlementu, cache má 36 hodin. Autonomní
a kvalifikované research signály mají oddělené přesné verze a kontexty. Bilance
je předpočítaná podle policy, úrovně a zdroje. Čtecí cesta čte jeden den, nejvýše
pět položek a jeden souhrn; neprovádí historické bootstrapy ani inference.
Porucha nové úlohy založí incident a nesmí shodit původní sběr.

## Vyhodnocení a Telegram

Settlement používá konečné skóre a MatchStatCache pro rohy/karty/fauly,
sdílený binaryOutcome a přesnou kombinaci. Chybějící statistika není nula.
Odložený zápas čeká, zrušený se vrací. Nejasný push kombinace je nevyhodnotitelný.
Opožděné statistiky doplní další běh. Profit vychází z původní ceny i po stažení.

CLV je vlastní takenOdds × closingFairProbability − 1, sdílená metodika v2,
stejná strana/linie, primary 30 / fallback 75 minut, žádný post-kickoff closing.
Při změně výkopu se původní closing nepoužije. U kombinací bez protistrany CLV chybí;
neodvozuje se násobením pravděpodobností ani kopírováním CLV staršího tipu.

Telegram čte stejné publikované položky. Zpětně kompatibilní klíč date/channel/kind
má nové prefixy DAILY_SELECTION a DAILY_RESULTS s revizí a částí zprávy.
Každá část eviduje přesně obsažená item IDs; výsledky zahrnou jen potvrzeně
odeslané položky. Výsledková série je neměnná. Timeout nebo přerušené odesílání
vede na UNKNOWN a incident, bez slepého opakování. /vyber [YYYY-MM-DD] používá
stávající autorizaci soukromého chatu a nepublikuje nové tipy.
Původní strategické a ticketové zprávy zůstávají.

## Kontrola a omezení interpretace

```powershell
node --env-file=.env --import tsx scripts/auditDailySelectionSources.ts
node --env-file=.env --import ./scripts/registerServerOnly.mjs --import tsx scripts/dryRunDailySelection.ts
node --env-file=.env --import tsx scripts/verifyDailySelectionDatabase.ts
npm test
npm run typecheck
npm run lint
npm run build
```

Dry-run je read-only napříč všemi zdroji. Nenahrazuje retrospektivní backtest
selektoru: historické okamžiky cen a rekvalifikace nelze domýšlet.
Audit 21. 9. 2026 vyloučil z důkazů fixture 1552735 kvůli změně identity, nikoli
ze staré publikační bilance. Žádná prověřená kohorta zatím nesplnila všechny brány.

Automatické testy pokrývají hranice, pořadí, prázdný výběr, API oprávnění,
serverovou redakci, restart, transakční pořadí, settlement, DST a nejasné doručení.
Integrační kontrola v Neonu ověřila serializaci souběžných advisory locks,
zápis všech tří entit a povinný rollback bez zanechání testovacích dat; SQL
constraints pro sloty a ceny byly ověřeny také. Nejde o dlouhodobý zátěžový test.
První skutečné doručení a mobilní vizuální kontrolu
proveďte po zapnutí v privátním kanálu. Starší lokální audity nejsou nasazovací pokyny.
