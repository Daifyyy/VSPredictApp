# Přehled kohort Overu — první integrační krok

## Rozsah

- `/strategie?strategy=OVER_25`: současná policy.
- `/strategie?strategy=OVER_25&cohort=original`: původní brána, nový prospektivní research.
- `/strategie?strategy=OVER_25&cohort=archive`: historická policy 1, model 7, LEAGUE kontext v1.
- `view=performance`: bilance místo denního seznamu; změna pohledu znovu nenačítá data.
- VALUE/ELO zůstávají, s označením Experiment. Žádná kvalifikační pravidla se nemění.

Registr `overCohorts.ts` sdílí identitu, pravidla a popis s Model Labem.
Nejde zatím o kompletní registr životního cyklu všech strategií. Nevypíná sběr,
nepovoluje publikaci a nezastupuje validační bránu. Historická data se nepřepisují.
Původní research nevstupuje nově do výchozího katalogu Telegramu či Denního výběru.
Archiv je zatím souhrnný; prohlížení jednotlivých starých herních dnů není v tomto kroku.

## Nasazení

Bez migrace a bez nových provider volání. Po deployi použít existující
`audit-pipeline`, případně autorizovanou provozní akci `refresh-strategy-metrics`.
Nové souhrny se ukládají do existujícího ApiCache pod oddělené kohortové klíče.
Bez souhrnu API vrátí 503 `STRATEGY_METRICS_NOT_CAPTURED`, nikoli nulový profit.
Zkontrolovat oddělené bilance archivu a nového sběru, PRO ochranu a nezměněný Telegram.

## Kapacita

Nové pohledy vždy používají uloženou bilanci, i pokud je globální úsporný flag vypnutý.
Archiv nečte denní ledger ani fixture. Nový research načítá jen zvolený den a skalární pole.
Dva dodatečné historické souhrny se obnovují nejvýše jednou za 24 hodin; pokud
základní obnova již spotřebovala 20 sekund, odloží se. Rozběhnutý dotaz tím nelze
přerušit, nejde o tvrdý timeout. Nezvyšuje se frekvence žádného workflow.
Přidaný náklad: nejvýše dvě obnovy skalárních kohort a souhrnů denně, malé kontrolní
čtení cache při existujícím auditu. Vercel může mít vyšší CPU při této obnově;
úsporu ani rezervu zatím nelze kvantifikovat bez produkčního měření.
Před širší aktivací dalších historických pohledů ověřit dobu auditu, DB přenos a compute.

## Další samostatné kroky

Dokončit audit všech strategií a závislostí, teprve poté pozastavovat nepotřebné
výpočty. Připravit lokální párový replay challengerů pro Over i 1X2 s odděleným
holdoutem. Tento UI krok nepřináší nový model, důkaz edge ani garanci zisku.
