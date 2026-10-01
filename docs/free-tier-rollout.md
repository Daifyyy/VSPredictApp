# Bezplatný provoz: postupné nasazení

## Stav balíku (1. 10. 2026)

Tento balík obsahuje **bezpečnostní a čtecí etapu, inkrementální v5 a volitelný live preflight**, ne potvrzení celého cíle 4 GB/měsíc.
Nezměnil tarif, produkční proměnné, celkovou plánovanou frekvenci GitHub workflow ani poskytovatele.
Nevyžaduje migraci. Predikce, settlementy, ceny, kvalifikační pravidla a historické CLV se nemažou ani nepřepisují.

Implementováno:

- Omezená sdílená procesní cache: 100 položek, 16 MiB rozpočtu serializované velikosti,
  250 kB na položku, TTL, LRU, sloučení souběžných obnov a ochrana před oživením invalidované položky.
  Jde o rozpočet serializovaných dat, nikoli měření celého V8 heapu. Paměť procesu se musí ověřit v provozu.
- Explicitní projekce historického Model Lab ledgeru bez velkých JSON a časových řad.
- SQL projekce v5 pouze pro vyhodnocované pravděpodobnosti, bez přenosu celého vstupního snapshotu.
- Provozní stránka a administrativní GET pouze čtou uložený audit; chybějící audit není nulová bilance.
  Nový audit vytváří existující cron nebo administrativní POST.
- `/provoz/kapacita` a admin API `/api/operations/resources`: skutečné ruční odečty,
  jednotky, období, stáří a zdroj. Denní historie odečtů má 90denní retenci.
  Úklid maže výhradně klíče `resource-budget-history:v1:`, nikoli ostatní expirovaná data.
- Rozpočtové ochrany cronů, ručních provozních úloh, Denního výběru a ranních Telegram publikací.
  Odepřená úloha vrací HTTP 200 se `status: RESOURCE_LIMITED`, aby nevznikala retry smyčka.
- CRITICAL: nepovoluje nové publikace; prioritní closing má nejvýše tři již kvalifikované
  fixture / zamčené ticketové nohy, bez watch kandidátů, nových tipů, tiketů a research snapshotů.
  STOP zastavuje všechny chráněné úlohy. Nejde o záruku zastavení veškerého provozu HTTP aplikace.
- SAVING / UNKNOWN: vypnutý automatický live, push a personální/taktický výzkum;
  nový tlakový shadow výpočet se přeskočí, hlavní predikce pokračuje.
- Volitelné čtení oddělených souhrnů strategií: denní ledger se filtruje datumem, historická bilance
  se čte z malého uloženého souhrnu. Chybějící souhrn vyvolá explicitní nedostupnost, nikoli přepočet historie.
  Zastaralý souhrn má `asOf`, `stale`, `limitedReason` a viditelné upozornění.
- `.vercelignore` vylučuje lokální datové cache, auditní výstupy a testovací reporty.

## Přepínače ve Vercelu

| Proměnná | Výchozí chování | Aktivace |
| --- | --- | --- |
| `RESOURCE_BUDGET_ENFORCEMENT_ENABLED` | Vypnuto, pokud není `true` | Po zadání odečtů a smoke testu; neznámé údaje přepnou do UNKNOWN |
| `RESOURCE_BUDGET_FORCE_STOP` | Vypnuto | `true` okamžitě blokuje chráněné úlohy před dotazem na rozpočet |
| `RESOURCE_SAVING_READS_ENABLED` | Vypnuto | Až po přípravě a porovnání souhrnů a ověření rezervy auditního cronu |
| `PRESSURE_PERFORMANCE_INCREMENTAL_ENABLED` | Vypnuto | Po ověření rezervy a přípravě počátečních příspěvků v5 |
| `RESOURCE_PREDICTION_REUSE_ENABLED` | Vypnuto | Po porovnání doby a paměti predikčního cronu; sdílí týmové podklady pouze v jedné soutěži jednoho běhu |

## Sedmá etapa: opakované týmové podklady v predikčním cronu

- Volitelně se znovu použije již sestavený tým při dalších fixture téže soutěže v témže běhu.
  Identita obsahuje tým, název a logo; soutěž, režim a běh mají samostatný scope.
  Mezi soutěžemi ani následujícími běhy se podklady nepřenášejí.
- Používá stejný rozpočet procesní cache (100 položek / 16 MiB serializovaných dat / 250 kB položka),
  nikoli další stejně velkou cache. Registr má nejvýše 32 klíčů, TTL 60 s a úklid v `finally`.
  Velké položky se neuchovávají. Null a chyby se při příští potřebě načtou znovu.
- Vstupy se při zapnutém sdílení klonují, aby změna jedním konzumentem neovlivnila další zápas.
  Cena serializace a klonování je nový lokální CPU/paměťový náklad; rozpočet není měřením celého heapu.
- Žádný prefetch všech týmů, žádná nová úloha, tabulka, provider request ani zvýšení souběžnosti.
  Před dalším fixture se znovu ověří časový rozpočet i tehdy, když předchozí neměl podklady/predikci.
  Již běžící loader se násilně nepřerušuje; toto není tvrdý timeout celého cronu.
- `CronRun.details.teamProfiles` obsahuje `enabled`, `requests`, `loads`, `reused`, `loadMs`.
  `loadMs` je součet dob loaderů (souběžné se překrývají), nikoli celkový čas cronu.
  Ukládá se v existujícím souhrnném zápisu, ne samostatným zápisem u každého dotazu.

Kapacitní dopad: Neon může ušetřit opakované čtení stejných podkladů; skutečný počet DB dotazů
a účtovaný přenos tímto čítačem neměříme. Vercel má náklad klonování/serializace a dočasných profilů,
ale sdílený cache rozpočet se nezvyšuje. GitHub a API-Football nedostávají novou práci.
Přepínač zůstává výchozí `false`, dokud měření nepotvrdí rezervu a přínos.

Lokální test 50 syntetických fixture / 20 týmů: 100 požadavků, 20 sestavení, 80 opětovných použití;
nejvýše dva souběžné loadery. Jde o test mechanismu, ne procentní úsporu produkčního přenosu.
Regresní test porovnává úplný výstup `compareTeams` nad totožnými podklady s cache i bez ní.
Tato etapa neodstraňuje všechny fixture-specifické dotazy (H2H, rozhodčí, benchmark, zápisy)
ani neimplementuje přeskakování nezměněných predikcí bez spolehlivého fingerprintu vstupů.

## Obecná pravidla aktivace

Po změně proměnných je nutný redeploy. Přepínač není automaticky změněn zápisem odečtu.
Ochrany neopravují nesprávně opsaný limit: musí jít o skutečný **bezplatný** limit odpovídající službě,
jednotce a období, nikoli navýšený placený limit. Nulový/nezjištěný limit nenahrazovat velkým číslem.
`NORMAL` vyžaduje všechna katalogová měření a skutečné odečty nejvýše 48 hodin staré.
`ESTIMATE` nestačí. Neznámá kapacita znamená UNKNOWN; dosažený kritický práh má přednost i u staršího odečtu.
Momentální minutový limit API nelze považovat za garantovaný celý měsíc; existující provider limiter zůstává nutný.

## Osmá etapa: uložený souhrn experimentálních live modelů

`/api/picks/model-lab/live` při `RESOURCE_SAVING_READS_ENABLED=true` pouze čte
`live-performance:v1` z ApiCache, se společnou 15min procesní cache. Prázdná cache
nespustí načítání celé historie ani výpočet: vrací 503, `Retry-After: 900` a vysvětlení.
Zastaralost nad 26 hodin je viditelná, čas skutečného výpočtu se nikdy nenahrazuje časem čtení.
UI ukazuje chybu i při nedostupném detailu, nikoli nekonečné načítání nebo falešnou nulovou bilanci.

V Provozu je nová ruční akce **Připravit souhrn live modelů** (`refresh-live-performance`).
Spustit před zapnutím úsporného čtení a následně podle potřeby; automatická obnova této části
zatím není přidaná do cronu. Ruční akce podléhá rozpočtové ochraně stejně jako ostatní provozní úlohy.
Načte potřebné skalární sloupce jednou, zachová stávající výpočet profitu, ROI, Brieru,
drawdownu a časových pásem a zapíše jediný souhrn do 250 kB. Příliš velký nový report
nepřepíše předchozí. Bez zapnutého přepínače zůstává původní výpočet při GET.

Bilance zahrnuje všechny původně vyhodnocované řádky. Uložený PRO detail obsahuje nejvýše
30 posledních čekajících a 20 posledních ostatních výběrů na trh; zkrácení čekajících je označeno,
celkový počet zůstává přesný. Veřejná odpověď používá seznam povolených souhrnných polí,
nikoli celý privátní report. PRO oprávnění se ověří před čtením chráněného detailu.

Kapacitní dopad: místo opakovaných historických DB čtení při otevření malý uložený výstup;
jeden malý záznam navíc a historický výpočet pouze při explicitní obnově. Žádné nové workflow,
provider volání, závislost ani cache služba. Novou pravidelnou obnovu nezapínat bez měření
Neon compute a rezervy Vercelu. Testy ověřují shodu souhrnu před/po omezení detailů,
neveřejnost konkrétních výběrů, chybějící/prošlý report a invalidaci uloženého cache miss.

## Devátá etapa: kompaktní seznamy a spolehlivé načítání historie

- Model Lab activity vybírá jen pole používaná výstupem a výpočtem; nenačítá
  `AutonomousTipSnapshot.modelInputSnapshot` ani ostatní nepoužité auditní sloupce.
  Limit 100 řádků a filtry období, strategie, policy a kontextu zůstávají stejné.
- Historie rychlého přehledu načítá explicitní skalární projekci, nikoli celý řádek.
  Zachovává identitu trhu a verzí, publikační cenu, výsledek a dosavadní výpočet CLV.
  Při prázdném seznamu se neprovádí druhý dotaz na fixture. Stránka má nejvýše 30 položek;
  klient nadále používá výchozích 20. CLV filtr má omezené prohledání a pokračovací kurzor.
- Neexistující datum a obrácený rozsah se odmítnou před DB dotazem.
- Klient při změně sekce nebo kontextu ruší předchozí požadavek. Chyba se zobrazí,
  nepromění se na prázdnou historii. Neúspěšné dočtení nesmaže již načtené řádky.
  Prázdná část skenované historie s pokračovacím kurzorem umožňuje načíst další část.

Bez nového přepínače, zápisu, cache, SQL agregace, workflow nebo provider volání.
Úspora je odstranění nepotřebných DB polí a jednoho dotazu v prázdném stavu; skutečný
měsíční přenos nebyl v této etapě měřen. Žádné přesunutí výpočtu na jinou službu.
API testy ověřují PRO ochranu, projekce, ceny/CLV, omezené stránkování, neplatná data
a odlišení databázového výpadku od prázdné historie.

## Naměřeno bez změny produkčních dat

`node --env-file=.env --import tsx scripts/auditResourceProjection.ts`

Odečet 1. 10. 2026 13:51 UTC, read-only transakce, limit SQL 8 s:

- 461 v5 snapshotů;
- původní JSON: 2 061 879 bajtů;
- vybraná scoring pole: 145 423 bajtů (přibližně −92,9 %);
- plán nové projekce: sekvenční průchod 1 440 predikcí, 461 výsledků, execution 30,103 ms,
  žádné dočasné čtení/zápisy.

To je **odhad objemu JSON polí pro jeden výpočet**, nikoli účtovaný přenos Neonu nebo celková měsíční úspora.
Bez inkrementálního přepínače jde stále o úplný scoring průchod. Volitelná druhá etapa je popsána níže.
Lokální Windows build: 109 NFT tras, sjednocené trasované soubory ~38,75 MB,
největší trasa ~28,10 MB. To není Vercel Functions Storage: skutečné linuxové balíky,
deduplikace a uchovávané deploymenty se mohou lišit.

## Přenos nákladů a aktivační brány

| Změna | Úspora / nový náklad | Brána |
| --- | --- | --- |
| Ledger projekce | Méně Neon transferu a Vercel deserializace, žádná jiná služba | Regresní testy metrik |
| v5 SQL projekce | Menší transfer; práce přesunuta do SQL, naměřeno 30 ms / průchod | Sledovat Neon compute; nejde o bezplatný SQL výpočet |
| Read-only audit GET | Bez opakovaných skenů a zápisů při otevření | Explicitně vytvořit první report |
| Procesní cache | Méně DB dotazů, další omezená paměť Vercelu | Ověřit provisioned memory/CPU; cold instance cache nesdílí |
| Uložené bilance | Čtení malé bilance místo historie, nové malé ApiCache záznamy a práce v auditu | Výchozí vypnuto; změřit auditní běh a limit navýšení 20 % |
| Rozpočtové odečty | Nejvýše jeden malý čtecí dotaz / cache miss / instanci; ruční zápisy | Bez polling workflow, bez consumption API |

Nepřibyly provider requesty, npm závislosti ani další workflow/runners. Druhá etapa připravuje malou GitHub cache,
ale její používání je výchozí vypnuté a vyžaduje zvlášť ověření rezervy.
Neaktivovat nové přesuny, dokud není ověřena cílová rezerva. Samotný lokální build nepotvrzuje kapacitu Vercelu.

## Nasazení první etapy

1. Získat aktuální odečty a bezplatné limity Neon, Vercel, GitHub a API-Football.
   Vercel/GitHub limity a fakturovaná spotřeba zatím nejsou z této implementace ověřené.
2. Nasadit kód s volitelnými přepínači vypnutými. Ověřit přihlášení, PRO ochranu, tipy a výsledky.
3. V `/provoz` vytvořit audit; v `/provoz/kapacita` zadat skutečné odečty. Zapnout rozpočtové ochrany.
4. Přepnout Neon na Free co nejdříve po základním smoke testu; ověřit účinnost v konzoli a zbývající kvóty.
   Dosavadní účet se nemaže. Tento dokument ani kód změnu tarifu neprovedly.
5. Pro úsporné strategie nejprve explicitně spustit „Připravit souhrny strategií“, porovnat bilance,
   změřit dobu / CPU / DB práci, poté zapnout `RESOURCE_SAVING_READS_ENABLED`.
   Obnova pak běží v existujícím nočním auditu; nestahuje se historie při cache miss stránky.
6. Sedm dní včetně víkendu zapisovat denní skutečné odečty, následně vyhodnotit celý měsíc.
   Cíl Neon: transfer ≤4 GB, compute ≤80 CU-h, storage ≤0,4 GB; ostatní nejvýše 80 % ověřeného Free limitu.
7. Při ohrožení vypnout volitelné funkce, ne navýšit tarif. Emergency stop lze zapnout i při nefunkční DB.

## Zbývá před přijetím celého plánu

- Ověřit aktuální limity a spotřebu účtů, skutečnou změnu tarifu a denní projekce.
- Ověřit aktivovaný GitHub preflight na skutečných minutách/cache operacích a spuštěních včetně zpoždění scheduleru.
- Dokončit produkční bootstrap v5 a změřit běhy s nulou změn, opravou výsledku a cold-startem.
- Přeskočení těžkých validací podle fingerprintu vstupů a nejvýše jednou denně.
- Dávkové sdílení týmových profilů napříč predikčními modely a vynechání nezměněných fixture.
- Dokončit stránkování/lazy detail všech seznamů a odstranit zbývající historické detailní GET skeny.
- Souhrnná DB/query/cache telemetrie, omezený circuit breaker a přehled dopadů každé fáze.
- Změřit paměť, payloady, cold-starty, query plány a navýšení délky cronů; otestovat UI v prohlížeči.
- Prokázat současnou rezervu všech služeb. Test suite sama tento provozní cíl nedokazuje.

Dokud tyto body nejsou ověřené, nelze označit celý plán za dokončený ani slíbit měsíční nulovou fakturu.

## Třetí etapa: menší seznam v5 a odstranění opakované práce

- Denní seznam Průběhu v5 používá SQL projekci jen pro údaje karty. Už nepřenáší celý
  `FixturePrediction.inputSnapshot`. Zůstává tentýž uložený model, pravděpodobnosti,
  intervaly a pořadí podle výkopu; při shodném výkopu je pořadí deterministické podle fixture ID.
  Oprávnění i historické souhrny zůstávají v dosavadních vrstvách.
- Kontrolní skript `scripts/auditPressureDailyProjection.ts YYYY-MM-DD` spouští read-only
  transakci s osmivteřinovým SQL limitem. Argument `latest` vybere nejpozdější uložený
  den s v5, tedy případně budoucí den, nikoli nutně poslední odehraný zápas.
- Kontrola 1. 10. 2026 v 17:56 UTC: dnešek neobsahoval žádné v5 řádky; na uloženém dni
  25. 10. byly tři řádky. JSON 13 576 → 2 474 bajtů (−81,8 %), kontrolované góly,
  pravděpodobnosti a střely beze změny. SQL execution 0,416 ms, index scan, bez dočasných
  souborů. Malý vzorek a teplá cache, nikoli měsíční úspora nebo účtovaný transfer.
- Při této kontrole byla opravena společná hranice pražského dne: při změně času nesmí
  používat polední offset pro půlnoc. Regresní testy pokrývají 23hodinový i 25hodinový den
  a začátek předchozího dne. Uložené publikace se nemění; čtení zahrne správný lokální den.
- Model Lab načte jedním malým dotazem identity již uložených milníků. Jejich původní
  neměnné reporty 50/100/200 znovu nepočítá ani nezapisuje. Chybějící milníky vytváří
  původní metodikou; aktuální metriky, kontrola degradace a v5 settlement se dál aktualizují.
  Nejde ještě o kompletní denní fingerprint ochranu všech historických validací.

Kapacitní dopad: menší Neon přenos a Vercel deserializace; projekce přidává drobnou SQL práci,
jejíž plán byl výše změřen. U milníků jeden čtecí dotaz na identity nahrazuje opakované
bootstrap výpočty a až tři upserty na definici. Bez nové služby, provider volání,
GitHub jobu, cache historie, migrace nebo změny kvalifikačních pravidel. Měsíční dopad
a rezervu ostatních služeb je stále nutné doložit provozními odečty.

## Čtvrtá etapa: výkonnost rychlého přehledu

- `/api/picks/quick-overview/performance` při zapnutém `RESOURCE_SAVING_READS_ENABLED`
  čte pouze uložený souhrn v ApiCache, s 15min procesní cache ve společném paměťovém rozpočtu.
  GET nikdy nedoplňuje chybějící report historickým výpočtem.
- Bez přepínače zůstává původní výpočet, ale dotaz vybírá jen potřebných jedenáct sloupců.
  Žádné celé snapshoty, názvy týmů nebo další nepotřebné části ledgeru.
- Uložené souhrny zachovávají původní kategorii, policy a kontext; nový klíč zahrnuje
  identitu katalogu a povolených lig. Výpočet profitu a CLV se nemění.
- Obnova načte všechny tři kontexty jedním dotazem a atomicky uloží tři malé reporty.
  Běží po opravě quick settlementů v existujícím auditu nebo přes tlačítko
  „Připravit souhrny strategií“. Před aktivací úsporného čtení je nutné připravit i tyto souhrny.
- Chybějící/neplatný souhrn znamená 503 s Retry-After 900 a vysvětlením, nikoli prázdné
  účetnictví. Starší než 26 hodin se zobrazí s původní bilancí, časem a upozorněním;
  taková odpověď se nedává do CDN cache. PRO detail ledgeru se touto změnou neotevírá veřejně.
- Náklady: tři malé ApiCache řádky, jeden čtecí miss na kontext/instanci/TTL.
  Historický přepočet se přesune z opakovaného GET do opt-in auditu; nová obnova
  není zadarmo a její přidaný čas/compute se musí ověřit před zapnutím. Žádná další služba,
  workflow ani API-Football volání. Opakované manuální obnovy stále mohou zbytečně spotřebovávat zdroje.
- Testy ověřují stejné výsledky původního výpočtu, oddělení kontextů, dávkový dotaz,
  invalidaci cache, neplatný/chybějící report a explicitní stale odpověď bez výpočtu při GET.

## Pátá etapa: PRO detail Model Labu

- Úsporný `/api/picks/model-lab?detail=true` vyžaduje konkrétní strategii a policy.
  Po serverové kontrole PRO čte uložený detail, nikoli celý ledger. Veřejný summary
  payload tento privátní report neobsahuje; autorizované HTTP odpovědi zůstávají private/no-store.
- Segmenty se počítají nad celou kohortou, ne nad stránkou. Seznam zachovává původní
  okno posledních 100 řádků a vrací stránky po 30 přes `page=1..4`, s `nextPage`,
  `totalRows` a `retainedRows`. UI používá segmenty; nepředstírá kompletní historii
  omezeným seznamem. Úplný historický ledger se tím nemaže.
- Audit použije již načtené řádky, bez druhého historického dotazu. Oddělený ApiCache klíč
  zahrnuje kontext, strategii, policy, kohortu a report verzi. Otisk všech vstupních řádků
  detekuje i opravu výsledku nebo closingu. Při shodě se načte pouze malý hash a
  aktualizuje čas kontroly v SQL; segmentové výpočty a přenos starého reportu se vynechají.
  Při změně metodiky je nutné zvýšit report/verzi klíče, nestačí zachovat stejný hash vstupů.
- Nové tlačítko „Připravit detaily Model Labu“ umožňuje vytvořit souhrny před zapnutím
  `RESOURCE_SAVING_READS_ENABLED`. Spouští existující monitoring Model Labu včetně dalších
  jeho kontrol; nejde o lehký GET. Nepouštět opakovaně bez důvodu. V zapnutém režimu
  navazuje obnova na existující audit, bez nového workflow nebo providera.
- Chybějící report znamená explicitní 503/Retry-After 900; starší než 26 hodin nese
  `asOf/stale/limitedReason`. UI zobrazí nedostupnost nebo stáří místo nekonečného spinneru.
- Ukládá se nejvýše 250 kB na report, procesní cache sdílí stávající limit a TTL 15 minut.
  Přibyde malý čtecí hash dotaz a zápis na kohortu v auditu. Změněná kohorta vyžaduje
  segmentové výpočty navíc vůči původnímu auditu: před zapnutím změřit jeho runtime a CPU,
  zejména první naplnění; nepovažovat to automaticky za rezervu do 20 %.
- Seskupení řádků v `modelLabSegments` už nekopíruje celé rostoucí pole při každém řádku.
  Pořadí, hranice segmentů a vlastní statistické funkce zůstaly stejné.
  Stránkovaný endpoint `/api/picks/model-lab/cohort` neposílá nepotřebný `modelInputSnapshot`.

Tato etapa neodstranila historické výpočty starého endpointu `/api/picks/stats`.
Celý bezplatný provoz stále není potvrzený bez nasazení, aktuálních kvót a skutečných odečtů.

## Šestá etapa: doplňkové historické statistiky

- `/api/picks/stats` při `RESOURCE_SAVING_READS_ENABLED=true` pouze čte malý uložený
  souhrn. Žádný cache miss ani změna query nevyvolá historické čtení nebo backtest.
  Původní libovolný výpočet zůstává dostupný při vypnutém úsporném režimu.
- Hlavní metriky, benchmark, kalibrace, publikované tipy, count accuracy, checklist
  a CLV napříč trhy se při přípravě spočítají jednou. Čtyři stávající `PICK_PRESETS`
  sdílejí stejné jednorázově načtené podklady. Kontexty i původní scoring funkce zůstávají stejné.
- Omezení komfortu je explicitní: libovolný vlastní historický backtest nelze levně
  předpočítat pro nekonečně mnoho prahů. Pro jiný přesný filtr se vrací
  `backtest: null`, pravidlové `clv: null` a `CUSTOM_BACKTEST_NOT_PRECOMPUTED`,
  nikoli nula nebo výsledek podobného pravidla. Globální metriky zůstávají dostupné.
  UI vysvětluje omezení. Živé příležitosti ani kvalifikační filtry se nemění.
- Přesné klíče rozlišují trh, stranu, pravděpodobnost, edge i readiness; zejména
  chybějící edge není totéž co edge 0. Uložené verze jsou oddělené podle modelu,
  kontextových verzí, katalogu a předvoleb.
- Před zapnutím úsporného čtení spustit v administraci „Připravit historické statistiky“.
  Velikost reportu je omezena na 250 kB; větší report se neuloží. Stávající report
  zůstane zachován. Bez reportu se vrací explicitní 503, nikoli nulová bilance.
- `RESOURCE_LEGACY_STATS_REFRESH_ENABLED=false` je nový výchozí přepínač ve Vercelu.
  Zapnout až po změření přípravy souhrnu a rezervy celého auditu. Pak se obnova připojí
  na konec existujícího auditu; pokud uplynulo přes 40 s, vrátí pro tuto část DEFERRED.
  Tato vstupní časová kontrola není zárukou, že samotný výpočet trvá méně než 20 s,
  a nenahrazuje požadované měření. Bez aktivace zůstává obnova manuální a stáří viditelné.
- Přibude jeden malý ApiCache report a jeho obnova, nikoli kopie historické databáze.
  Čtení sdílí 15min procesní cache. Nová služba, provider request ani GitHub workflow nevznikly.
  HTTP komprese/hlavičky se nevydávají za úsporu DB přenosu.

Testy porovnávají původní výpočty, oddělení kontextů, jediné načtení pro předvolby,
chybějící/stale report, přesnou shodu filtru a zákaz výpočtu při GET v úsporném režimu.

Lokální kontrola po šesté etapě: 112 NFT tras, sjednocené trasované soubory 42,24 MiB,
největší trasa 26,80 MiB, žádný chybějící soubor. Jde o Windows build, nikoli velikost
linuxových funkcí nebo Vercel Functions Storage; předchozí lokální odečet není důkazem
úspory účtovaného storage. Skutečný deployment a retenci je stále nutné ověřit ve Vercelu.

## Druhá etapa: inkrementální v5

- Vlastní malý akumulátor `pressure-performance:v5:incremental:1` a kompaktní příspěvek pro každý fixture
  pod `pressure-contribution:v1:<generation>:<fixture>`. Kontext a verze artefaktu zůstávají oddělené.
- Detekce změny přes PostgreSQL revizi řádku a `predictedAt`; změna výsledku nezůstane skrytá.
  Změna nesouvisejících kurzů může způsobit nadbytečné přehodnocení, nikoli dvojí započtení.
- Nejvýše 50 změn v dávce; konstantní počet aplikačních DB dotazů, jeden hromadný zápis příspěvků.
  Advisory lock a transakce chrání souběh, restart a atomické odečtení starého / přičtení nového příspěvku.
- Úvodní nekompletní akumulátor zůstává neveřejný. Poslední úplný report se nezmění, dokud nejsou zpracované změny.
  Po vyčerpání rozpočtu se dokončená dávka uloží a vrátí `DEFERRED`; další běh pokračuje.
- Plánovací rozpočet je 8 s; transakce má timeout 6 s. Před další dávkou musí zbývat přes 2 s,
  takže nejhorší běh může dokončováním dávky dosáhnout necelých 12 s (20 % 60s cronu).
- Tyto záznamy jsou stav agregace, ne dočasná 90denní telemetrie. Nesmějí se nezávisle mazat,
  jinak by se ztratil předchozí příspěvek pro opravu. Originální snapshoty se nemění.
- V `/provoz` je explicitní tlačítko „Vyhodnotit změny v5“. Přepnutí proměnné na `true` vyžaduje redeploy;
  opakované běhy mohou dokončit bootstrap. Automatická obnova používá stávající auditní cron.

Read-only kontrola 1. 10. 2026 14:25 UTC: 50 zdrojových řádků, kompaktní příspěvky 17 677 bajtů,
shoda s úplným výpočtem s maximální numerickou odchylkou 1,11×10⁻¹⁶, SQL execution 9,591 ms.
Jde o vzorek a jednotlivý běh s teplou DB cache, nikoli odhad celého měsíce ani měření produkčního zápisu.
Kontrolní skript: `node --env-file=.env --import tsx scripts/auditPressureIncremental.ts`.

## Druhá etapa: live preflight v GitHubu

GitHub **repository variables**, nikoli proměnné Vercelu:

- `LIVE_SCHEDULE_PREFLIGHT_ENABLED=true`: aktivovat až po ověření Actions minut i cache rezervy.
- `RESOURCE_AUTOMATION_PAUSED=true`: nouzově vynechá celý job před přidělením runneru. Je to ruční pojistka;
  samotný zápis odečtu do aplikace tuto GitHub proměnnou nemění.

Dosavadních šest live slotů za hodinu je rozděleno na hodinový slot `:02` a pět ostatních; počet se nezvýšil.
Hodinový slot čte autentizovaný `/api/cron/live-schedule`, který jedním malým dotazem načte pouze kickoff/status
existujících predikcí. Neobnovuje rozpis u poskytovatele. Změnu výkopu využije až po jejím uložení současnými sběry.
Harmonogram nese pouze UTC časová okna, čas vytvoření a 70min platnost; žádné tipy, ID uživatelů nebo klíče.
Okno zahrnuje 15 minut před výkopem a 4 hodiny po výkopu; překryvy se sloučí.
Chybějící/prošlý/neplatný harmonogram znamená hodinový fallback a warning v Actions, nikoli trvalé vypnutí.

Cache ukládá jediný soubor do 32 KiB, nejvýše jednou za hodinový klíč. Bez zapnutého přepínače se checkout,
cache i preflight kroky přeskočí a původní volání pokračují. Manuální spuštění preflight nefiltruje.
Použité rozhraní: [GitHub cache restore](https://github.com/actions/cache/blob/main/restore/README.md)
a [cache save](https://github.com/actions/cache/blob/main/save/README.md).

Kapacitní dopady k ověření před zapnutím:

- Neon/Vercel: až 24 malých kontrol programu denně navíc, výměnou za vynechané live požadavky mimo okna;
  při celodenním programu nemusí být úspora kladná. Úlohy musí být měřené, ne automaticky označené za levnější.
- GitHub: žádné nové plánované běhy, ale checkout/restore/save prodlužují existující job a mohou zvýšit
  účtované minuty kvůli zaokrouhlení. Samotné vynechání HTTP requestu nesnižuje automaticky účtování runneru.
- Nezkomprimované soubory maximálně 24×32 KiB za den na větev; k tomu archivní režie. Skutečnou retenci,
  velikost cache a její limit ověřit v konzoli; přepínač není automatickým zvýšením dostupné kapacity.
- API-Football: harmonogram nepřidává žádné volání. Closingy a hlavní predikční sloty se nemění.

GitHub YAML prošel lokálním parsováním. Testy pokrývají DST, změnu uloženého výkopu, neplatný/prošlý harmonogram,
omezení velikosti, autorizaci endpointu a zákaz publikování zkráceného programu jako úplného.
