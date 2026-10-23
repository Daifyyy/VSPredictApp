# Vývojové porovnání BASE / ADVANCED proti hlavnímu modelu

Stav: **EXPLORATORY_ONLY, žádná aktivace**. Offline 23. 10. 2026.

## Výsledek

Stejných 597 out-of-fold validačních zápasů pro všechny varianty každého trhu:

| Trh | Varianta | Log-loss (nižší je lepší) | Brier (nižší je lepší) | Klasifikační úspěšnost |
|---|---|---:|---:|---:|
| 1X2 | Hlavní model, rekonstrukce | 1,00260 | 0,59650 | 52,60 % |
| 1X2 | Ligový základ | 1,07435 | 0,64993 | 44,05 % |
| 1X2 | BASE regrese | 1,06973 | 0,63931 | 45,90 % |
| 1X2 | ADVANCED regrese | 1,17150 | 0,68422 | 43,22 % |
| Over 2,5 | Hlavní model, rekonstrukce | 0,68299 | 0,24514 | 54,27 % |
| Over 2,5 | Ligový základ | 0,69130 | 0,24907 | 51,59 % |
| Over 2,5 | BASE regrese | 0,69411 | 0,25046 | 53,77 % |
| Over 2,5 | ADVANCED regrese | 0,72820 | 0,26445 | 53,27 % |

ADVANCED má proti BASE o 9,51 % horší log-loss u 1X2 a o 4,91 % horší u Overu.
Zhoršení je ve všech třech validačních úsecích obou trhů. Hlavní rekonstruovaný
model má v tomto porovnání nejnižší agregovaný log-loss i Brier u obou trhů.
To není důkaz ziskovosti hlavního modelu, pouze relativní výsledek v této kohortě.

1X2 BASE i ADVANCED překračují toleranci 2% zhoršení proti hlavnímu benchmarku
ve všech pěti ligových segmentech s alespoň 100 zápasy. U Overu jsou segmenty
smíšené; celkový přínos kandidátů se nepotvrdil. ADVANCED má ECE 1X2 po třídách
0,129 / 0,132 / 0,084 a Over přibližně 0,127. Žádná nová kalibrace nebyla fitována.

Úspěšnost je argmax 1X2 / binární klasifikace Over-Under všech validačních zápasů,
**nikoli úspěšnost kvalifikovaných sázek na Over**. Nenahrazuje ROI, které zde
nelze vypočítat. Brier u binárního a tříkategoriálního trhu má jinou konvenci;
ani log-loss obou trhů se mezi sebou nesrovnává přímo.

## Protokol stanovený před spuštěním

- Pouze řádky ADVANCED z opraveného datasetu, nejpozději 19. 4. 2026.
- Shodné trénovací i validační fixture pro BASE a ADVANCED.
- BASE: skupina 1 včetně příslušných missing indikátorů. ADVANCED: všech 208
  sloupců. Žádné dodatečné hledání podmnožiny features.
- Logistická / multinomická regrese, C=1, standardizace a imputace fitované
  výhradně na tréninku. Bez CatBoost gridu, bez hledání nejlepší regularizace.
- Tři expanding foldy: trénink do 16. 1., 14. 2., 13. 3. 2026; validace do
  14. 2., 13. 3., 19. 4. 2026. Počty train/validation: 666/218, 884/170, 1054/209.
- Dva trhy × dvě varianty × tři foldy = 12 fitů. Žádné fitování finálního
  artefaktu, žádný výběr vítěze pro produkci.

První dva tréninky jsou pod původním minimem 1 000. Toto je **explicitně oddělený
vývojový experiment**, nikoli snížení aktivačního minima. Původní datový soubor
zůstává `trainingAllowed:false`; runner vytvoří nový, hashovaný development-only
kontrakt `EXPLORATORY_PAIRED_PROFILES`, který nic neaktivuje. Původní pilot a jeho
trainer se nemění. Kalibrační a terminal řádky se nedostanou do nové matice.

## Co se podařilo dohledat lokálně

Prohledány názvy inventářů a lokálních JSON exportů `.cache` / `.runtime`
(bez Python prostředí), struktura `UNIQUE_SEASON_RESULTS` a `SEASON_PHASE_AUDIT`.
Tyto dva dodatečné audity obsahují souhrny, nikoli chybějící per-fixture ověření
sezony 2024. Žádný nový ověřený inventář 2024 v tomto rozsahu nalezen nebyl.
Neověřené řádky 2024 proto nebyly přimíchány do fitu. Dřívější audit archivů
zůstává platný; existence statistik sama není důkazem regular-season FT.

## Interpretace a další rozhodnutí

U této konkrétní regrese přidání všech pokročilých sloupců nepomohlo. Malý vzorek
a mnoho korelovaných vstupů jsou možná vysvětlení, nikoli prokázaná příčina.
Výsledek nezamítá všechny možné nelineární modely nebo jiné předem stanovené
reprezentace. Zároveň neopravňuje zkoušet nastavení donekonečna až vyjde zisk.

Nyní nic nepřepínat do produkce. Uchovat hlavní model jako benchmark a tento
neúspěšný experiment jako důkaz. Další zásadní přínos očekáváme od ověření a
rozšíření podkladů a nového časového ověření, nikoli od prezentace této historie
jako nezávislého testu. Bez doložených cen zůstávají ROI a CLV nevyhodnotitelné.

## Reprodukce a výkon

```powershell
.runtime/ai-python/Scripts/python.exe -m unittest discover -s research/ai -p test_explore_profiles.py
.runtime/ai-python/Scripts/python.exe research/ai/explore_profiles.py
```

Výchozí vstup spouští externě hlídaný worker. Nepoužívat `--worker` ručně.
Limity: 12 fitů, 10 minut, 2 thready, souhrnná RSS rodiče a workeru 4 GiB,
nejméně 2 GiB volné RAM, výstupní cache 128 MiB. Existující run se nepřepisuje.
Částečné výsledky zůstávají při přerušení. Worker nedostává DB/API tajné proměnné.

Ověřený běh: 12 fitů, worker s dohledem 6,44 s, maximum sledované RSS 444 817 408 B
(přibližně 424 MiB), DB/provider volání 0. Nejde o benchmark produkčního cronu.
Nevznikl žádný exportovatelný modelový artefakt, migrace ani cloudový deployment.

Výstupy a provenance:
`.runtime/ai-profile-exploration/c7341d5d400bb820a3cc0026cef451e3abb01ad59bdcfe093beb6585b8b4a993/`.
`report.json` obsahuje společná fixture ID, foldy, segmenty a kalibrační tabulky.
`telemetry.json` obsahuje naměřené prostředky, `provenance.json` hashe a protokol.

Testy ověřují zákaz kalibračních/terminal řádků, shodnou kohortu, oddělení foldů,
nezměněný rodičovský dataset a nezávislost development matice na pozdějších labelech.
