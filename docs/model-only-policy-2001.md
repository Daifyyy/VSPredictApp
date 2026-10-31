# Modelové predikce bez kurzů — politika 2001

## Cíl a oddělení historie

Měříme předpovědní přesnost, nikoli výhodu vůči ceně. Žádná pravděpodobnost,
úspěšnost ani interval nejistoty zde neprokazuje ziskovost. Staré cenové ledgery,
VALUE/ELO tikety, profit a CLV se nepřepisují; zůstávají v archivu a dobíhá settlement.
Nové záznamy patří výhradně do `ModelOnlyForecast` a `ModelOnlyDay`.

## Implementační plán a pravidla

1. Odstavit odds/closing a Web Push na scheduleru, HTTP i provider hranici.
2. V samostatné kohortě zmrazit dostupné vlastní modelové predikce před výkopem.
3. Publikovat modelové výběry bez tržních filtrů; UI a Telegram čtou stejné řádky.
4. Měřit všechny validní predikce i kvalifikovanou podmnožinu odděleně.
5. Migrovat před nasazením kódu, ověřit dry-run a až potom spustit sběr.

První pravidla nejsou optimalizovaná na poslední výsledky:

| Zdroj | Událost a práh |
| --- | --- |
| Hlavní 1X2 | Nejpravděpodobnější HOME/DRAW/AWAY, alespoň 58 % |
| Over | Over 2,5, alespoň 60 %; aktuální uložená pravděpodobnost hlavního modelu |
| ELO | Nejpravděpodobnější 1X2, alespoň 58 %, experiment |
| Modelová kombinace | Výhra domácích nebo hostů + Under 4,5, alespoň 55 %, experiment |
| AI Over | Aktivní uložený artefakt, alespoň 60 %, research |

Efektivní vzorek alespoň 8 a bez `lowConfidence`; AI navíc coverage >= 75 %.
ELO bere minimum dlouhého i rychlého vzorku obou týmů. Cena není vstup ani filtr.
Kombinace používá společnou skórovou mřížku Poisson + Dixon–Coles rho -0.03,
nikoli násobení marginalit. Není totožná se starou VALUE politikou a nedědí její ROI.
Předchozí Over pravidla včetně tržních podmínek zůstávají pouze historicky.

Zachycení je povolené nejméně 30 minut před výkopem, ze vstupu nejvýše 24 hodin
starého. Zdroj nesmí být z budoucnosti. Identita obsahuje fixture, zdroj, verze,
kontext a artefakt. `createMany(skipDuplicates)` nezmění první uložený odhad.
Chybějící/invalidní predikce se nevyrábí. Podprahové validní prognózy se uchovají
pro poctivé hodnocení celé dostupné kohorty.

BTTS, týmové góly, rohy, karty, fauly a v5 nemají touto změnou automaticky obnovenou
publikaci. Jejich dřívější pozastavení/karanténa se neobchází. AI inference respektuje
dosavadní přepínač; nevzniká nový trénink, replay ani provider požadavek.

Denní selektor začíná od 09:00 Europe/Prague. Nejvýše pět položek, jeden fixture,
dvě položky na ligu; pravděpodobnost, výkop, stabilní ID. Nové položky pouze doplňuje,
nikdy nenahrazuje staré ani neuvolňuje šesté místo. Zámek je transakční v PostgreSQL.
Srovnatelnost kalibrace různých modelů není zatím prokázaná; selektor je neověřený.

## Vyhodnocení a omezení

- Samostatně podle zdroje, modelové/policy/kontextové verze, kontextu a AI artefaktu.
- Přesnost všech prognóz a přesnost kvalifikovaných výběrů mají odlišné jmenovatele.
- Brier a log-loss ze stejné vyhodnocené kohorty; binární a multinomický Brier
  se nesrovnávají přímo jako stejná škála.
- ECE pro pravděpodobnost zvolené strany (10 košů), nikoli důkaz kalibrace každé třídy.
- Jednoduchý baseline: vždy domácí pro 1X2, vždy Over pro Over. Kombinace bez baseline.
- Pokrytí = kvalifikované / zachycené prognózy zdroje, ne úplnost všech zápasů programu.
- Wilsonovo 95% pásmo je orientační a nezohledňuje korelaci zápasů.
- Denní selektor má vlastní bilanci; nepřebírá výsledky všech zdrojových výběrů.
- FT se skóre vyhodnotí; zrušené/administrativní výsledky jsou VOID. Chybějící skóre,
  odklad a neověřený výsledek prodloužení zůstávají nevyhodnocené. Žádné domyšlené nuly.
- Pozdější oprava výsledku aktualizuje původní příspěvek; nic se nepřičítá podruhé.

## Provoz a kapacita

Cron: 221 -> 29 plánovaných slotů/UTC den (-86,88 %), nikoli stejné procento Neon
přenosu. Odstraněno 96 push, 24 plných a 72 prioritních kurzových slotů.
Ostatní základní běhy a Quality gates zůstávají. Přestává se doplňovat i externí
předpovědní benchmark poskytovatele; vlastní prognóza ho nepotřebuje.

Sběr: nejvýše 200 fixture v 72h okně, dávkové skalární dotazy, žádné odds JSON,
žádné N+1. Překročení označí MODEL_BATCH_LIMIT. Settlement: nejvýše 500 změněných
definitivních výsledků v jednom běhu; zbytek následujícím během. Souhrny se obnoví
po změně nebo jednou za 24 hodin, nikoli při čtení UI.

UI čte 30 řádků na stránku a nejvýše pět položek denního výběru; konkrétní predikce
jsou serverově PRO. Veřejné jsou agregace. Nedostupná DB/migrace => 503, nikoli nula.
Program a Výkonnost zobrazují nový režim, archiv přes `?section=archive`.

Telegram `/tipy`, `/dalsi`, `/vyber`, `/vysledky`, `/datum`, `/tiket`, `/stav` čte
nové řádky; `value` je alias pro modelové kombinace. Ranní zpráva nejvýše TOP 3.
Ranní výsledky pouze z dříve skutečně odeslaného modelového snapshotu. Nejisté
doručení => UNKNOWN + incident, nikoli automatické opakování.

## Nasazení

1. Zkontrolovat zálohování a `npx prisma migrate status` v cílovém prostředí.
2. Aplikovat aditivní migraci `npx prisma migrate deploy` (nové dvě tabulky; nic nemaže).
3. Nasadit kód s vygenerovaným klientem. `MODEL_ONLY_MODE` je explicitní produktová
   politika v kódu, ne zapomenutý env flag. Staré cenové flagy ji nepřebijí.
4. Spustit `predict-upcoming`, potom `daily-selection`; nové podklady se zachytí
   před výkopem. Dry-run nic nezapisuje a model neinferuje, ověřuje jen bezpečné směrování.
5. Zkontrolovat PRO/veřejný pohled a `/tipy`, poté Telegram cron. Neopakovat UNKNOWN.
6. Po skončení zápasů `settle-results` s návazným `daily-selection?settle=1`.
7. Měřit skutečné DB/provider náklady a pokrytí. Žádný slib dosažení free limitu pouze
   ze změny počtu triggerů. Žádný automatický přenos ziskovosti ze starých pravidel.

Při rollbacku kódu se nové tabulky nemažou. Ručně neobnovovat kurzové workflow bez
nového rozhodnutí; záznamy různých metodik se neslučují.
