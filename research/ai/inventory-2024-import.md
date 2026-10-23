# Ověření historie 2024 — dokončený omezený import

Uživatel schválil nejvýše šest API-Football požadavků, bez retry a bez Neonu.
Import provedl přesně 1 `/status` a 5 `/fixtures?league=…&season=2024` pro ligy
39, 61, 78, 135, 140. Žádné další stránky, statistiky ani kurzy nestahoval.

Při kontrole poskytovatel hlásil 624/7 500 denních volání a 299 zbývajících
minutových požadavků. Bezpečný denní strop byl 5 625. Po každé odpovědi se
kontrolovala rezerva pro zbytek běhu. Jde o API-Football, **nikoli spotřebu Neonu**.

## Výsledek párování sezony 2024

| Liga ID | Archivní zápasy | Ověřené běžné ligové FT | Z toho kompletní pokročilé statistiky |
|---|---:|---:|---:|
| 39 | 380 | 380 | 380 |
| 61 | 308 | 306 | 306 |
| 78 | 308 | 306 | 306 |
| 135 | 380 | 380 | 379 |
| 140 | 380 | 380 | 380 |
| Celkem | 1 756 | 1 752 | 1 751 |

Čtyři řádky nejsou regular-season FT a zůstávají oddělené. U jednoho ověřeného
zápasu ligy 135 nejsou kompletní pokročilé statistiky; žádné údaje se nedoplňují
nulou nebo průměrem. Identita týmů, výkop a skóre zbývajících řádků souhlasí.
Žádné duplicity mezi sezonami a ligami, žádné chybějící regular-season FT fixture
z nových inventářů vůči příslušným archivům.

Tím je odstraněna konkrétní překážka chybějícího ověření FT/fáze sezony 2024.
Nejde ale ještě o 1 751 připravených předzápasových profilů: následuje chronologické
sestavení features, warmup a kontrola čerstvosti. Inventář stažený dnes nedokazuje
původní dostupnost/revize statistik ani neutralitu hřiště. Data zůstávají historickou
rekonstrukcí, nikoli prospektivní nezávislou kohortou. Žádný model nebyl aktivován.

## Soubory a ochrany

- `scripts/importAIInventory2024.ts`: pevný rozsah, nejvýše šest pokusů včetně
  timeoutů, nulové retry, blokované přesměrování, 20s timeout a 5MiB limit odpovědi.
- Před každým požadavkem vzniká lokální záznam pokusu, po odpovědi stav a kvóty.
- Složka `.runtime/ai-inventory-2024-v1` je jednorázová; opakování se odmítne,
  nikoli automaticky obnoví. Všechny odpovědi se ukládají v omezené projekci.
- `complete.json` identifikuje pět souborů jejich hashem; navazující audit hashe
  i integritu inventářů znovu kontroluje.
- Klíč pochází z prostředí, není v reportech ani konzolovém výpisu. DB klient
  není importován. Žádná migrace, produkční zápis, přepis starých dat ani deployment.

**Import znovu nespouštět.** Reprodukce již staženého párování je čistě lokální:

```powershell
node --import tsx scripts/auditAILocalArchives.ts --with-2024-import
```

Výsledný audit:
`.runtime/ai-quality-v2/574fd7ddecc0e908e600ce06206469845c84002838a4965154b0eb01150b61ce.archives.json`.
Původní audity se nemění. Nové ověřené řádky zatím nebyly přimíchány do starého
datasetu ani do dokončeného explorativního srovnání.

Další offline krok: nová hashovaná vývojová matice s historií 2024, původními
celodenními hranicemi a jasným oddělením rekonstrukce. Srovnat BASE/ADVANCED na
stejných zápasech; změněnou historii promítnout i do hlavního benchmarku, nikoli
převzít jeho staré pravděpodobnosti. Původní terminal zůstává prohlédnutý a nesmí
se prezentovat jako nový nezávislý test.
