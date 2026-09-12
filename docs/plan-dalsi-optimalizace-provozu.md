# Plán další optimalizace provozu

## Cíl

Snížit přenos dat a náklady Neon/Vercel bez zhoršení aktuálnosti predikcí, přihlášení nebo vyhodnocování tiketů. Další změny se mají řídit naměřenými daty, ne pouze odhadem podle počtu cronů.

## Výchozí stav

- Neon Launch je aktivní a rozpočtové upozornění je nastavené na 5 USD.
- Frekvence nejčastějších cronů byla snížena.
- Časté databázové dotazy načítají užší výběr sloupců.
- Databáze zabírá jen desítky MB; původní problém způsobil hlavně opakovaný síťový přenos, nikoli objem uložených dat.
- Je dostupný read-only audit `npm run audit:neon` pro velikosti tabulek.
- Produkční verze optimalizací odpovídá commitu `5c7c32e`.

## Fáze 1: provozní baseline a ověření cronů

- [ ] Ověřit, že naplánované GitHub Actions crony po posledním nasazení skutečně končí úspěšně.
- [ ] Po dobu alespoň 24–48 hodin zaznamenat Neon compute, public transfer a Vercel function usage.
- [ ] Zapsat počet spuštění, trvání a stav jednotlivých cron endpointů.
- [ ] Porovnat denní tempo spotřeby s obdobím před optimalizací.
- [ ] Stanovit běžný denní rozpočet přenosu a hranici anomálie.

Výstupem má být baseline, podle které půjde ověřit přínos každé další změny.

## Fáze 2: měření databázových dotazů

- [ ] Doplnit měření času databázových operací pro hlavní stránky a cron endpointy.
- [ ] Evidovat alespoň route, typ operace, počet vrácených záznamů, dobu trvání a přibližnou velikost výsledku.
- [ ] Agregovat diagnostiku tak, aby samotné logování nevytvořilo další vysoké náklady.
- [ ] Prověřit dostupnost `pg_stat_statements`; pokud není dostupné, použít aplikační diagnostiku.
- [ ] Vytvořit žebříček nejdražších cest podle četnosti i přenesených dat.

Prioritně sledovat:

- `/api/cron/predict-upcoming`,
- `/api/picks/strategies`,
- live snapshoty a live centrum,
- kurzové snapshoty,
- settlement výsledků,
- Model Lab a historické reporty,
- push notifikace.

## Fáze 3: agregace statistik strategií

- [ ] Přestat při každém otevření `/strategie` sestavovat dlouhodobou bilanci z jednotlivých historických záznamů.
- [ ] Zavést denní agregované snapshoty podle strategie, policy verze a typu ceny.
- [ ] Odděleně agregovat VALUE, ELO/INTUICE a přímé versus syntetické ceny.
- [ ] Z jednotlivých snapshotů načítat pouze příležitosti z vybraného dne.
- [ ] Přepočet agregací provádět po settlementu nebo jedním denním cronem.
- [ ] Ověřit shodu agregovaných statistik s dosavadním výpočtem nad historií.

Tato fáze má největší potenciál snížit opakovaný přenos vyvolaný uživatelskými návštěvami.

## Fáze 4: optimalizace `predict-upcoming`

- [ ] Změřit, kolikrát se v rámci jednoho běhu načítají stejné historické zápasy, standings, Elo stavy a týmové feature.
- [ ] Sloučit práci po soutěžích do řízených dávek bez překročení limitu Vercel funkce.
- [ ] Sdílené vstupy načíst jednou na dávku, nikoli opakovaně pro každý zápas.
- [ ] Preferovat malé point-in-time feature snapshoty před opakovaným načítáním široké historie.
- [ ] Zachovat deterministický výpočet a ochranu proti data leakage.
- [ ] Porovnat výsledky predikcí před a po optimalizaci.

## Fáze 5: retence a úklid dat

Před zavedením mazání nejprve potvrdit, která data jsou skutečně obnovitelná a která jsou potřebná pro audit nebo backtest.

- [ ] Změřit růst `ApiCache`, live snapshotů, cron logů a diagnostických tabulek.
- [ ] Navrhnout retenční dobu pro každou dočasnou tabulku.
- [ ] Mazat pouze prokazatelně expirované cache záznamy a starou provozní telemetrii.
- [ ] Nemazat point-in-time tikety, Elo zápasy, settlement historii ani podklady pro backtest bez samostatného schválení.
- [ ] Úklid implementovat idempotentně, po omezených dávkách a s reportem počtu odstraněných řádků.
- [ ] Před prvním produkčním úklidem spustit režim dry-run.

Orientační kandidáti k posouzení, nikoli automaticky schválené limity:

- expirovaná `ApiCache`: jednotky dnů po expiraci,
- detailní live snapshoty: přibližně 30 dnů,
- technické cron logy: přibližně 90 dnů,
- agregované denní metriky: dlouhodobě zachovat.

## Fáze 6: ochranný úsporný režim

- [ ] Přidat explicitní konfigurační přepínač pro omezený provoz při nákladové anomálii.
- [ ] V úsporném režimu zastavit výzkumné backfilly a snížit frekvenci nekritických cronů.
- [ ] Zachovat přihlášení, hlavní čtení aplikace, settlement a nezbytné produkční aktualizace.
- [ ] Každý přeskočený cron ukončit úspěšně s jasným důvodem v logu.
- [ ] Zdokumentovat aktivaci i návrat do normálního režimu.

Úsporný režim se nesmí aktivovat automaticky pouze podle nepřesného lokálního odhadu. Automatizace dává smysl až tehdy, pokud bude k dispozici spolehlivý zdroj aktuální spotřeby.

## Fáze 7: další aplikační kontroly

- [ ] Prověřit, zda homepage, `/strategie`, `/predikce` a `/porovnani` neduplikují stejné databázové dotazy.
- [ ] Zkontrolovat cache hlavičky a bezpečné serverové cache pro veřejná agregovaná data.
- [ ] Ověřit, že PRO autorizace nevyvolává několik identických načtení session během jednoho requestu.
- [ ] Prověřit počet a velikost načítaných kurzových JSON polí.
- [ ] Zkontrolovat indexy podle reálných filtrů a řazení; nepřidávat indexy bez potvrzení dotazovým plánem.
- [ ] Prověřit retry logiku, aby chyba databáze nebo API nespouštěla násobné drahé opakování.

## Pořadí realizace

1. Ověření cronů a 24–48hodinová baseline.
2. Lehká diagnostika databázových dotazů.
3. Denní agregace statistik strategií.
4. Optimalizace `predict-upcoming` podle naměřených výsledků.
5. Bezpečná retence dočasných dat.
6. Úsporný režim a nákladové guardraily.
7. Průběžná optimalizace dalších cest podle žebříčku skutečné spotřeby.

## Kritéria přijetí

- Produkční crony jsou úspěšné a žádný důležitý proces nebyl ztracen snížením frekvence.
- Denní přenos Neon je stabilní a výrazně nižší než před první optimalizací.
- `/strategie` nečte celou historickou kohortu při každém přepnutí strategie nebo data.
- Statistiky z agregací odpovídají referenčnímu výpočtu nad jednotlivými záznamy.
- Predikce a settlement mají stejné výsledky před a po optimalizaci.
- Retenční úklid má dry-run, omezené dávky a nemaže analyticky důležitou historii.
- Při anomálii lze omezit náklady bez odstavení přihlášení a základní funkčnosti aplikace.

## Rozhodovací pravidlo

Další snížení frekvence cronů nebo mazání dat provést až po změření baseline. Primární cíl není minimální počet volání, ale nejnižší udržitelná spotřeba při zachování správných a dostatečně čerstvých dat.
