# Telegram a AI: stav implementace 23. 10. 2026

## Hotová část

- `/tipy` čte denní projekci `telegram-current:v1:YYYY-MM-DD` z `ApiCache`.
- `/tipy over25` zahrnuje obnovenou identitu `OVER_25_LEGACY_SHADOW`, nikoli ukončenou v2.
- `/dalsi [strategie]` stránkuje po pěti; `/tipy` obnoví začátek seznamu.
- Autorizaci kontroluje webhook i obsluha těchto příkazů.
- Projekce vzniká po kontrole současné přímé ceny ve stávajícím `daily-selection`
  běhu. Nepoužívá limit pěti položek ani pořadí Denního výběru. Řazení je podle
  výkopu a stabilního ID, nejvýše tři na zdroj v první odpovědi.
- Čtení nepřepočítává predikce, nepřistupuje k providerovi a neskenuje historii.
- Odmítá cenu/projekci starší než 90 minut, budoucí timestamp a výkop bližší
  než 30 minut. Stejný fixture/trh sloučí s uvedením zdrojů.
- `/vyber`, původní bilance, ranní publikace a VALUE/ELO tikety zůstávají beze změny.
- Odpověď webhooku se ukládá před odesláním. Po nejasné chybě během odesílání
  zůstane `UNKNOWN`; nevznikne slepé automatické opakování. Selhání před
  odesláním lze bezpečně opakovat. Nový uživatelský příkaz má vlastní update ID.

## Nasazení této části

Není potřeba migrace. Po deployi musí být zapnuté
`DAILY_SELECTION_COLLECT_ENABLED=true` a musí úspěšně proběhnout existující
workflow `daily-selection` po 09:00 Praha (bez `dryRun` a bez `settle`). Běžný
workflow jej již volá po sběru kurzů/predikcích. Zachovat resource guardy.

Ověřit autorizovaným soukromým příkazem `/tipy` a `/tipy over25`. Prázdná
aktuální projekce znamená žádnou způsobilou příležitost; chybějící či stará
projekce se hlásí odlišně. Bez běhu se neukazují staré tipy jako aktuální.
Nejde o nové automatické intradenní hromadné zprávy; aktualizace jsou na požádání.

## AI část NENÍ dokončená

`/tipy ai` pouze pravdivě informuje o stavu. Není to dokončená distribuce modelu.
Přepínače AI nezapínat: chybí produkční predikční řetězec. Souhlas s research
režimem není statistické schválení ani důvod použít `parityOnly` v produkci.

Další práce v tomto pořadí:

1. Exportovat pevný BASE Over logistic C=1 z povolené vývojové kohorty.
   Samostatná identita `MANUAL_RESEARCH`, cutoff/hash, bez označení schválené edge.
   Původní 1% bránu nepřepisovat. Zamítnutý starší CatBoost nepoužívat.
2. Ověřit produkční návaznost historie. Elo a ligové agregáty vyžadují stejný
   počáteční rozsah jako trénink; nelze je nahradit libovolnými posledními zápasy.
   Kontrolovat dostupnost, rozsah lig a aktuálnost týmů; při mezeře nepředpovídat.
3. Neměnné AI snapshoty, oddělený ledger/policy, přesné ceny a společný settlement
   a CLV v2. Testovat parity Python/TS a změny výsledků bez dvojího započtení.
4. Dávková inference mimo HTTP čtení, uložená aktuální projekce, samostatná
   ranní sekce a `/tipy ai` TOP 3. Výsledek bez kvalifikovaného tipu je legitimní.
5. Teprve po integračním testu aktivovat inference, příležitosti a Telegram.

Není zaručeno, že zítra vzniknou AI tipy. Žádná nová migrace nebyla aplikována,
produkční přepínače nebyly změněny a tento commit neaktivuje AI.
