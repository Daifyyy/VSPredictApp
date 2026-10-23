# Audit dat, hlavního modelu a původního Overu

## Závěr

Nejdřív je potřeba opravit definici dostupnosti/čerstvosti výzkumných vstupů, nikoli
zvětšovat AI nebo hledat dodatečný ziskový filtr. Původní Over a přísnější Over nejsou
dva predikční modely. Používají stejný gólový výpočet a liší se výběrovou politikou.
Archivní zisk původní politiky je skutečný výsledek simulace uložených sázek, ale
zatím není důkaz stabilní budoucí výhody.

Audit používá lokální exporty, **nikoli dnešní stav produkce**:

- Historická modelová rekonstrukce: 3 641 zápasů, 23. 8. 2025 – 19. 9. 2026.
- Autonomní ledger: odečet 18. 10. 2026 12:35 UTC.
- Starší market-signal export: odečet 13. 10. 2026 18:44 UTC.
- Žádné nové provider/DB volání, změna strategií, trénink ani migrace.

## 1. Datová integrita prošla, úplnost a čerstvost nikoli

Kontrola hashů, unikátních fixture, výsledků FT, rozměrů matice, konečných čísel,
časového odstupu historie a shody cílů s inventářem nezjistila rozpor. Nebyla nalezena
duplicitní fixture, nekonzistentní výsledek ani nemožný vztah SOT/box > celkové střely
v kontrolovaných zdrojových statistikách. To neprokazuje původní čas zveřejnění dat
ani správnost providerových stran; source statistiky nemají vlastní team-ID/timestamp.

### Vysoká závažnost: rozsah dostupných pokročilých dat

Z 3 641 predikovaných zápasů má historické xG a střely pro oba týmy **1 676 (46,0 %)**.
U 1 961 zápasů chybějí u obou; čtyři mají jednostranné pokrytí. Průměrné pokrytí všech
features je 64,7 %. Stejných 1 676 zápasů splňuje 75% coverage požadavek research selektoru.

Pokročilé lokální statistiky pokrývají ligy 39, 61, 78, 135 a 140. Pro ligy 40, 88, 94,
144, 203 a 345 je xG pokrytí obou týmů nulové. Jde o **obsah lokálních exportů**, nikoli
důkaz, že provider nebo produkční DB tyto hodnoty vůbec nemá. Nelze z toho vyvozovat,
že dodatečné střelecké features obecně nefungují.

### Vysoká závažnost: stará hodnota se stále počítá jako dostupná

| Část rekonstrukce | Týmové xG profily | Poslední pozorování >60 dní | Nejvyšší stáří |
|---|---:|---:|---:|
| Vývoj | 2 526 | 0 | 28,2 dne |
| Kalibrace | 428 | 0 | 12,2 dne |
| Již prohlédnutý terminal | 402 | 336 (83,6 %) | 131,2 dne |

To jsou **týmové profily**, ne počty zápasů. Stáří se měří k předzápasovému cutoffu,
ne k dnešku. Práh 60 dní je diagnostický řez, nikoli nově optimalizovaná publikační brána.

Zdrojové advanced-stat exporty jsou pro sezonu 2025. Při chybějících novějších metrikách
`AIFeatureBuilder` uchovává předchozí hodnotu; coverage posuzuje její nenulovost, ne stáří.
Nová gólová historie tedy může růst, zatímco xG/střelecký profil zůstává z minulé sezony.
To je doložený problém datového kontraktu výzkumného builderu, ne doložená závada všech
produkčních modelů.

**Důležitá hranice:** vítězný AI kandidát pokročilé skupiny neponechal. Nelze proto jeho
neúspěch automaticky připsat starému xG. Nález omezuje hlavně interpretaci ablačních
výsledků a důvěryhodnost coverage; příčinný dopad na výkonnost se teprve musí otestovat.

## 2. Původní Over versus přísnější výběr

Kód v `lib/data/autonomousPortfolioStore.ts` sestavuje `overInput` jednou a pro
`OVER_25_LEGACY_SHADOW` jej kopíruje. `lib/picks/autonomousPortfolio.ts` mění bránu:
původní politika vyžaduje readiness 6; přísnější vyžaduje 8 a omezuje edge na 12 p. b.
Obě používají stejnou `prediction.over25`, nikoli dvě nezávislé AI.

### Oddělené ligové kohorty, model 7 / context 1

Vklad 1 jednotka, původní uložená cena; jde o simulaci, ne skutečné uživatelské sázky.

| Kohorta | Výhry / tipy | Úspěšnost | Zisk | ROI | Herní dny |
|---|---:|---:|---:|---:|---:|
| Archiv původního Overu, policy 1 | 40/56 | 71,4 % | +8,54 u | +15,25 % | 17 |
| Přísnější Over, policy 2 | 5/9 | 55,6 % | −1,29 u | −14,33 % | 5 |
| Obnovená původní brána, samostatná policy 1 | 16/23 | 69,6 % | +2,17 u | +9,43 % | 5 |

Období se liší: archiv 22. 8.–20. 9., přísnější výběr 20. 9.–17. 10., obnovený
9.–17. 10. 2026. Nesmějí se slepit do jedné prospektivní kohorty nebo interpretovat
jako kauzální porovnání modelů. Šest dalších over záznamů nemělo ověřený FT výsledek.

Přímý průnik obnovené a přísnější politiky má **7 zápasů**, u všech totožný čas
kvalifikace a modelovou pravděpodobnost. Obě zde mají **4/7 výher a −0,98 u**.
Rozdíl celkové bilance proto vzniká výběrem různých zápasů/období, nikoli lepší
predikcí jedné politiky na stejném zápasu.

### Stabilita a tržní srovnání

- Archiv: poslední popisná část má 21 tipů a −2,05 u, přestože celá kohorta je zisková.
- Obnovená brána: posledních sedm tipů má −2,40 u; celý vzorek stále +2,17 u.
- 95% bootstrap ROI po UTC herních dnech: archiv přibližně −10,85 až +33,79 %;
  obnovená brána −54,86 až +40,77 %. U pouhých pěti dní je interval silně nestabilní.
- Na totožných 23 řádcích obnovené brány je log-loss modelu 0,6312, trhu 0,6200
  (nižší je lepší). Ziskový výběr tedy zatím nedokládá lepší pravděpodobnosti než trh.
- Dostupný primary price-CLV vzorek: archiv 1/56, přísnější 1/9, obnovený 3/23.
  Ani to není automaticky kvalitní PANEL/same-book validační kohorta.
- Export neobsahuje kompletní audit ceny a její původní timestamp. Úplná certifikace
  realizovatelnosti cen/chybných trhů proto není možná. Výsledky jsou ledger simulace.

V dřívějším market-signal exportu nebyl nalezen přesný časový protějšek těchto
kvalifikací (fixture/strana/model/context/čas). Není poctivé vydávat openingový signál
z jiného okamžiku za druhou současnou predikci hlavního modelu.

## 3. Kalibrace hlavního modelu: žádné plošné snížení

Na společných 498 zápasech již prohlédnutého terminalu rekonstruovaný hlavní model
odhadoval Over v průměru na **52,28 %**, skutečnost byla **60,44 %**. V této kohortě
tedy výskyt Overu podhodnocoval o 8,16 p. b., nikoli nadhodnocoval.

Naproti tomu ve vývojovém pásmu odhadů 60–70 % (356 zápasů) byl průměr 63,79 % a
skutečnost 59,55 %. V terminalu stejné pásmo (69 zápasů) mělo odhad 63,82 % a
skutečnost 69,57 %. Směr odchylky se mění. Dodatečné plošné násobení λ nebo odečtení
pravděpodobnosti podle jedné prohry není odůvodněné. Segmenty jsou diagnostické,
nikoli nové filtry vybrané k maximalizaci minulého ROI.

Hlavní 1X2 v této rekonstrukci má na všech 3 641 zápasech log-loss 1,0169 proti
ligovému základu 1,0852 a klasifikační úspěšnost 49,82 % proti 42,13 %. Na terminalu
je to 0,9910 proti 1,0790 a 51,61 % proti 42,57 %. Obsahuje tedy signál nad triviálním
ligovým základem. **To není srovnání s bookmakerem a neprokazuje ziskovost 1X2.**
Rekonstrukce současným jádrem není totožná s tehdejší zmrazenou produkční predikcí.

## Doporučené pořadí oprav (v tomto auditu neimplementováno)

1. U každé feature evidovat poslední pozorování, počet platných měření, stáří a sezonu.
   Oddělit `available` od `fresh`; coverage nesmí staré xG automaticky počítat jako
   plnohodnotný aktuální vstup. Sezonní přestávku a neúplnou soutěž přiznat.
2. Zavést dva předem určené režimy: gólový základ a kompletní pokročilý profil.
   Nevyplňovat šest lig nulovými či historicky neobnovovanými advanced statistikami
   a netvrdit přitom stejnou kvalitu vstupů jako u kompletního profilu.
3. Před dalším exportem nejprve ověřit, zda potřebné aktuálnější statistiky už nejsou
   v lokálních datech. Případný úzký Neon export navrhnout s počtem řádků a byte budgetem;
   nestahovat znovu celou DB ani provider historii.
4. Po opravě vstupního kontraktu uzamknout nový protokol a použít nové testovací období.
   Původní terminal zůstane explorativní; neopakovat jej jako nový důkaz. Jednoduchou
   kalibraci hlavního modelu porovnat s nezměněným modelem na stejných zápasech.
5. Původní Over ponechat jako oddělený neověřený výběr; pro rozhodnutí o sázení sbírat
   platnou cenu, kompletní trh a closing. Neoznačovat jej jako „jediný funkční model“.

Žádný z bodů neslibuje zisk. Tento audit neopravňoval přepis produkčních pravidel.

## Kontrolovatelnost

- Výpočet: `research/ai/audit_data_and_over.py`, standardní Python bez DB klienta.
- Testy: `python -m unittest discover -s research/ai -p test_data_audit.py` — 3 prošly.
- Notebook: `research/ai/data-audit.ipynb` (stejný výpočet, bez zdvojené logiky).
- Všechny tři kódové buňky notebooku byly spuštěny přes nbclient, bez chyb; uložené
  textové výstupy byly zkontrolovány. Spuštěná kopie je
  `.runtime/ai-data-audit/data-audit.executed.ipynb`. Vizuální kontrola v notebook GUI
  neproběhla; pro ni otevřít tuto kopii ve VS Code/Jupyter. Neobsahuje grafy.
- Finální JSON s hashi zdrojů a segmenty:
  `.runtime/ai-data-audit/5c1495cb8c53fd13df0985cc5bb44aec23f7923e31b2a427dd28e044ff851c39.json`.
- Mezikroky ve stejné dočasné složce nejsou finální audit. Jedna první kontrola timestampů
  porovnávala text místo časového okamžiku; byla opravena a pokryta regresním testem.
