# Model proti uloženému opening trhu

## Rozhodnutí

Žádná nová aktivace ani kalibrační zásah na základě tohoto auditu. Na ligových
signálech modelu 7 vychází trh bodově lépe než model. Ziskovost samostatného filtru
je jiná otázka: tento výsledek není ROI konkrétních strategií ani všech tipů.

| Kohorta | N | Model log-loss ↓ | Trh log-loss ↓ | Rozdíl model minus trh |
|---|---:|---:|---:|---:|
| Over 2,5, LEAGUE, model 7, kontext 1, policy 1 | 754 | 0,66767 | 0,65677 | +0,01090 |
| Vybraná strana 1X2, stejné verze | 754 | 0,66503 | 0,65077 | +0,01425 |

Párové intervaly po 45 celých pražských dnech: Over −0,00202 až +0,02523;
1X2 vybraná strana +0,00011 až +0,02953. Jde o popisné intervaly po prohlédnutí
více kohort, bez korekce vícenásobného testování. Těsně kladnou hranici 1X2
nepřeceňovat. Evropa, starší model a kontextové verze jsou v JSON oddělené.

## Co skutečně porovnáváme

Zdrojem je lokální export `.runtime/strategy-audit/evidence.json`, stav
**13. 10. 2026 18:44 UTC**, nikoli dnešní produkční bilance. Z 1 980 signal řádků
Over/1X2 bylo způsobilých 1 824 napříč oddělenými kohortami. Model a trh vždy
používají identické řádky. Neukládáme nuly místo chybějících výsledků.

Over ledger někdy ukládá UNDER; obě pravděpodobnosti se pak převádějí doplňkem
na OVER. Pro binární trh je to úplná informace. U 1X2 není doplněk pravděpodobnosti
vybrané strany rozdělením zbývajících dvou výsledků: zde jde pouze o binární
diagnostiku vybrané strany, **nikoli celé 1X2**.

Kontroly: unikátní fixture/market/policy, předvýkopový čas zachycení, dokončený
regulérní zápas FT, celočíselné nezáporné skóre, platné pravděpodobnosti, přesná
strana a linie, oddělení modelových a kontextových verzí. Budoucí zápas není chyba
dat a je evidován samostatně. Odložené/neuzavřené zápasy se nepočítají jako prohra.

## Mezery a důsledky

1. **Vysoká závažnost:** `MarketSignalSnapshot` drží jedinou stranu 1X2. Chybí
   neměnný celý modelový a tržní vektor ve stejném okamžiku. Nelze nyní spočítat
   plný předvýkopový multinomický benchmark z tohoto ledgeru.
2. **Vysoká závažnost:** starší signály nemají úplný zdrojový audit surových kurzů,
   bookmakera a identit týmů. Výsledky jsou diagnostické, nikoli validační brána.
3. `FixturePrediction` má celé rozdělení, ale `upsertPrediction` aktualizuje
   modelová pole i predictedAt. Samotná existence hodnot neprokazuje shodu s časem
   opening signálu. Aktuální `reprice --apply` historické přepisování zakazuje;
   tento audit netvrdí, že byl konkrétní historický zápas přepsán.
4. Doplnění aktuálního vektoru do starého ledgeru by vytvořilo falešnou historii.
   Nedělat zpětné povýšení ani fitování pouze na ziskových vybraných sázkách.

## Bezpečné pokračování

Nejmenší potřebná změna je prospektivně zmrazit celý modelový a tržní vektor při
prvním existujícím opening zápisu spolu s identitami, časem a verzemi. Zachytávat
všechny způsobilé prognózy, nikoli jen kvalifikované tipy. Žádná nová API volání;
jen několik skalárních hodnot v existujícím ledgeru. Staré řádky ponechat null.
Před implementací zvolit aditivní schéma a pokrýt neměnnost, souběh a cenový zdroj.

Poté předem oddělit vývojové období a nové potvrzovací období. Malá kalibrace Overu
a 1X2 se bude posuzovat samostatně proti původnímu modelu i trhu. Nové období nesmí
sloužit zároveň pro výběr parametrů a závěrečné potvrzení. Do té doby zachovat
experimentální označení a nepřidávat automaticky nové tipy.

## Reprodukce

`node --import tsx scripts/auditFrozenMarkets.ts`

Žádná databáze, provider ani produkční zápis. Výstupy mají jedinečný časový název
v `.runtime/frozen-market-audit` a obsahují cutoff, hash zdroje, vyřazení i kohorty.
Zdroj SHA256: `46bf4c0133d233bda05580718355cf939fa039005c16aa3eb9052bcdada2a152`.
