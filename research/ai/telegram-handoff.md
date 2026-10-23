# Telegram a AI: produkční handoff 23. 10. 2026

## Dokončeno

- Původní Over, VALUE/ELO a Denní výběr se nemění. `/tipy` čte aktuální uložené
  tipy, `/tipy over25` původní Over, `/dalsi [strategie]` pokračuje v seznamu.
- Samostatný BASE Over logistic C=1: artefakt `base-over-logistic-research-v1`,
  policy 1001, status `MANUAL_RESEARCH`. Vývojové zlepšení log-loss 0,54 %
  nesplnilo původní 1% bránu; tu neměníme. Nejde o doloženou výhodu.
  Pravděpodobnosti nejsou nezávisle kalibrované. Historická ziskovost není doložená.
  AI 1X2 se neaktivuje, protože nepřekonala hlavní benchmark.
- Lokální export jednoho modelu: 5,5 s, přibližně 272 MiB peak RSS. Produkce pouze
  aplikuje koeficienty a společný chronologický feature builder, bez Pythonu a fitování.
- Kompaktní ověřený checkpoint historie 2024/2025 a identity rozpisu 2026.
  Podporované ligy: 39, 61, 78, 135, 140. Jiná sezona/kontext se odmítne.
  Mezery ve výsledcích, změněná identita či nemožný čas výsledku blokují danou ligu.
- Neměnné `AIForecastSnapshot` (fixture + artefakt), oddělený market-signal ledger,
  společný settlement Over 2,5 a CLV v2. Chybějící closing zůstane chybějící.
  AI nezvyšuje četnost provider sběru a nevstupuje do hlavního Denního výběru.
- Existující `daily-selection` cron provádí oddělenou omezenou AI dávku (max. 50),
  pod DB lease a resource guardem. `settle=1` vyhodnotí všechny AI predikce,
  i bez oceněné sázky, a uloží malý souhrn. Web/Telegram nic netrénují.
- Web: Strategie → Over 2,5 → AI výzkum. Serverová PRO ochrana, lazy načtení,
  stránkování 30; všechny predikce versus kvalifikované sázky.
- `/tipy ai`, AI sekce v `/tipy` a ranní distribuci: nejvýše tři kvalifikované
  výběry, jasně experimentální. Ranní AI výsledky jen pro publikované výběry.
- Nový odečet ceny může potvrdit pouze stejnou cenu u stejné knihy; nemění původní
  účetní cenu/čas. Změněný nebo starý kurz se nedoporučuje, historie zůstává.
- Nejasný timeout při odeslání je `UNKNOWN`, bez slepého automatického opakování.
  Automatické intradenní hromadné AI zprávy nejsou součástí; aktualizace `/tipy`
  a `/tipy ai` jsou na požádání a nevynucují provider sběr.

## Nasazení

Migrace `20261023210000_ai_research_forecasts` byla aplikována na Neon.
Vytváří pouze novou tabulku a indexy; historii nemění. Vercel flagy nebyly změněny.
Po nasazení kódu:

```text
AI_RESEARCH_INFERENCE_ENABLED=true
AI_RESEARCH_UI_ENABLED=true
AI_RESEARCH_OPPORTUNITIES_ENABLED=true
AI_RESEARCH_TELEGRAM_ENABLED=true
```

Nejdříve lze zapnout první tři, ověřit web a potom Telegram. Změna Vercel prostředí
vyžaduje redeploy. Zachovat autorizaci Telegramu, cron secret a kapacitní ochrany.

Použít existující workflow v pořadí: settlement dokončených zápasů, predikce,
snapshot kurzů, `daily-selection` (bez dry-run), poté Telegram digest.
Nevytvářet nový častý workflow. `daily-selection?settle=1` aktualizuje AI bilanci.
Ranní digest má číst projekci vytvořenou po aktuálním sběru kurzů.

Ověřit `/tipy`, `/tipy over25`, `/tipy ai`. Příkaz do chatu s botem čte uložená
data. Nula tipů je platný výsledek: kurz 1,50–3,00, p≥55 %, edge≥4 p. b., EV≥3 %,
coverage≥75 %, oba týmy ≥5 zápasů, kompletní přímý trh, cena do 90 minut,
výkop alespoň za 30 minut.

## Ověření a hranice

Kontrolovaný produkční běh během večerních zápasů: 0 nových snapshotů, budoucí
zápasy čekaly na výsledky předchozího dne. Opakování nic nepřepsalo, nebyla odeslána
Telegram zpráva ani nový provider request. Nenulovou idempotenci ověřují testy.
Nejde o záruku, že zítra vznikne kvalifikovaný tip.

Předchozí čtecí preflight: 422 skalárních řádků, 41 kandidátů, 182 ms inference celkem,
dva tehdy časově způsobilé výstupy. Není to p95 SLA. Mockované testy ověřují
konstantní počet dotazů pro 1 a 50 fixture.

Automatické opravy výsledků: pending a posledních 30 dní; starší opravy vyžadují
explicitní údržbu. Denní projekce dnes/včera mají retenci 90 dní, neměnné forecasty
a ledger zůstávají. Nová sezona vyžaduje nový ověřený artefakt.
Stávající plný sběr negarantuje 80% primary CLV coverage; sledujte reálné pokrytí.

Začíná nová prospektivní kohorta. Kontroly při 50/100/200 uzavřených výběrech,
bez automatického povýšení či garance zisku. Při chybě se výzkumná vrstva přeskočí.
