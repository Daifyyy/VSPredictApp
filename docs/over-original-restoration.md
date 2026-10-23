# Obnovení původních pravidel Overu — 2026-10-23

## Provozní rozhodnutí, nikoliv potvrzení ziskovosti

Výchozí Over ve Strategiích, denním přehledu a Telegramu používá
`OVER_25_LEGACY_SHADOW`, policy 1. Identifikátor zůstává zachovaný kvůli
neměnné historii. Jde o původní kvalifikační bránu na opravených aktuálních
vstupech, nikoliv návrat k historickým chybným datům nebo přenos starého ROI.

- Pravděpodobnost ≥60 %, připravenost ≥6, edge ≥4 p. b. bez horního stropu,
  EV ≥2 %, nejméně 3 kurzové vzorky a 15 minut do výkopu.
- Denní výběr navíc uplatňuje vlastní přísnější cenu, čerstvost,
  čas do výkopu, diverzifikaci a evidenci. Zařazení není automatické.
- `OVER_25` policy 2 již nevytváří nové autonomní výběry ani nové publikace.
- Archiv `OVER_25` policy 1 (model 7, LEAGUE, context 1) zůstává oddělený.
- Closing a settlement již zachycených výběrů obou ukončených politik pokračuje.
- Žádná větev není touto změnou označena VALIDATED.

## Jednotné zobrazení

`/strategie?strategy=OVER_25` otevírá původní aktivní pravidla.
`cohort=current` zůstává stabilním odkazem na archiv pravidel v2;
`cohort=archive` na historický původní Over. Cache klíče se nemíchají.
Výsledky Telegramu dohledají dříve publikované v2 položky podle jejich ID,
nikoliv podle nového výchozího zdroje. Výsledkový audit ponechává zdroj a policy.

## Nasazení

Bez databázové migrace nebo nových env proměnných. Po nasazení:

1. `audit-pipeline` obnoví uložené bilance; aktivní původní větev má přednost
   před volitelnými archivními přepočty.
2. Běžný `snapshot-odds` zachytí způsobilé předzápasové výběry. Nespouštět
   opakovaně kvůli vynucení tipu; pravidla stále vyžadují skutečné vzorky.
3. Ověřit default API `cohort.id=original`, PRO seznam a Telegram dry-run.
4. Ověřit, že nové řádky `OVER_25` policy 2 nepřibývají a již vydané tipy
   mají nadále settlement i closing. Historické publikace se nepřepisují.

Limit prioritního kurzového průchodu ani globální rozpočet se nemění.
Aktivní původní výběry mají prioritu P0; nekvalifikované staré v2 řádky
již frontu neplní. Nevzniká nový workflow, externí endpoint ani plný replay.
Načtení stránky nepočítá historii. Staré bilance se obnovují nejvýše jednou
denně v rámci existujícího časového rozpočtu.
