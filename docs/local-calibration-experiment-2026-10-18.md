# Malý kalibrační experiment – pouze lokální vývoj

## Rozhodnutí

Nenasazovat kalibraci do tipů. Over ukázal mírné bodové zlepšení, ale interval
obsahuje nulu a vítězné parametry leží na hraně předem stanovené mřížky. Úprava
1X2 neprošla validační částí a zůstává beze změny. Žádný parametr nebyl zapsán
do databáze, konfigurace modelu ani produkčního artefaktu.

## Protokol před spuštěním

Zdroj: již vytvořený goals-only replay, varianta stabilized100, všech 465 stejných
zápasů. Rozdělení podle celých pražských herních dnů 60/20/20 %, nikoli podle
náhodných sázek. Fit pouze první část; druhá smí zvolit kandidáta nebo původní
model pro každý trh zvlášť. Minimální validační zlepšení log-loss 0,002.

- Over: logit(p)/T + b; T ∈ {0,8; 1; 1,2; 1,5; 2}, b ∈ {−0,2; −0,1; 0; 0,1; 0,2}.
- 1X2: jediná teplota stejné mřížky pro všechny tři pravděpodobnosti, renormalizace
  softmaxem; nefitovat tři nezávislé binární modely.
- Identita má přednost při shodě. Minimum 100/50/50 řádků v jednotlivých částech.
- Závěrečná část nesmí změnit parametry. Žádné adaptivní rozšiřování mřížky po výsledku.

Jde o **vývojový protokol nad již prohlédnutou minulostí**, nikoli nedotčený holdout
ani prospektivní předregistraci. Test kryje, že změna závěrečných výsledků nemění
fit ani validační výběr parametrů.

## Výsledek

| Část | Zápasy | Herní dny | Období 2026 |
|---|---:|---:|---|
| Fit | 218 | 26 | 25. 7.–1. 9. |
| Výběr | 96 | 9 | 2.–10. 9. |
| Závěrečné hodnocení | 151 | 9 | 11.–19. 9. |

Over: fit zvolil T=0,8, b=+0,2, validační zlepšení 0,02719. Na závěrečných
151 zápasech log-loss 0,68255 → 0,67788, Brier 0,24502 → 0,24250, ECE
0,07761 → 0,05865. Párový rozdíl log-loss −0,00467; blokový interval po dnech
−0,02097 až +0,00929. Devět dnů je malý vzorek. Oba parametry jsou na okraji
mřížky, takže nejde o doložené optimální nastavení.

1X2: fit preferoval T=0,8, ale validační log-loss se zhoršil o 0,00296.
Proto byl pro závěrečnou část zachován původní model (T=1).

Tyto výsledky nejsou důkazem zisku: chybí ceny, xG i úplný historický 1X2 market
benchmark. Zvlášť kalibrovaný Over a 1X2 nejsou nový společný gólový model.
Z ligových segmentů se dodatečně nevybírají ziskové výjimky.

## Reprodukce a kapacita

`node --import tsx scripts/runLocalCalibrationExperiment.ts .runtime/goal-benchmark/2026-10-18T13-05-25.353Z.json`

Vstup je explicitní lokální soubor s ověřeným hashem predikcí. Žádný automatický
export ani DB/API přístup. Výsledek je časově označený JSON v ignorované složce
`.runtime/local-calibration`. Běh přibližně 0,44 s. Nezvyšuje provozní cloudovou zátěž.

## Co ještě chybí

K 18. 10. 2026 16:37 UTC nebyl v posledních 12 hodinách vytvořen žádný nový
1X2 opening řádek, takže nové úplné audity zatím nelze provozně potvrdit. Poslední
zjištěné zápisy pozastavených strategií byly 15:59 UTC; od pozdější aktivace
nebyl pozorován nový sběr, ale bez dalšího kurzového běhu to není end-to-end test.

Vyčkat běžného sběru nových openingů, ověřit celé vektory a cenový původ. Poté
připravit společnou kohortu neměnných predikcí, oddělit modelové/kalibrační verze
a trh. Pro potvrzení kandidáta použít nové období nezahrnuté do ladění, nikoli
přeznačit tento zpětný experiment za nezávislý důkaz.
