# Predikce jako hlavní účel aplikace

Stav: inventura a implementační plán, 31. 10. 2026. Bez změn produkce a bez DB dotazů.
Podkladem je lokální kód, nikoli měření skutečného provozu nebo účtované spotřeby.

## Závazná změna rozsahu: bez live přenosu

Nové rozhodnutí uživatele nahrazuje níže uvedené původní návrhy LIVE detailu
a selektivního live sběru. Produkt má pouze předzápasové očekávání a konečný audit.
Historická inventura níže zůstává záznamem původních závislostí, ne cílem aktivace.

- Odstraněn plán collect-live (6 slotů za hodinu, tedy 144 denně), jeho dávkování
  i preflight/cache kroky. Ostatní rozvrhy včetně CLV a settlementu beze změny.
- Live API, harmonogram a watch vracejí 410 LIVE_RETIRED bez DB/provider/auth dotazů.
  Starý otevřený klient tak nezpůsobí další sběr ani zápis sledování.
- Program nemá Match Center, polling skóre, minuty ani živé skóre. Zápasy čekají
  na finální vyhodnocení. Detail nečte live snapshoty a nespouští live diagnostiku.
- Konečné statistiky a předvýkopové closingy zůstávají. Nové poločasové checkpointy
  nevzniknou; jejich chybění se nesmí dopočítávat ani vydávat za nulové hodnoty.
- Historické live kandidáty dořeší settle-results: nejvýše 20 fixture za běh,
  jeden dávkový dotaz na výsledky pouze při neprázdné frontě. Rozpracovaný zápas
  se nesettluje. Nejednoznačné/odložené výsledky zůstávají čekající.
- Nic se nemaže z DB, nevzniká migrace. Kód ještě není nasazen. Úspora v GB
  není změřená; odstraněných 144 plánovaných slotů není počet provider requestů.

## Dokončená navigační etapa (lokálně)

- Desktop i mobil mají stejnou hlavní trojici: `/`, `/vysledky`, `/vykonnost`.
- Program načítá šest programových dnů bez historické bilance a modelových auditů;
  klientské načtení historie je zapnuté pouze ve Výsledcích. Výsledky mají vlastní ISR.
- Na Programu je jeden souhrn uloženého Denního výběru namísto tří souběžných
  přehledů příležitostí/tiketů. Neřadí ani nekvalifikuje tipy, rozlišuje důkazové
  úrovně a chybu načítání, nevydává budoucí den za hotový výběr.
- Výkonnost obsahuje strategie/tikety a Model Lab jako dva oddělené pohledy.
  Vždy se mountuje jen zvolený pohled. Kohorty a bilance se neslučují.
- `/strategie` přesměrovává se zachováním parametrů; `/predikce` na modelový pohled.
- Odkazy ze sdíleného builderu vedou přímo na `/zapas/ID`. Staré `/porovnani?fixture=ID`
  fungují přes redirect, bez fixture se zápas neodhaduje. Volný `/api/compare`
  vrací 410 a nevolá model, DB ani poskytovatele. Globální vyhledávání klubů odstraněno.
- Platební návrat vede do Výkonnosti; sitemap obsahuje nové hlavní vstupy.
  Přesměrování neodemyká PRO obsah. Navigační odkazy nepřednačítají dynamické detaily.
- Osobní deník zůstává dostupný. Vedlejší historické stránky a nepoužívané sdílené
  knihovny zatím nejsou fyzicky smazané; tato etapa není odstranění všech jejich cronů.
- Nasazení, skutečné odečty přenosu a vizuální kontrola produkce se ještě neprovedly.

## Implementace: první krok B (lokálně)

Match Center GET již nevolá provider ani capture/settlement. Nepřenáší celý
FixturePrediction, nenačítá opakovaně stejný live snapshot a neprohledává všechny
týmové ApiCache kvůli stadionu. Stadion se zobrazí pouze z existující VenueCache.
API vrací asOf/stale/limitedReason; UI vysvětluje chybějící nebo starý snímek.
Při změně fixture se resetuje příznak dokončeného pollingu. Výběr sestav nyní
zachovává nejnovější snímek týmu, nikoli poslední (nejstarší) z descending řazení.
Cron sběru a settlement zůstávají zachované; chybějící data se nevymýšlejí.
Základ nové stránky `/zapas/[fixtureId]` čte pouze skaláry FixturePrediction,
chrání číselné prognózy serverově a odmítá záznam vypočtený po výkopu. Označuje
jej jako uloženou predikci, nikoli důkaz původně publikovaného tipu. Čtení při
výpadku rozlišuje nedostupnou DB od neexistujícího zápasu. Zatím bez auto-refresh.
Detail nyní používá společný MatchInsight pro očekávání a uložený finální audit.
Audit musí odpovídat verzi tlakového modelu, metodice a výkopu; vstup musí odpovídat
týmovým identitám a vzniknout před výkopem. Chybějící hodnocení se nedopočítává.
PRO vidí posledních nejvýše 30 položek Denního výběru s výsledkem, stažením,
profitem a CLV. Tato historie není důkaz Telegram doručení ani seznam všech strategií.
Veřejná data neobsahují číselné auditní detaily ani publikované ceny.
Migrace odkazů, živé porovnání v novém detailu, další publikační zdroje a tři
veřejné sekce ještě nejsou dokončené. Produkce a navigace se nezměnily.

## Cíl a hranice

Tři veřejné vstupy: Program (`/`), Výsledky (`/vysledky`), Výkonnost (`/vykonnost`).
Jeden detail konkrétního zápasu (`/zapas/[fixtureId]`) pro PREMATCH/LIVE/FINAL.
Nahoře v Programu nejvýše pět již publikovaných položek Denního výběru, rozdělených
na doložené zdroje a neověřené kandidáty. Prázdná skupina je legitimní.
Neměnit pořadí selektoru, kvalifikaci, modelové verze ani historickou bilanci.
VALUE/ELO/AI zůstávají dostupné jako experimenty, nikoli náhradní „ověřená doporučení“.
Historické predikce, tikety, settlement a CLV se nemažou.

## Inventura rozhodnutí

| Dnešní funkce / implementace | Rozhodnutí | Konkrétní zásah a závislosti |
| --- | --- | --- |
| Program a výsledky: `app/page.tsx`, `ZapasyApp.tsx` | Ponechat, rozdělit | Program dnes inicializuje také výsledky a modelové reviews. Přesunout jejich první načtení do Výsledků; zachovat URL data. |
| `/denni-vyber`, `/strategie`, nabídky v `/predikce`, souhrny na homepage | Sloučit vstupy | Dnešní publikované položky na homepage; kompletní predikce v programu; strategické historie ve Výkonnosti. Zachovat ledgery a jejich rozdílné kohorty. |
| `/porovnani`, `CompareApp`, `/api/compare` | Nahradit | Zrušit volný výběr dvojice klubů. Detail čte zmrazenou predikci dle fixtureId, nikoli nový výpočet podle dnešních statistik. |
| `buildCompareHref` a odkazy v tipech/výsledcích | Migrovat | Jeden builder detailu zápasu. Staré odkazy s fixture přesměrovat; bez fixture nic neodhadovat, nabídnout program. |
| `FixtureModelCard`, `MatchCenter`, `MatchInsightCard`, `MatchReportPanel` | Sjednotit | Jeden modelový detail a společný MatchInsight; zachovat serverové PRO omezení. |
| `/predikce` Model Lab a `/strategie` bilance | Sloučit UI | Výkonnost: trh, strategie, policy, model, kontext, CLV metodika; zvlášť všechny predikce, oceněné výběry a publikované tipy. Nikdy nesčítat tyto množiny. |
| `/provoz`, `/provoz/modely`, `/provoz/kapacita` | Ponechat admin | Diagnostika, research a provoz mimo běžnou navigaci. GET jen čte malé uložené souhrny. |
| `/tabulky` a `/tym/[teamId]` | Odstranit veřejný vstup | Potřebnou formu a kontext ukázat v detailu zápasu. Ligové baseline/ratingy nesmazat: importuje je predikční cron. |
| `/transfers` a refresh-transfers | Kandidát k vypnutí | Odstranit stránku i plánovaný refresh po testu konzumentů. Pozor: `oddsDataset.ts` importuje parseCsv z transfersDataset; utilitu nejprve oddělit. |
| Globální `TeamSearch` v `AppHeader` | Nahradit | Hledat pouze v již dostupném programu; nevyvolávat studené týmové profily. |
| `/hra`, `/hra/vysledek`, `/api/game`, `/api/director` | Vyřadit z aktivního produktu | Nejprve uzavřít vstupy i API; nemažeme uložené kariéry ani schéma. Import graph serverových služeb ověřit před odstraněním kódu. |
| `/tipovacka`, `/api/tips` | Archivovat odděleně | Osobní deník není ledger automatických strategií. Zachovat uživatelovy záznamy a možnost čtení; vypnutí zápisu až jako explicitní produktová změna. |
| `/digest` a Telegram | Sjednotit zdroj | Webový duplicitní přehled sloučit; Telegram ponechat. Příkazy a výsledky čtou stejné uložené publikace. |
| Auth, účet, PRO, platby, offline, sitemap | Zachovat podpůrné | Nejsou nadbytečné kvůli zjednodušení navigace; aktualizovat sitemap a odkazy, zachovat oprávnění. |

## Ověřené problémy v datových cestách

1. `app/api/compare/route.ts` spouští getCompareTeam, baseline, ratingy, taktiky,
   H2H a tabulku a poté compareTeams(new Date()). Není to pouze čtení původní predikce.
2. `app/api/match-center/route.ts`: při chybějícím nebo >=45 s starém snapshotu
   GET volá fetchFixturesByIds a captureLiveFixture/settleLiveCandidates.
   Otevření detailu tedy může vyvolat externí sběr i zápisy. Nahradit read-only stavem.
3. `app/api/predictions/fixture/route.ts`: countSamples a foulSamples mají
   historické getSettledPredictionRows/getCachedCountTotals pod cache 300 s.
   Při cache miss běží agregace na čtecí cestě. Přesunout do settlement summary.
4. `app/api/cron/collect-live/route.ts` sledované fixture jen řadí před ostatní;
   nejde o striktní filtr sledovaných zápasů. Zavést explicitní povolenou množinu.
5. Navigace `app/_components/nav.tsx` má devět položek, mobilní primární Analýzy
   vedou na Porovnání a Manažer je hlavní vstup. Nová navigace bude společná pro
   mobil/desktop, bez paralelních konfiguračních seznamů.

Tyto nálezy dokazují práci navíc, nikoli její procentní podíl na účtovaném přenosu.

## Crony: co zachovat a co omezit

Zdroj rozvrhu: `.github/workflows/cron.yml`; konfigurace neprokazuje skutečné provedení.

- Zachovat predict-upcoming, snapshot-odds a priority closing, settle-results,
  settle-tips, daily-selection a telegram-digest. Nejprve optimalizovat jejich
  čtení, ne snižovat kvalitu closingů publikovaných položek.
- refresh-elo zachovat kvůli ELO. Odděleně omezit opakované roční historie.
- collect-live: podrobné statistiky jen publikované tipy a explicitně sledované
  zápasy s TTL a pevným limitem. Základní skóre programu oddělit od drahého detailu.
  Automatické live betting kandidáty/push vypnout samostatně, zachovat settlement starých.
- refresh-transfers: navržené vypnutí pravidelného sběru společně se stránkou.
- refresh-tactics a refresh-league-styles: podmíněně vypnout po uzavření závislostí.
  Taktiky využívá compare i teamProfile; ligový styl nesmí být zaměněn za gólový baseline.
- refresh-referees: ponechat jen pokud aktivní count strategie skutečně používají
  tento vstup; v predictions.ts je vazba na karty. Nevypínat jen kvůli skrytí UI.
- personnel-shadow a player-profiles: neobnovovat pozastavené experimenty.
- warm: projít seznam klíčů a zúžit na program/predikce; neohřívat odstraněné stránky.
- audit-pipeline/calibrate-models: ponechat řízené, pouze při změně výsledků;
  historické replaye zůstanou lokální, ne v UI nebo běžném cronu.
- send-notifications: volitelný komfort; nezaměnit s Telegramem, lze vypnout samostatně.

## Implementační pořadí a akceptace

### A. Bezpečnost a náklady (samostatný commit)
Dokončit rozpracovaný balík `neon-transfer-repair-2026-10-31.md` a zahrnout
cache/realRepository změny. Zabránit novému odběru vypnutých funkcí serverově.
Na lokálních fixtures ověřit stejné pravděpodobnosti, výběry a settlement.
Nasazení zatím neprokazuje dosažení Free limitu.

### B. Autoritativní detail (samostatný commit)
Zavést fixture read model nad uloženými predikcemi, MatchInsight a finálním auditem.
Požadavek musí zachovat identitu snapshotu, model/policy a čas. Přidat asOf/stale/
limitedReason; chybějící snapshot není důvodem k on-demand predikci.
GET bez provider volání, zápisů a historických skenů; explicitní watch je oddělený zápis.
Nejdříve zpřístupnit detail, teprve potom přesměrovat staré odkazy.

### C. Tři veřejné sekce (samostatný commit)
Přesunout Denní výběr na homepage, extrahovat výsledky ze ZapasyApp a výkonnost
ze StrategyHub/ModelLab. Experimenty dostupné pod filtry, nikoli skryté účetně.
Zachovat všechny podmínky a nohy VALUE/ELO. Bez nového systému skórování tipů.
PRO ochrana na serveru; veřejný payload nesmí obsahovat skryté detaily.

### D. Vyřazení vedlejších cest (samostatný commit)
Odstranit odkazy, potom routy/API a příslušné plánované sběry. Před každým smazáním
ověřit importy, klientské fetch, Telegram, sitemap, cron i testy. V prvním kole
žádné DROP tabulek ani mazání historie. Vracející se staré URL musí mít srozumitelný stav.

### E. Selektivní live a provozní ověření
Zavést omezený watch set a zakázat načítání provider dat z detail GET.
Chybějící poločasový checkpoint přiznat, nikoli dopočítat; konečný audit využije
stávající finální sběr. Reportovat coverage změněné politiky live zvlášť.
Ověřit desktop/mobil, hluboké odkazy, práva, timeout/kvótu, počet dotazů a velikost
payloadů. Full tests, typecheck, lint, offline build. Po obnovení Neonu denní odečty
transferu, compute a dalších služeb; žádný automatický upgrade nebo přesun nákladů.

## Zatím neuzavřené závislosti

Tato inventura není důkaz úplné nepoužívanosti všech endpointů. Před odstraněním
zbývá detailní import graph herních služeb, warm klíčů, teamProfile/taktik a stylů.
Implementace A a B probíhá lokálně. Modely, workflow, env a schéma se nemění;
nespojovat celý refaktoring s modelovým experimentem nebo jedním velkým commitem.

## Průběh implementace — detail zápasu

- `/zapas/[fixtureId]` čte omezený uložený předzápasový profil, společný MatchInsight
  a samostatně publikované položky Denního výběru a nohy VALUE/ELO (max. 30 každého).
- LIVE používá poslední uložený snapshot stejného fixture a týmů po výkopu;
  výpočet diagnostiky je společná čistá služba. Po 90 sekundách se zobrazí varování.
- FINAL vyžaduje uložený settlement stejné verze a výkopu. Chybějící audit se
  nevytváří při GET; chybějící statistiky se nenahrazují nulami.
- Konkrétní predikce, publikace a nohy tiketů jsou serverově PRO. Profit tiketu
  není profit jeho nohy a nesčítá se s Denním výběrem.
- Match Center GET již nevolá provider ani settlement; odstraněn plošný sken
  týmových cache kvůli stadionu. Chybějící data se přiznávají.
- Navigace a staré Porovnání zatím zůstávají. Před přepojením zbývá dokončit
  návaznosti detailu, ověřit desktop/mobil a navrhnout omezené obnovování live.
- Tyto změny nejsou nasazeny a jejich skutečná úspora přenosu ještě není změřena.
