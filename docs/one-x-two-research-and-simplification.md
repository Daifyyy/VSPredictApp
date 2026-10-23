# 1X2: jednoduché rozhraní a poctivá validace

Stav implementace: 23. 10. 2026. Nejde o potvrzení nasazení.

## Co uživatel uvidí

- Hlavní přehled strategií odděluje původní Over 2,5 a výzkumné 1X2 od ostatních trhů. VALUE a ELO/INTUICE zůstávají viditelné experimenty, ostatní sekce jsou sbalené.
- 1X2 ukazuje všechny tři pravděpodobnosti, ne pouze vítěze vybraného filtrem. Čte zmrazený předzápasový audit a dostupný odmaržovaný benchmark. Nejde o nově nasazený model.
- Historická bilance výběrového filtru není důkazem kalibrace úplného modelu. Výzkumné 1X2 nevytváří nová distribuovaná doporučení; již publikované položky se nadále vyhodnocují.
- Původní Over používá samostatný zdroj `OVER_25_LEGACY_SHADOW`, policy 1. Jeho historie se neslučuje s pozdějšími pravidly `OVER_25`.
- Nepoužívané duplicitní modelové portfolio již nenačítá historii; starý endpoint vrací 410 s odkazem na Strategie.

## Offline kandidát 1X2

`lib/picks/oneXTwoResearch.ts` implementuje regulovanou tříkategoriální softmax korekci základních pravděpodobností. Porovnává základ, kalibraci, Elo a krátkodobou formu/kontext. Parametry se fitují pouze offline, nikoli v aplikaci nebo cronu. Kurzy nejsou vstupem modelu.

Lokální reprodukce: `node --import tsx scripts/runOneXTwoResearch.ts`.

Zdroj je existující lokální export `.runtime/goal-benchmark/2026-10-18T13-05-25.353Z.json` a jeho ověřené sezonní inventáře. Runner nečte produkční DB ani poskytovatele. Výstupy jsou v ignorované `.runtime/one-x-two-research/`; obsahují protokol, hashe a omezení rekonstrukce. Produkční artefakt se automaticky nezapíná.

První běh: 218 trénovacích, 96 validačních a 151 závěrečných zápasů. Validační multiclass log-loss základu byl 1,015764, nejlepší kalibrace 1,015343. Zlepšení 0,000421 nesplnilo předem nastavenou hranici 0,002. Elo ani krátkodobá forma nepomohly. Výsledek: `NO_VALIDATION_IMPROVEMENT_BASELINE_FALLBACK`, bez aktivace kandidáta.

Základ v tomto replayi je rekonstruovaný gólový model `stabilized100`, nikoli kompletní kohorta zmrazených produkčních predikcí. Dříve prohlížené historické období nelze vydávat za nový nezávislý test. Tento výsledek tedy neprokazuje převahu nad současným produkčním modelem ani ziskovost sázek.

## Data, bezpečnost a výkon

`oneXTwoDailyProjection.ts` vybírá pouze potřebná JSON pole auditu, kontroluje identitu, verzi, součet pravděpodobností a časy před výkopem. Nejvýše 201 řádků pro detekci překročení limitu, odpověď nejvýše 200 zápasů. Malá cache má TTL 60 s; PRO kontrola probíhá před načtením. Chybějící nebo neplatný audit se nenahrazuje dodatečně přepočtenou predikcí.

Read-only kontrola dne 23. 10. 2026 našla 10 platných modelových auditů verze 7, všech 10 s benchmarkem; normalizovaný payload 3 253 bajtů. Nula nových volání poskytovatele, žádný zápis do DB. Čtení UI nefitovat ani nepřepočítávat model. Migrace není potřeba.

Chybějící historický souhrn neblokuje denní 1X2 audit: API vrací `metrics: null`, `stale: true` a konkrétní důvod. UI nesmí zobrazovat nulovou bilanci. Při více než 200 dostupných auditech musí upozornit na zkrácení denního seznamu.

## Další rozhodnutí

### Úplný prospektivní audit (doplněno 23. 10.)

`scripts/auditOneXTwoProspective.ts` porovnává skutečně zmrazené 1/X/2 vektory s výsledkem a openingovým benchmarkem. Nejde o replay a nedoplňuje chybějící historické vektory. Model a trh mají stejné řádky/jmenovatele; panel a Pinnacle single jsou oddělené. Kohorty oddělují model, kontext, kontextovou verzi i zachycené rho/sharpen/calibA/calibB. Hodnotí multiclass log-loss, součtový Brier, RPS a kalibraci každého výsledku. Metriky jsou popisné, nikoli důkaz ziskovosti nebo aktivační brána.

Výchozí běh je pouze pro čtení:

```powershell
node --env-file=.env --env-file=.env.local --import tsx scripts/auditOneXTwoProspective.ts 2026-10-01 2026-10-24
```

Druhé datum je nezahrnutý konec období **prvního zachycení**, nikoli výkopů. Okno nejvýše 93 dní, SQL limit 10 001 řádků (při překročení 10 000 odmítnutí, nikoli zkrácená metrika), statement timeout 10 s. Raw quotes se nepřenášejí. Vybere se první signál zápasu i přes hranice období; pozdější lepší audit nesmí nahradit chybějící první. Počítá se pouze FT a celé konečné skóre; změny identity/výkopu jsou vyřazené. AET/PEN nejsou zaměněné za výsledek základní doby.

Volba `--publish-summary` explicitně uloží jediný malý záznam `one-x-two:prospective-report:v1` do existující ApiCache (max 250 kB, retence 90 dní). Nemění predikce, výsledky ani sázení. Nové UI `Strategie → 1X2 → Výkonnost` čte jen tento souhrn, PRO ochrana je serverová. Report se cacheuje 15 minut, po 48 hodinách se označí jako starý. Chybějící souhrn ani chyba jeho čtení neblokují denní predikce a nevytvářejí nulovou bilanci.

Souhrn byl v produkční ApiCache jednorázově uložen 23. 10. 2026 v 15:09 UTC: 302 zdrojových řádků, 98 platných auditů, všechny budoucí, 0 způsobilých dokončených; 201 dokončených zápasů bez auditu. Jeden záznam neprošel identitou/výkopem. Velikost načteného výsledku odhadnutá JSON serializací byla 158 900 bajtů, nikoli údaj účtovaného síťového přenosu. Žádná nová provider volání.

Obnova není automatická: po settlementu administrátor explicitně zopakuje příkaz s odpovídajícím obdobím a `--publish-summary`. Nezavádí se další pravidelný scan ani workflow bez ověření provozní rezervy. Aktuální UI kód zatím vyžaduje commit/push a nasazení.

Pokračovat ve zmrazených kompletních vektorech 1/X/2 a ve společné kohortě s trhem. Hodnotit multiclass log-loss, Brier, kalibraci jednotlivých výsledků a segmenty, nikoli pouze úspěšnost vybraných favoritů. Další kandidát musí být předem definován a ověřen na skutečně odděleném období; nevybírat dodatečně vítězná pravidla podle známých výsledků. Výzkumný status ani původní historický profit nejsou zárukou budoucí výhody. Povýšení vyžaduje samostatné ruční rozhodnutí na základě doložených výsledků.
