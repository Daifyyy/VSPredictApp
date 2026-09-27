# Modely a strategie: společný přehled

## Co se měří

| Vrstva | Zdroj | Jednotka hodnocení | Význam |
| --- | --- | --- | --- |
| Hlavní model | `FixturePrediction` | předzápasová predikce | Pravděpodobnosti; nikoli automaticky sázka |
| Průběh v5 | `FixturePrediction.inputSnapshot.performancePressure` | zápas, kontext, artefakt, podtrh | Prospektivní log-loss/Brier všech zachycených predikcí |
| 1X2, Over, BTTS, rohy, karty, fauly | `AutonomousTipSnapshot` | kvalifikovaný singl, přesná policy/model/context/count verze | Simulace vkladu 1 jednotka, profit, ROI, CLV |
| Původní Over – historie | `OVER_25`, policy 1 | původně zachycené výběry | Neměnný archiv; neopakovat sběr pod starou identitou |
| Původní Over – nový research | `OVER_25_LEGACY_SHADOW`, policy 1 | nové kvalifikace na opravených podkladech | Původní brána, samostatný prospektivní začátek |
| Týmové góly / v5 research sázky | `MarketSignalSnapshot`, policy 3 / 501 | kvalifikovaný přesný trh | Nesměšovat nulový počet sázek s nulovým počtem predikcí |
| VALUE/ELO | `IntuitionTicket` a nohy | tiket nebo noha podle označení | Samostatná bilance na stránce strategií; přímé/syntetické ceny odděleně |
| Rychlé přehledy | vlastní publikační ledger | zveřejněný výběr | Oddělený publikační audit, ne další nezávislý model |

## Kde to najít

Predikce → Výkonnost modelů obsahuje společný přehled. Nahoře je přesnost v5, pod ní tabulka simulovaných sázek. Přepínač zpřístupňuje historické politiky. Technické metriky jsou v detailu. Provozní diagnostika zůstává v Řízení modelů; dnešní tipy na stránce strategií.

V5 používá `marketProbabilities`, nikoli zděděné v3 `shadowOver25`. Porovnání s hlavním modelem používá pouze společné řádky se skutečně zmrazeným benchmarkem. Nové snapshoty navíc ukládají hlavní BTTS. Chybějící historický benchmark se nedopočítává z λ. Kontexty a artefakty se neslučují.

## Společná logika a provoz

- `strategyCohort` určuje aktuální model/context/count verzi; v5 je model 5, nikoli verze hlavního modelu.
- `loadModelStrategyLedger` načítá zdroje dávkově pro Model Lab a monitoring, zahrnuje settlement faulů a CLV auditní pole. Týmové politiky 1/2/3 a research 501 jsou oddělené.
- `ledgerClv` počítá ekonomické CLV z uložené sázkové ceny; změna knihy neprojde same-book bránou.
- Nesoulad identity zápasu nevymaže původní prohru. Řádek má varování a neslouží k potvrzení kalibrace/CLV.
- `monitorModelLab` aktualizuje malé souhrny v `ModelStrategyMetricSnapshot` a v5 report v `ApiCache`. Běží v existujícím `audit-pipeline`, ne při otevření stránky.
- Veřejné GET vrací pouze souhrny. Detailní ledger vyžaduje PRO. GET neprovádí inference, trénink ani zápis do databáze.
- Research původního Overu nepatří do Denního výběru, push notifikací, běžných tipů ani prioritní kurzové fronty. Používá existující kurzový průchod a settlement. Nevytváří provider volání navíc.
- Již kvalifikovaný autonomní řádek nepřepíše ani souběžný sběr. Staré predikce a hotové průběhové audity zůstávají neměnné.

## Nasazení

Databázová migrace není potřeba. Po nasazení:

1. Pro sběr v5 ponechat `PRESSURE_V5_ENABLED=true` (výchozí stav je zapnuto). Nezapínat kvůli tomu `PRESSURE_V5_OPPORTUNITIES_ENABLED` ani Telegram.
2. Spustit zabezpečený `predict-upcoming` pro dosud nezachycené budoucí zápasy. Existující snapshoty se nepřepisují.
3. Existující `snapshot-odds` začne zachycovat také research původního Overu. Výsledky doplňuje `settle-results`.
4. Spustit `audit-pipeline` pro první nové přehledové souhrny. Do té doby UI poctivě ukazuje „čeká na souhrn“, nikoli domnělou nulovou bilanci.
5. Zkontrolovat předvýkopový čas v5, oddělené kontexty, aktualizaci souhrnu, v5 výsledky a archiv původního Overu.

Zapnutý sběr není potvrzení edge. Reporty při 50/100/200 dokončených zápasech jsou podkladem pro ruční rozhodnutí; žádná strategie se nepovyšuje automaticky.
