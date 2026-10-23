# Další AI experiment: připravenost a protokol srovnání

Stav 23. 10. 2026: **BLOCKED_DATA / protokol je návrh, není uzamčený**.
Neproběhl nový fit, aktivace, export z DB ani změna ostrých strategií.

## Co jsme ověřili

Reprodukovatelná lokální kontrola:

```powershell
node --import tsx scripts/checkAIExperimentReadiness.ts
npx vitest run lib/picks/aiExperimentReadiness.test.ts
```

Skript ověřuje hash opraveného datasetu a všech jeho zdrojů. Nečte nové výsledky,
netrénuje a nevolá databázi. Počítá dostupnost profilů ve stejných celodenních
oddílech jako původní pilot; hranice neposouvá podle toho, kde vyjde více dat.
Zůstává samostatným offline preflightem, není zapojen do produkčního cronu ani
do starého traineru. Jeho průchod sám nikdy neschvaluje nový model.

| Oddíl | Všechny zápasy | Použitelný BASE | Společná ADVANCED kohorta |
|---|---:|---:|---:|
| První trénink, 23. 8. 2025 – 16. 1. 2026 | 1 470 | 1 470 | 666 |
| Celý vývoj, do 19. 4. 2026 | 2 773 | 2 765 | 1 263 |
| Původní kalibrace, 20. 4. – 17. 5. 2026 | 370 | 370 | 214 |
| Již prohlédnutý terminal, 18. 5. – 19. 9. 2026 | 498 | 423 | 33 |

BASE obsahuje i zápasy s ADVANCED podklady. Pro měření přínosu pokročilých features
musí obě varianty použít identické řádky ADVANCED kohorty; porovnat 423 základních
proti 33 pokročilým zápasům by nebyl čistý test přínosu features.

**Vysoké datové riziko:** ADVANCED nesplňuje původní minimum 1 000 pro první trénink
a 200 pro terminal. Starý terminal je navíc již prohlédnutý. Jeho převzorkování,
nové pojmenování či přesun hranic z něj neudělá nezávislý test. Tyto počty nic
neříkají o budoucí ziskovosti ani neprokazují, že advanced model nemůže fungovat.

V `.cache/backtest` jsou statistiky jen pěti lig (39, 61, 78, 135, 140), sezony
2024/2025. Současný ověřený dataset používá sezonu 2025; nemá spárované ověřené
inventáře 2024 a nemá statistiky 2026. Starší soubory 2024 nelze automaticky
přidat bez kontroly identit, výsledků a časové dostupnosti. Ostatní lokální soubory
byly pro tuto kontrolu pouze vyjmenovány, nikoli schváleny jako zdroje.
O aktuálním obsahu Neonu tento audit nic netvrdí.

Výstup: `.runtime/ai-quality-v2/44716c07dcf5bccb0f393bd1385b1f4ae59dea0e4e390912b6f0a1a1c14e6118.preflight.json`.
Lokálně načteno 29,34 MB, běh přibližně 0,50 s; DB/provider volání 0.
Jedná se o čtení z disku, nikoli Neon přenos.

## Pevná pravidla dalšího srovnání

1. Historie použitá v dosavadních auditech je explorativní. `knownThrough` musí
   zahrnout všechna dříve zkoumaná období, ne pouze konec tohoto datasetu.
2. Po ověření podkladů uzamknout kód, hash zdrojů, quality policy, kandidáty,
   limity a celé kalendářní oddíly. Nová kalibrace i nový terminal začnou až po
   uzamčení a po posledním známém/prohlédnutém dni. Nyní jim nevymýšlíme data.
3. Ve vývoji porovnat pro oba trhy ligový základ, rekonstruovaný hlavní gólový
   model, BASE a ADVANCED. BASE versus ADVANCED vždy na stejné kohortě. Vedlejší
   report BASE na všech způsobilých zápasech označit jako jinou populaci.
4. Zachovat původní limity 80 fitů / 90 minut / 2 thready / 4 GB RSS. Výběr
   konfigurací a ablace musí mít před spuštěním explicitní rozpis fitů; nesmí
   se zdvojnásobit grid pouze proto, že přibyly dvě vstupní větve.
5. Regrese je jednodušší baseline, CatBoost kandidát. Vítěze vybrat pouze podle
   vývoje; stejná původní log-loss/Brier/ECE a segmentová kritéria. Nevybírat
   podle nejlepší retrospektivní ROI. Maximálně jeden kandidát pro nový terminal.
6. Měřit pokrytí programu i kvalitu. Neúspěch ADVANCED při nedostatku dat
   označit `INSUFFICIENT_DATA`, ne vydávat za důkaz superiority BASE.
7. Bez doložených předzápasových cen zůstane ROI/CLV nevyhodnotitelné. Původní
   Over je selekční politika nad hlavní pravděpodobností, nikoli další nezávislý
   predikční model. Jeho případné sázkové porovnání musí zachovat cenu a policy.
8. Nové skutečně zmrazené benchmarky oddělit od rekonstruovaných. Čas výkopu
   nenahrazuje důkaz dostupnosti zdrojových statistik. Neutralitu hřiště ověřit;
   neznámé případy nesmějí automaticky projít vstupní branou.

`checkExperimentWindow` testuje nepřekrytí oddílů a čas uzamčení. Je to nutná,
nikoli postačující podmínka: neověřuje pravdivost deklarovaného `knownThrough`,
provenanci zdrojů ani kvalitu natrénovaného modelu. Ukázková data v unit testech
nejsou schválený harmonogram experimentu.

## Nejmenší další sběr podkladů

Nejdříve ověřit aktuální zbývající Neon přenos/compute; bez odečtu export zůstává
vypnutý. Poté připravit read-only kontrolu podle indexovaných identit pro pět lig
se stávající statistikou, nikoli plošný dump DB. Zjistit, zda jsou v DB dokončené
zápasy a statistiky chybějícího období. Samotné chybějící soubory nejsou důkazem,
že chybí provider data.

Případný explicitně povolený export musí mít projekci: fixture/ligu/sezonu,
týmy, výkop, FT výsledek, neutrální hřiště pokud evidováno, příslušné statistiky
obou týmů a skutečně dostupné timestampy/provenanci. Neexportovat celé predikční
snapshoty, kurzové časové řady ani jiné osobní či nesouvisející údaje.

Navržený první limit exportu je nejvýše 5 000 záznamů a 5 MB výstupu; není to
garance účtovaného přenosu. Předem ověřit plán dotazu a rezervu, nepouštět export
při každém pokusu o trénink a nepřenášet jej do cloudu. Pokud data v DB nejsou,
neprovádět automatický provider backfill. Rozhodnout mezi omezeným BASE výzkumem
a čekáním na řádně sbírané statistiky.

Současná změna používá pouze lokální soubory, bez cloudového přesunu nákladů.
Pokračování vyžadující export nebo jiný náklad zůstává oddělené od této kontroly.
