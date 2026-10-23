# Rozšířená historie 2024: stejné modely, stejné validační zápasy

Výsledek: **explorativní, bez aktivace**. Žádná nová provider volání ani Neon dotazy.

## Co se změnilo

Ověřená sezona 2024 doplnila historii pěti lig. Byla znovu vypočtena celá vstupní
matice i hlavní gólový a ligový benchmark, nikoli převzaty staré pravděpodobnosti.
Použita stejná metoda jako v původní rekonstrukci hlavního modelu, včetně aktuálního
jádra, ratingů, stabilizovaných sezonních základů a historicky dostupných xG.
Nejde o přesně zmrazené produkční prognózy ani o přepočet produkčních tipů.

Datový build obsahuje 2 951 předzápasových řádků do 19. 4. 2026; 2 775 má profil
ADVANCED. Warmup a freshness pravidla zůstala stejná. Počty train/validation:

| Fold | Původní train | Rozšířený train | Stejná validace |
|---|---:|---:|---:|
| 1 | 666 | 2 178 | 218 |
| 2 | 884 | 2 396 | 170 |
| 3 | 1 054 | 2 566 | 209 |

Přesná ID všech 597 validačních zápasů jsou stejná jako v předchozím běhu a shodná
pro všechny varianty obou trhů. Hodnocená kohorta se neposunula podle výsledků.
Historie a vstupy se změnily u všech variant; srovnání neizoluje pouze počet
trénovacích řádků od vlivu delší historie na feature agregáty.

## Výsledky

Nižší log-loss a Brier znamenají lepší pravděpodobnostní prognózy.

| Trh | Model | Log-loss | Brier | Klasifikační úspěšnost |
|---|---|---:|---:|---:|
| 1X2 | Hlavní benchmark | 0,99771 | 0,59457 | 51,93 % |
| 1X2 | Ligový základ | 1,07262 | 0,64852 | 44,05 % |
| 1X2 | BASE regrese | 1,02146 | 0,61044 | 49,41 % |
| 1X2 | ADVANCED regrese | 1,03971 | 0,61968 | 48,91 % |
| Over/Under 2,5 | Hlavní benchmark | 0,68376 | 0,24550 | 53,10 % |
| Over/Under 2,5 | Ligový základ | 0,68988 | 0,24838 | 51,42 % |
| Over/Under 2,5 | BASE regrese | 0,68004 | 0,24372 | 54,94 % |
| Over/Under 2,5 | ADVANCED regrese | 0,68466 | 0,24621 | 54,94 % |

BASE Over má proti přepočtenému hlavnímu benchmarku přibližně **0,54 % relativně
lepší log-loss**, lepší Brier a ECE přibližně 0,029. Vyhrává ve dvou ze tří foldů;
v žádném ligovém segmentu s alespoň 100 zápasy nepřekračuje toleranci 2% zhoršení.
Přesto nesplňuje minimální 1% zlepšení z původní výzkumné brány. Navíc neexistuje
nový nezávislý test. Neoznačovat jako schválený model nebo doloženou edge.

U 1X2 vede hlavní model ve všech třech foldech. ADVANCED má proti BASE celkově
o 1,79 % horší log-loss u 1X2 a o 0,68 % horší u Overu. U Overu je lepší než BASE
jen ve třetím foldu; ligové segmenty Francie a Itálie překračují 2% toleranci proti
hlavnímu benchmarku. To není stabilní argument pro zapojení všech advanced features.

Delší historie zlepšila obě regrese proti jejich dřívějším variantám: například
ADVANCED 1X2 log-loss 1,17150 → 1,03971 a ADVANCED Over 0,72820 → 0,68466.
Výsledek podporuje význam kvalitní historie, ne tvrzení, že více features samo
o sobě zaručí výhodu. Hlavnímu modelu se 1X2 log-loss zlepšil, u Overu mírně zhoršil.

Úspěšnost je klasifikace všech 597 zápasů (u Overu obě třídy), **ne úspěšnost
publikovaných sázek**. ROI/CLV zůstávají nedostupné bez historických realizovatelných
cen. Výsledky obou trhů nelze srovnávat přímo podle velikosti log-loss/Brier.

## Protokol a ochrany

- Pevná regrese C=1, stejné features, 3 stejné časové foldy, 12 fitů; žádný nový grid,
  výběr features, kalibrace nebo export modelu. Zachován seed a train-only scaler/imputer.
- Chronologický builder používá pouze minulost před UTC dnem a s >3h odstupem.
  Všechny cílové řádky končí nejpozději 19. 4. 2026; původní kalibrace/terminal se
  nehodnotí. Dnešní ověření FT nenahrazuje tehdejší timestamp publikace statistik.
- BASE i ADVANCED se trénují na stejné ADVANCED kohortě; hlavní benchmark je
  deterministická historická rekonstrukce, nikoli další fit stejné regrese.
- Změněná matice má vlastní hash a `trainingAllowed:false`. Výhradně nový
  `EXPLORATORY_EXPANDED_PAIRED_PROFILES` runner tvoří development-only fit kontrakt.
  Původní datasety, piloty, crony, ledger a produkční UI zůstávají nedotčené.
- Neznámé neutral venue a historické revize zdrojů zůstávají omezením. Metadata
  2024 jsou ověřena, ale nová prospektivní historie tím nevzniká.

## Ověření, výkon a reprodukce

Build: 14,84 s, 23,72 MB lokálního výstupu. Trénink s dohledem: 7,36 s,
12 fitů, maximum sledované souhrnné RSS 516 358 144 B (asi 492 MiB).
Limity runneru: 2 thready, 10 minut, 4 GiB RSS, 2 GiB volné RAM a 128 MiB cache.
Žádný přesun nákladů na cloud. DB/provider volání v této práci: 0/0.

```powershell
node --import tsx scripts/buildAIExpandedDataset.ts
.runtime/ai-python/Scripts/python.exe research/ai/explore_expanded_profiles.py
.runtime/ai-python/Scripts/python.exe -m unittest discover -s research/ai -p test_*.py
```

Existující trénovací run se nepřepisuje. Build ověřuje hash předchozího auditu
a každého vstupního souboru; změněné zdroje vyžadují nový audit. Žádné argumenty
pro tiché přeladění. Nevolat worker přímo.

Dataset:
`.runtime/ai-expanded-development/804ce78706a7c4151743d05d5d4ae6d9d59f00b890c6593f9d4ac60b7b0c65f1.dataset.json`.

Výsledky, společné validační ID, segmenty, kalibrace a telemetry:
`.runtime/ai-expanded-exploration/5fbaea2095ca76b0f75aacb509322a62e97d3be3f4026b5723bc8080509c7077/`.

Prošlo 16 Python testů včetně ochrany společné kohorty, budoucích labelů a zákazu
kalibračních/terminal řádků. Typecheck a lint nového builderu prošly. Integritní
kontrola ověřila unikátní fixture, cutoffy, platné pravděpodobnosti a shodu cílů
se starým datasetem na společných řádcích. Nový build aplikace nebyl potřeba:
produkční kód se neměnil a build by zbytečně mohl zkoušet číst DB.

## Doporučení

Nic nepřepínat do produkce. BASE Over ponechat jako slabý vývojový kandidát,
nikoli automaticky povýšit. U 1X2 zůstává hlavní model benchmarkem, který musí
budoucí kandidát překonat. Pro další závěr potřebujeme předem uzamčené nové
časové ověření; ne další přejmenování už prohlédnutého terminalu.
