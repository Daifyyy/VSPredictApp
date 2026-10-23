# Oprava vstupů AI: feature schema v2, quality policy v1

## Co je opravené

Nový `AIFreshFeatureBuilder` v `lib/picks/aiFeatureQuality.ts` u každé týmové metriky
GOALS, XG, SHOTS, SHOTS_ON_TARGET, SHOTS_INSIDE_BOX a CORNERS eviduje zvlášť vlastní
a soupeřem dovolený výkon:

- poslední pozorování a sezonu;
- stáří k předzápasovému cutoffu;
- počet všech platných pozorování;
- počet platných pozorování v posledních 180 dnech, nejvýše v posledních 40 zápasech;
- počet pozorování aktuální sezony ve stejném okně;
- samostatné `available`, `fresh`, `usable` a konkrétní důvod nepoužitelnosti.

Nový výsledek bez xG **neobnoví** čas starého xG. Nula je platná naměřená hodnota,
nikoli náhrada chybějícího údaje. Záporné/nečíselné statistiky a nemožné SOT/box > shots
se nezapočítají jako platné pozorování. Neplatné identity a výsledky se odmítají.

Stavy: `READY`, `MISSING`, `STALE`, `SMALL_SAMPLE`, `SEASON_WARMUP`.

## Předem stanovené ochrany, nikoli optimalizované sázkové filtry

- Poslední pozorování maximálně 45 dní staré (hranice včetně).
- Nejméně 5 pozorování v okně 180 dní / nejvýše 40 zápasů.
- Pro pokročilé statistiky navíc nejméně 5 pozorování aktuální sezony.
- Platnost se posuzuje pro každý tým, směr a metriku samostatně.
- Stáří se počítá z času zápasu, **ne ze spolehlivě doloženého času publikace**.
  `sourceTiming = MATCH_TIME_PROXY` tuto zásadní nejistotu přiznává.

Pravidla nejsou kalibrovaným optimem ani důkazem vyššího ROI. Změna těchto pravidel
vyžaduje novou verzi quality policy, nikoli tiché přepsání datasetu.

## Dvě oddělené vstupní větve

- `BASE`: čerstvý dostatečný gólový základ, bez nároku na kompletní advanced statistiky.
  `aiFeatureView(..., 'BASE')` obsahuje pouze původní skupinu 1: góly/síla, Elo,
  velikost vzorku a ligový základ, včetně indikátorů chybění. Změna xG tuto vektorovou
  reprezentaci nemění.
- `ADVANCED`: gólový základ i všech 20 pokročilých týmových/směrových metrik splňují
  readiness. Pohled obsahuje úplný vektor; každý závislý vstup podléhá quality maskování.
- `UNAVAILABLE`: ani gólový základ nemá požadovanou čerstvost/vzorek. Modelový pohled
  se nevytvoří. Výsledek není doplněn optimistickým fallbackem.

Požadavek na ADVANCED se nikdy potichu nezmění na BASE. Budoucí artefakt musí mít
odpovídající schema a režim; zatím neexistuje schválený artefakt v2.

`availableCoverage` zůstává historická nenulovost před filtrem. `freshCoverage` a
výchozí `coverage` počítají použitelné hodnoty po filtru, bez bonusu za indikátory
chybění. BASE používá vlastní `coreCoverage`, nikoli předstírané pokrytí xG.
Odvozené xG/střelu, shot ratios, tempo a rolling features se zneplatní s příslušnými
vstupy. Historický časově vážený průměr může obsahovat i starší pozorování: readiness
neznamená, že všechny příspěvky do průměru pocházejí z aktuální sezony.

## Verzování a bezpečnost

Původní `aiFeatures.ts`, dataset v1, zamítnutý pilot, modelové výsledky a artefakt
zůstávají beze změny. Nový lokální příkaz:

```powershell
node --import tsx scripts/buildAIQualityDataset.ts
```

Čte přesně identifikovaný původní dataset a jeho hashované lokální zdroje, ne DB.
Zachovává fixture, cíle, benchmarky a historii; mění jen vstupy a přidává audit kvality.
Benchmarky jsou převzaté, **nikoli přepočet hlavního modelu na opravených features**.
Každá nová podoba má vlastní hash a uloží se bez přepsání předchozí.

Výstup je `version: 2`, `QUALITY_RECONSTRUCTION_ONLY`, `trainingAllowed: false`,
`independentHoldout: false`, `activation: false`. Je v `.runtime/ai-quality-v2/`.
Stávající pilot trainer přijímá jen schema v1; supervisor navíc nepřijímá tuto cestu.
Tím nevzniká nové trénování na již prohlédnutém terminalu ani automatické schválení.

Produkční crony, strategie, UI, Telegram a hlavní gólový model se nemění. Žádné nové
provider volání, DB dotaz, migrace či cloudové úložiště. Výzkumné soubory a lokální
dataset zůstávají mimo deployment.

## Ověřený lokální výsledek

Stejná kohorta 3 641 zápasů:

| Stav vstupů | Zápasy |
|---|---:|
| ADVANCED | 1 510 |
| BASE | 2 048 |
| UNAVAILABLE | 83 |

217 řádků má alespoň jednu starou metriku; 1 965 alespoň jednu chybějící. Kategorie
varování se mohou překrývat. Zneplatněno 12 818 jednotlivých původně nenulových feature
hodnot (nikoli tolik zápasů). Pokrytí kleslo z 64,69 % na 61,30 % — nejde o zhoršení
modelu, ale o odstranění zavádějícího vykazování dostupných vstupů.

Sestavení 2,86 s, p95 samotného sestavení profilu 0,76 ms, špička RSS přibližně 192 MiB.
Dataset 27,1 MB, žádné nové tréninky. Jde o lokální měření, ne benchmark Vercelu.

Finální soubor:
`.runtime/ai-quality-v2/cabca0a635219d7d1eba6984116e9c79b12461e764545e2e44d9a12edb529861.dataset.json`.

## Co dál

V ověřené lokální složce `.cache/backtest` jsou advanced-stat soubory pouze pro sezony
2024/2025 a pět lig; novější `stats-*-2026.json` tam nejsou. To není důkaz jejich
neexistence v Neonu. Před případným úzkým exportem ověřit rezervu přenosu, vybrat jen
chybějící ligy/období a potřebné sloupce a nastavit limit řádků/bytů. Žádný export nebyl
v této změně spuštěn.

Další experiment musí mít nový uzamčený protokol a nové období. Opravený dataset je
diagnostická příprava, nikoli znovu otevřený „nezávislý“ test. Nové výběrové filtry,
modelová kalibrace ani sázková doporučení z této změny nevznikají.
