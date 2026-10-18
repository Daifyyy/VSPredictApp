# Revize modelů a strategií — návrh, nikoli aktivace

## Cíl a rozhodnutí uživatele

Zjednodušit aplikaci, zachovat smysluplné predikce a ukončit nepotřebný nový sběr.
Porovnat Over 2,5 i 1X2. VALUE a ELO/INTUICE ponechat viditelné jako experimenty.
Historii nemazat, nezpětně nepřepisovat publikované výběry. Žádná garance zisku.

## Ověřený výchozí stav 18. 10. 2026

Produkční build: d12f72f2b877d9d83031008592a8e7ff9d44ed96.
Strategy Hub neobsahuje OVER_25_LEGACY_SHADOW; obsahuje pouze aktuální OVER_25.
Model Lab obsahuje historickou v1, současnou v2 i oddělený původní research.

Předběžné ligové souhrny kvalifikovaných uzavřených singlů modelu 7, kontextové
verze 1; zachycení před výkopem, uložená cena >1, bez VOID/UNAVAILABLE:

| Větev | Počet | Výhry | Profit v jednotkách |
|---|---:|---:|---:|
| Over historická policy 1 | 56 | 40 | +8,54 |
| Over původní brána, nový research | 23 | 16 | +2,17 |
| Over policy 2 | 9 | 5 | -1,29 |
| 1X2 policy 2 | 62 | 39 | +2,36 |
| 1X2 konzervativní filtr | 18 | 14 | +4,32 |
| BTTS policy 2 | 9 | 5 | -1,25 |
| Karty count model 2 | 37 | 21 | +0,28 |
| Rohy count model 2 | 28 | 14 | -3,67 |
| Fauly count model 1 | 35 | 14 | -8,99 |

Jde o popisné souhrny, nikoli nový validační audit nebo důkaz edge. Kohorty mají
různá období a výběry se překrývají. Výpočty profit = kurz−1 při výhře, −1 při
prohře, evidenční vklad 1. Zbývá ověřit identity, zdroje cen, void a koncentraci
výnosu na jednotlivé herní dny. Nepřenášet ROI tiketů na jejich nohy.

Dnešní uložené predikce: 30 zápasů. Research Over: 4 kandidáti; současný Over: 2.
Research: PEC Zwolle–Go Ahead Eagles, Osasuna–Racing Santander,
Mönchengladbach–Hoffenheim, NEC Nijmegen–Fortuna Sittard.
V2 aktuálně odmítá prostřední dva kvůli efektivnímu vzorku 7 < 8. Časy zachycení
research a aktuálního watch řádku se liší; není to párový experiment politik.
Tři research ceny jsou pod 1,50; nejsou tím automaticky způsobilé pro Denní výběr.
Dnešní výsledky nebyly tímto plánováním vyhodnoceny.

Uložený v5 report z 18. 10. 2026 01:32 UTC: ligový Over na 272 společných řádcích
má log-loss 0,69821, hlavní model 0,68988. Nižší je lepší; rozdíl není bez intervalu
důkazem statistické významnosti. Evropa (57) a reprezentace (178) jsou oddělené.

## Fáze 1 — jeden audit a jeden registr

1. Jeden omezený read-only export potřebných skalárních polí; další analýza lokálně
   nad cache s hashem a cutoffem. Nepoužívat celý inputSnapshot ani export opakovat
   při každé variantě. Uložit dotazy, definice metrik a kontrolní součty.
2. Audit všech predikcí oddělit od výběrové politiky, singlů a akumulátorů.
3. Oddělit model, policy, kontext, kontextovou/count verzi a metodiku CLV.
4. Kontroly: identita fixture/trhu, předvýkopový čas, realizovatelná cena,
   syntetické kombinace, duplicity, settlement regulérní doby, void/pending,
   chybějící closing, opravy výsledků a dostupnost features v čase rozhodnutí.
5. Hodnotit hit rate, flat-stake ROI, drawdown, blokové intervaly po herních dnech,
   CLV a jeho coverage, kalibraci a párový log-loss proti opening trhu. Popisné
   segmenty nezaměňovat za dosud neviděný holdout.
6. Současné oddělené katalogy sjednotit na registr řízení životního cyklu:
   ACTIVE_TEST, RESEARCH, PAUSED, QUARANTINED, ARCHIVE; evidence zvlášť UNKNOWN,
   INSUFFICIENT, VALIDATED. Režim řídí sběr, inference, publikaci i UI; doloženost
   nesmí vyplývat jen z názvu ACTIVE_TEST.

## Fáze 2 — zjednodušení aplikace

Jedna sekce Strategie se třemi pohledy: Dnes, Výkonnost, Archiv.
Dnes: nejvýše jedna karta na fixture a trh, explicitní původ výběru, čas a kurz,
oddělené experimenty, kvalifikovaný/nekvalifikovaný stav a důvod. Žádné nucené tipy.
Over obsahuje současný model a přepínač původní brány. Historický v1 se ukazuje
jen v archivu; nový research má vlastní bilanci. Výkonnost všech verzí je dostupná
z téže sekce, nikoli výhradně z administrace. Telegram a Denní výběr sdílejí registr,
ale výzkumná viditelnost sama nezapíná automatickou distribuci.

Výchozí návrh po ověření auditu:
- Ponechat základní predikční model jako benchmark, 1X2 a původní Over research.
- Guarded 1X2 zobrazit jako filtr téhož modelu, ne další nezávislý hlas.
- Over v2 zachovat jako srovnávací politiku; 9 výsledků nestačí k odmítnutí.
- VALUE/ELO viditelné experimenty dle zadání, účetnictví tiketů oddělené.
- Týmové góly ponechat v karanténě.
- Fauly, rohy, karty a samostatné BTTS navrhnout k pozastavení nového sběru pro
  redukci rozsahu, nikoli označení za statisticky prokázaně nefunkční modely.
- V5 pozastavit pro nové produkční inference a příležitosti; existující forecasty
  dosettlovat a ostatní kontexty zachovat jako offline benchmark. Nevymazat diagnostiku.

## Fáze 3 — skutečné úspory

Před vypnutím vytvořit mapu závislostí: hlavní model, tlak, VALUE/ELO a ostatní UI.
Zastavit jen samostatné úlohy a zápisy, které žádná zachovaná funkce nepotřebuje.
Vypnutí rohové strategie samo nesnižuje počet /odds volání — všechna tržiště
chodí jedním requestem. Měřit zvlášť DB bytes, DB compute, velikost snapshotů,
Vercel čas/invokace a minuty Actions. Porovnat při podobném počtu fixture.
Nepřidávat žádný cloudový trénink, nové providery ani častější cron. Nový experiment
smí spotřebovat uvolněnou a změřenou kapacitu, nikoli domnělou rezervu.
Pozastavené větve dál dokončí závazky settlementu a publikovaných closingů.

## Fáze 4 — nový kompaktní challenger pro Over a 1X2

Nezačínat další velkou tlakovou verzí. Předem specifikovat malý experiment:
kalibrační/reziduální model nad hlavními předzápasovými pravděpodobnostmi,
stabilizovanou útočnou/obrannou silou, rolí doma/venku, soutěží a velikostí vzorku.
Maximálně jedna předem zvolená rozšířená skupina: dostupné soupeřem upravené xG
a odpočinek. Nepotřebné features odstranit podle ablace na validační minulosti.
Over: regulovaná logistická kalibrace. 1X2: regulovaná multinomická kalibrace,
všechny tři strany včetně remízy, součet 1. Samostatná modelová a policy verze.
Primární model bez kurzů jako feature; vedle něj samostatný jednoduchý market-only
benchmark. Případný market-anchored challenger až jako explicitně další experiment,
ne tiché prolnutí benchmarku a hlavního modelu.

Benchmarky: ligový prior, současný hlavní model, v5 kde nabízí tentýž trh,
opening fair trh; výběrové politiky původní Over, v2 a 1X2 na společných cenách.
Historické původní tipy zachovat, jejich replay označit jako simulaci jiné politiky.

## Fáze 5 — backtest a aktivační brány

Rolling-origin, oddělené train/kalibrace/test; rozdělení podle herních dnů, ne řádků.
Features mají jen minulost dostupnou před výkopem. Zamknout poslední holdout,
nepoužívat jej pro výběr features, prahů, lig ani kalibrace. Vést registr všech
zkoušených variant. Již prohlížená historie není nezávislý finální holdout.
FULL kohorta = skutečně zmrazená predikce i cena; PARTIAL rekonstruované features
vykazovat odděleně. Bez tehdejších cen lze testovat predikci, ne tvrdit obchodní ROI.
Výsledky vždy na stejných řádcích a s pokrytím; náhodně nepřerozdělovat zápasy.

Před spuštěním zamknout brány: nulový leakage, koherence pravděpodobností,
párové zlepšení primárního log-loss proti hlavnímu modelu, nejistota blokovým
bootstrapem, kontrola kalibrace a velkých předem určených segmentů. Ziskovost
navíc vyžaduje cenovou kohortu, realistický pokles dostupného kurzu a úplné
započtení všech sázek; ne ladění na nejvyšší historické ROI. Nedostatek vzorku
znamená INCONCLUSIVE, ne PASS ani důkaz nefunkčnosti.
Do živého pouze shadow sběr po splnění metodických bran; žádná automatická
distribuce nového modelu. Reporty při 50/100/200 nových uzavřených výběrech;
nejméně 200 je minimální podmínka ručního rozhodnutí, nikoli důkaz edge.
Publikaci doporučení podmínit sdílenou validační branou a dostatečným CLV coverage.

## Přijetí, nasazení a rollback

Nejdříve audit a registr, potom přehled UI, až pak vypnutí nového sběru a offline
challenger. Každý krok samostatný commit s možností návratu. Neměnit současně
model i publikační filtry bez nové verze. Zachovat přístupová práva.
Testy: shoda web/Telegram/administrace, historie a verzování, skrytí versus skutečné
zastavení výpočtu, pending settlement, denní limity, neměnné snapshoty, replay bez
leakage, společný benchmark, chybějící data a nulové nové provider requesty.
Typecheck, lint, test suite a build. Ověřit malý API payload a nulovou inference při
otevření stránky. Po nasazení sledovat víkendovou zátěž i pracovní dny.

## Omezení tohoto plánování

Proběhla pouze inspekce kódu, build endpointu a malé read-only dotazy do produkce.
Nebyl proveden nový trénink, kompletní backtest, vizuální audit přihlášeného UI ani
vypnutí funkcí. Tento dokument je plán, nikoli certifikace ziskové strategie.
Zdrojová místa: lib/picks/strategyHub.ts, lib/picks/modelLab.ts,
lib/picks/pressurePerformance.ts, AutonomousTipSnapshot, FixturePrediction,
IntuitionTicket/IntuitionTicketLeg a uložený ApiCache pressure-performance:v5:report:1.
