# Společný benchmark Overu a 1X2 – 18. 10. 2026

## Závěr

Zatím není podklad pro plošnou výměnu modelu. Stabilizace sezonního průměru
v tomto gólovém replayi zlepšila bodové hodnocení 1X2, nikoli Overu. Rozdíly
proti původnímu přepínání sezonního průměru nejsou průkazné. Ziskovost nebyla měřena.

| Varianta | Over log-loss ↓ | 1X2 log-loss ↓ | 1X2 správný nejpravděpodobnější výsledek |
|---|---:|---:|---:|
| Přepnutí sezonního průměru při 20 zápasech | 0,66869 | 0,99167 | 50,32 % |
| Stabilizace s předchozí sezonou, prior 100 | 0,67370 | 0,98676 | 51,40 % |
| Průběžná historická ligová četnost | 0,67599 | 1,08230 | 41,94 % |

Všechny řádky používají přesně stejných 465 zápasů. 1X2 loss zahrnuje domácí,
remízu i hosty; nejde o hodnocení pouze vybraných sázek. Brier pro 1X2 je součet
tří kvadratických chyb, bez dělení třemi.

Párový bootstrap 2 000 opakování po celých pražských dnech (44 dní), rozdíl
stabilizované varianty minus původní: Over +0,00501, interval −0,00397 až +0,01361;
1X2 −0,00491, interval −0,01329 až +0,00345. Oba intervaly obsahují nulu.
Proti ligové četnosti má stabilizované 1X2 rozdíl −0,09553, interval
−0,14084 až −0,06127. Lepší než prostá četnost neznamená lepší než sázkový trh.

## Data, kvalita a omezení

- 22 lokálních sezonních soupisů, 11 lig; 4 316 unikátních dokončených zápasů
  v historii. Hodnocené zápasy 25. 7. až 19. 9. 2026, cutoff 20. 9. 2026.
- 615 cílových zápasů, 150 vynecháno pro nedostatečné týmové podklady;
  vyhodnoceno 465 (75,61 %). Závěry nelze automaticky přenést na nováčky a malé vzorky.
- Kontroly hashů, ligy/sezony, počtu řádků, unikátních fixture, skóre a pravděpodobností.
  Nula porušení časové hranice v zaznamenaných počátcích replaye.
- Vstupy pouze před půlnocí UTC daného dne a s rezervou tří hodin od výkopu.
  Skutečný čas dostupnosti historických oprav dat není doložen.
- Záměrně BEZ xG a bez kurzů. Toto je diagnostika gólového jádra,
  nikoli plnohodnotný audit dnešního produkčního modelu ani původní Over policy.
- Používá dnešní kód a parametry nad rekonstruovanou minulostí. Období již bylo
  zkoumáno: není nedotčeným holdoutem. Výsledky staršího xG replaye s ním neslučovat.
- Ligové segmenty mají jen 24–66 zápasů. Výsledky jsou heterogenní; například
  Over delta v Eredivisie +0,02546 proti Ligue 1 −0,01576. Bez dodatečných
  potvrzovacích dat z toho netvořit ligové filtry ani dodatečně vybírat vítěze.

## Reprodukce a kapacita

`node --import tsx scripts/replayGoalBenchmark.ts`

Čte pouze `.cache/season-inventories`, výsledky ukládá s jedinečným časem do
`.runtime/goal-benchmark`. Obě složky zůstávají mimo git/deployment. Skript nečte
env, nemá DB klienta, nevolá poskytovatele a nic neaktivuje.
První běh: přibližně 3 sekundy, RSS 174 MB; 0 DB dotazů a 0 API volání.

Dataset SHA256: `f0f6a30f05ea198c868aed4699b2ca1af7ded4fceabf9d1e97fd8028e60ed2b1`

Forecast SHA256: `2dd61c74b16d865d49aae363ec55f3ea4177e27c3b6ed41f921733fb0ebbce0f`

## Následující rozhodovací krok

Zachovat produkční pravidla. Pro malý kalibrační challenger nejdřív připravit
úplnou společnou kohortu zmrazených předvýkopových pravděpodobností a přesně
odpovídajících opening kurzů; vyčíslit chybějící párování. Vybrané singlové ledgery
nejsou náhradou všech predikcí. Před fitováním uzamknout časové rozdělení a
toleranci; již prohlédnuté období použít jen pro vývoj. Ověření na novém období
musí zahrnout trh, kalibraci, nejistotu, segmenty a realizovatelné ceny. Do té doby
žádná aktivace nových tipů, automatické povýšení ani tvrzení o ziskovosti.
