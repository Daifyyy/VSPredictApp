# AI výzkum 1X2 / Over 2,5 — offline pilot v1

Aktuální produkční handoff: [Telegram a dokončená BASE integrace](telegram-handoff.md).
BASE Over má samostatnou ručně povolenou výzkumnou cestu (policy 1001), nikoli
statistické schválení. Migrace je aplikována; aktivace vyžaduje deploy a čtyři flagy.
Níže uvedené záznamy popisují historické fáze experimentu, nikoli aktuální stav nasazení.

Dokončeno [srovnání s rozšířenou historií 2024](expanded-exploration-2026-10-23.md).
BASE Over má malý vývojový přínos pod 1% branou, 1X2 nepřekonává hlavní model.
Žádný kandidát není aktivován; vše proběhlo lokálně bez dalších API/DB volání.

Nově dokončeno [ověření metadat sezony 2024](inventory-2024-import.md): přesně šest
schválených API požadavků, bez Neonu. Starší historie je připravena pro další
chronologickou rekonstrukci; staré datasety a výsledky zůstávají neměnné.

Dokončeno [lokální vývojové porovnání BASE / ADVANCED](profile-exploration-2026-10-23.md):
pevná regrese nepřekonala hlavní benchmark. Jde o explorativní development-only
experiment, nikoli nové nezávislé ověření nebo aktivaci modelu.

Bez databáze je dokončen také [audit lokálních archivů 2024/2025](local-archives-2026-10-23.md).
Starší střelecké statistiky máme; před použitím chybí ověřit metadata zápasů 2024.

Aktuální navazující krok: [připravenost dalšího experimentu](next-experiment.md).
Lokální preflight odhalil nedostatečný ADVANCED vzorek; nový trénink ani export
z produkce zatím nebyl spuštěn.

Pro další práci jsou připraveny [opravené vstupy v2](feature-quality-v2.md).
Příkaz `scripts/buildAIQualityDataset.ts` vytváří pouze lokální quality rekonstrukci
s vypnutým tréninkem. Níže uvedený pilot v1 zůstává historickým zamítnutým experimentem;
jeho terminal nesmí být znovu vydáván za nové nezávislé ověření.

## Stav

Implementovaná a spuštěná je **offline fáze**: dataset, chronologické features, ablace,
regrese/CatBoost, kalibrace, rozpočtový dohled, kompaktní export a TypeScript inference.
Pilot 23. 10. 2026 skončil `REJECTED`. Produkční integrace je podle plánu podmíněna
přijetím kandidáta; proto není nasazen nový model, migrace, cron, ledger ani Telegram.
Existující původní Over, 1X2 a VALUE/ELO nebyly upraveny.

Výsledek a hranice interpretace: [pilot-2026-10-23.md](pilot-2026-10-23.md).

## Reprodukovatelný postup

Spouštět z kořene repozitáře, Python 3.12. Nikdy nepřidávat `--env-file` ani produkční
DB připojení. Zdrojové soubory již musí existovat lokálně. Skript nic nestahuje.

```powershell
python -m venv .runtime/ai-python
.runtime/ai-python/Scripts/python.exe -m pip install -r research/ai/requirements.lock.txt
node --import tsx scripts/buildAIResearchDataset.ts
.runtime/ai-python/Scripts/python.exe research/ai/supervise.py .runtime/ai-research/<hash>.dataset.json
node --import tsx scripts/verifyAIParity.ts .runtime/ai-research/<run-hash>
.runtime/ai-python/Scripts/python.exe -m unittest discover -s research/ai -p test_protocol.py
npx vitest run lib/picks/aiResearch.test.ts
```

Nespouštět pracovní `train.py` přímo: pouze supervisor vynucuje paměť celého stromu
procesů a volnou systémovou RAM. Jeden trénink, dva thready, nejvýše 80 fitů a 90 minut.
Na tomto PC neprovádět současně další náročné experimenty. Hotový run se nepřepisuje.
Další experiment vyžaduje novou identitu/protokol; neotevírat tentýž terminal opakovaně
jako údajně nový nezávislý test.

`requirements.lock.txt` zachycuje celý skutečně použitý Windows environment.
`requirements.txt` obsahuje přímé závislosti. Žádné Python balíčky nejsou součástí
Next.js dependencies. `.runtime`, `.cache` a `research` jsou vyloučeny z Vercel uploadu;
lokální prostředí je vyloučeno také z ESLintu a TypeScript projektu.

## Architektura a kontrakty

- `scripts/buildAIResearchDataset.ts`: explicitní lokální vstup, ověření hashů inventářů,
  FT / regular-season filtrování, společné řádky modelu a benchmarků, hash výsledku a kódu.
- `lib/picks/aiFeatures.ts`: sdílený chronologický builder. Historie musí být před
  UTC začátkem predikovaného dne a s odstupem více než tří hodin. Stejný den je vyloučen.
  Elo se aktualizuje po výsledku; vlastní i dovolené statistiky mají časové váhy.
  Okna týmu mají nejvýše 40 zápasů, L5/L10 a venue pohled; metadata chybění jsou explicitní.
- `research/ai/train.py`: pouze hotová matice. Train-only imputace/škálování; tři
  expanding development foldy; feature ablace a omezený grid; výběr jediného vítěze;
  samostatná teplotní kalibrace; jeden závěrečný test vítěze.
- `research/ai/supervise.py`: externí kontrola RSS, volné RAM a času, ukončení vlastního
  stromu procesů při překročení. Ukládá checkpointy, log, provenance a telemetrii.
- `lib/picks/aiResearch.ts`: verzovaný artefakt, numerické stromy/regrese a čistý pevný
  selektor. Neprovádí žádný DB dotaz, fit ani provider request.
- `scripts/verifyAIParity.ts`: shoda s Pythonem do `1e-6`, velikost artefaktu a p95.
  `RESEARCH_CANDIDATE` se přijímá pouze s explicitním `parityOnly`; běžná inference jej odmítá.

Pořadí tréninků je pevné: 36 ablačních fitů + 42 fitů konfigurací + 1 finální fit = 79.
Proto se při neúspěchu vítěze netrénuje náhradní vítěz na již otevřeném terminalu.
Trénovací kalibrace ani chybějící hodnoty nevyužívají terminal.

## Co data nedokládají

Jde o historickou rekonstrukci, ne zmrazené prospektivní vstupy. Původní timestampy
ingesce a revizí statistik nejsou známé. Sezóny už byly dříve zkoumané. UTC den a 3h
odstup jsou konzervativní aproximace dostupnosti, nikoli její důkaz. Neutrální hřiště
nelze z lokálních inventářů spolehlivě ověřit; příslušná aktivační brána zůstává zavřená.
Odpočinek nezahrnuje poháry/reprezentace mimo zdrojové ligy. xG a střelecké statistiky
mají neúplné pokrytí. Není rekonstruováno xGOT ani bookmaker cena.

Všechny brány jsou fail-closed. Žádná historická sázková ROI ani CLV není odvozena
z dnešních kurzů či closingu. Klasifikační úspěšnost všech zápasů **není** úspěšnost
kvalifikovaných sázek. Bez doložených tehdejších cen je ekonomické vyhodnocení nedostupné.

## Navazující fáze — zatím neprovedené

Teprve po předem definovaném novém experimentu, který projde statistickými i datovými
branami, přidat aditivní immutable `AIForecastSnapshot` a model/policy identitu ledgeru.
Následně explicitně ověřit batch 50 bez N+1, společný settlement a CLV v2, PRO autorizaci,
podpohled 1X2/Over a Telegram `/tipy ai` s TOP3 samostatnou publikační kohortou.
Snapshot musí obsahovat aktivní artefakt a jeho cutoff; změna výsledku nahradí příspěvek
souhrnu, nikoli další záznam. AI nevstupuje do Denního výběru ani VALUE/ELO.

Budoucí přepínače jsou definovány, ale nyní nejsou zapojeny do produkčních cest:
`AI_RESEARCH_INFERENCE_ENABLED`, `AI_RESEARCH_UI_ENABLED`,
`AI_RESEARCH_OPPORTUNITIES_ENABLED`, `AI_RESEARCH_TELEGRAM_ENABLED`.
**Nyní je nezapínat.** Samotný úspěšný parity test není schválení modelu.

Aktivace také vyžaduje ověřené kapacity produkce a dostatečnou kvalitu vstupů. Žádný
úspěch lokální inference nezaručuje rozpočtovou rezervu Neonu, Vercelu či GitHubu.
Prospektivní checkpointy 50/100/200 a ruční rozhodnutí nesmějí být nahrazeny tímto replayem.
