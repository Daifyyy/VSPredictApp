# Revize autonomních strategií a závislostí — 18. 10. 2026

## Rozhodnutí

Ponechat 1X2 a původní Over jako sledované, nikoli ověřené strategie. Historický
Over je ziskový, ale nová kohorta má jiná data i období. Nevytvářet nové ligové
filtry podle tohoto výsledku. VALUE/ELO zachovat podle zadání jako experimenty.
Konzervativní 1X2 je filtr téže predikce, ne nezávislý model.

Tento krok dokončuje audit **autonomního ledgeru**, nikoli novou certifikaci všech
predikcí, VALUE/ELO tiketů, v5 a Denního výběru. Pro ně se nesmí přebírat výsledky
singlů. Žádná strategie nebyla tímto auditem automaticky povýšena ani vypnuta.

## Zdroj a reprodukce

- PostgreSQL read-only RepeatableRead transakce, cutoff 2026-10-18 12:35:05.827 UTC.
- 363 kvalifikovaných řádků AutonomousTipSnapshot a dávkový join FixturePrediction.
- Lokální serializovaný export 295 341 bajtů, **nejde o účtovaný síťový přenos**.
- SHA-256 `cffc1e66c24df803190e948d6909ddc4b2873fdf92fc40bc7f1529bc38ef695c`.
- Skript `scripts/auditStrategyEvidence.ts`, čisté výpočty `lib/picks/strategyEvidenceAudit.ts`.
- Zdroj a výstup zůstávají v ignorovaném `.runtime/strategy-evidence-v1/`.
- `node --import tsx scripts/auditStrategyEvidence.ts` znovu počítá pouze lokálně.
- `--refresh` s lokálními env soubory explicitně načte DB; nepouštět v cronu ani buildu.
- Export: nejvýše 10 000 řádků, timeout dotazu 8 s, transakce 25 s, bez JSON historií.

## Výsledky ligových singlů

Model 7, kontext LEAGUE v1; rohy/karty count v2, fauly count v1. Vklad 1 jednotka.
Jde o publikované historické účetnictví, nikoli doporučení velikosti vkladu.

| Kohorta | Uzavřeno | Výhry | Profit | ROI |
|---|---:|---:|---:|---:|
| Over původní policy 1 — archiv | 56 | 40 | +8,54 | +15,25 % |
| Over původní brána — nový research | 23 | 16 | +2,17 | +9,43 % |
| Over současná policy 2 | 9 | 5 | −1,29 | −14,33 % |
| 1X2 policy 2 — původní účetnictví | 62 | 39 | +2,36 | +3,81 % |
| 1X2 konzervativní filtr | 18 | 14 | +4,32 | +24,00 % |
| BTTS policy 2 | 9 | 5 | −1,25 | −13,89 % |
| Karty | 37 | 21 | +0,28 | +0,76 % |
| Rohy | 28 | 14 | −3,67 | −13,11 % |
| Fauly | 35 | 14 | −8,99 | −25,69 % |

Evropské kohorty zůstávají oddělené: 1X2 dva výsledky, historický Over jeden.
BTTS historická policy 1 má 57 výsledků a −0,54 jednotky; nemíchat s devíti novými.

### Co mění interpretaci

1. Nový Over stojí zatím na **pěti herních dnech**. Bez nejlepšího dne by měl
   −1,66 jednotky. Deskriptivní 95% interval ROI blokovaný podle pražských dní je
   přibližně −50,9 až +41,0 %. U archivu je −11,3 až +34,0 %. Kladný bodový
   profit není důkaz stabilní výhody.
2. Všech 18 uzavřených guarded 1X2 výběrů má shodný fixture a stranu v běžném
   1X2 při stejné modelové a kontextové verzi. Vzorky se nesčítají.
3. U fixture 1552735 jsou v 1X2 snapshotu týmy 85/94, zatímco aktuální autoritativní
   fixture uvádí 94/85. Výsledek 2:2 a uložená prohra zůstávají v účetnictví.
   Pro modelový důkaz je řádek vyloučen: auditní čistá kohorta má 61 výsledků a
   +3,36 jednotky, **ale nesmí nahradit původní bilanci 62 / +2,36**.
4. Ostatní kontrolované řádky neměly zjištěný rozpor identity, výsledku, profitu,
   duplicitního klíče nebo předvýkopového kvalifikačního času. To neprokazuje
   správnost původní identity kurzu ani dostupnost všech features v okamžiku výběru.
5. Fauly jsou slabým kandidátem na další aktivní výzkum: modelový binární log-loss
   0,825 vs. tržní 0,683 na stejných 35 výběrech. Rozdíl má blokový interval
   přibližně +0,035 až +0,257. Jde ovšem jen o osm dní a průzkum více strategií,
   bez korekce na vícenásobné testování. Neoznačovat za definitivní důkaz nefunkčnosti.

### CLV a benchmark

Primary coverage počítáme ze všech již vykopnutých, auditně způsobilých výběrů
založených v metodice v2, včetně dosud pending výsledků. Ne ze směsi v1/v2 ani
jen z položek, které closing mají. Čerstvost ověřujeme skutečným časem, ne štítkem.

- 1X2: 3/31 primary closingů, žádný primary panel + ověřená stejná kniha.
- Původní Over nový sběr: 4/25 primary closingů, jeden primary panel + stejná kniha.
- Over policy 2: 2/10 primary closingů.
- Fauly: 0/36 primary closingů.

To nestačí ke schválení výhody. Jeden closing není odhad stabilního CLV.
Párový log-loss používá vždy shodné řádky modelu a trhu. U 1X2 jde pouze o
pravděpodobnost vybrané strany; **nejde o multinomickou kvalitu všech 1X2 predikcí**.
Starý export z 13. 10. není zdrojem těchto aktuálních čísel.

## Mapa závislostí před pozastavením

| Větev | Zachovat | Co případně vypnout | Skutečná úspora / omezení |
|---|---|---|---|
| 1X2 a oba Over sběry | hlavní model, odds, closing, settlement | nic v tomto kroku | žádná změna pravidel |
| Guarded 1X2 | oddělené vyhodnocení filtru | případně jen nové ledger zápisy | nepřidává nezávislou predikci |
| BTTS | hlavní gólové pravděpodobnosti pro VALUE/ELO a UI | samostatné kvalifikace až přes centrální lifecycle | neodstraňovat sdílený gólový model |
| Rohy/karty/fauly | dokončení starých výběrů a snapshotů | nové výzkumné kvalifikace a nepotřebné agregace | samotné vypnutí nezlevní společný `/odds` request |
| Tlak v5 i starší | uložené snapshoty, settlement a výsledkový audit | nový tlakový výpočet a nové v5 příležitosti | méně inference a zápisů; profilování ostatních funkcí zůstává |
| VALUE/ELO | uživatelem vyžádané experimenty | nic | neslučovat bilanci tiketů a nohou |

Zdrojová místa: `autonomousPortfolioStore.ts` (sběr i settlement),
`marketSignalStore.ts` (sdílené tržní signály), `predictions.ts` (hlavní a tlakový
výpočet), `pressurePerformance*Store.ts` (historické vyhodnocení).

### Opravená možnost pozastavení tlaku

Samotné `PRESSURE_V5_ENABLED=false` dosud přepíná na starší tlakový model.
Nový nadřazený `PRESSURE_SHADOW_COLLECTION_ENABLED=false` znamená **žádný nový
tlakový model**, nikoli fallback. Blokuje také vytváření v5 příležitostí a jejich
nové zařazení do Denního výběru. Stav respektují obě varianty výkonového reportu.
Již publikované položky, uložené prognózy, CLV a settlement se nemažou ani nezastavují.
Výchozí hodnota zachovává chování; produkční konfigurace se v tomto kroku nemění.
Není to globální vypnutí všech výzkumných či count modelů.

## Další přijetí

1. Před vypnutím count/BTTS sběru dokončit společné řízení lifecycle v kolektorech,
   UI a distribuci. Samotné skrytí záložky není úspora.
2. U nového challengeru porovnat Over i celé 1X2 proti hlavnímu modelu a tržnímu
   benchmarku na stejných fixture. Tento export obsahuje vybrané strany, nikoli
   kompletní zmrazené 1X2 vektory; z něj nelze poctivě trénovat celomodelový replay.
3. Auditovat dostupnost point-in-time podkladů. FixturePrediction umožňuje přecenění
   pravděpodobností, proto samotné `predictedAt < kickoff` nestačí pro tvrzení o
   neměnném historickém forecastu. Rekonstrukce musí být označená PARTIAL.
4. Existující prozkoumaná historie slouží vývoji, ne nedotčenému finálnímu holdoutu.
   Zamknout kandidáty a prahy před novým prospektivním ověřením.

Výsledek QA: použitelné s uvedenými omezeními. Nejde o plný audit všech zdrojových
cen, záruku zisku nebo povolení aktivovat nový model. Žádné API-Football volání,
cloudový replay ani zápis do produkční DB nebyl proveden.
