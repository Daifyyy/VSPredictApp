# Lokální podklady pro rozšíření AI historie

## Výsledek

Bez Neonu a bez provider API bylo zkontrolováno 3 513 archivních řádků pěti lig
(39, 61, 78, 135, 140) v sezonách 2024 a 2025. Výsledky nejsou nové modelové
predikce ani nový nezávislý test.

| Sezona | Archivní řádky | Úplné statistiky obou stran | Shoda s ověřeným inventářem a FT/regular season |
|---|---:|---:|---:|
| 2024 | 1 756 | 1 751 | Neověřeno, chybí inventář |
| 2025 | 1 757 | 1 751 | 1 751 |

Úplnost zde znamená platné xG, střely, střely na branku, střely z vápna a rohy
obou stran. Nula je platná. SOT a střely z vápna nesmějí převýšit všechny střely.
**Nejde o počet použitelných předzápasových profilů:** ty dále potřebují dostatečnou
minulost a čerstvost. Statistiky právě hodnoceného zápasu nikdy nejsou jeho features.

Nebyla nalezena duplicitní fixture uvnitř souborů ani napříč kontrolovanými sezonami
a ligami. Žádné statistiky nejsou osiřelé vůči příslušnému výsledkovému souboru.
U sezony 2025 nechybí v archivech žádný regular-season FT zápas z ověřených inventářů.
Kontroluje se identita obou týmů, čas výkopu jako UTC instant a výsledek.

Šest archivních řádků 2025 neprošlo:

- liga 61: dva řádky nejsou v ověřeném inventáři, dva nesplňují regular-season FT;
- liga 78: dva řádky nesplňují regular-season FT.

Tyto řádky se označují v auditním souboru; nic se nemaže a žádný produkční výsledek
se nemění. Přesná ID a důvody jsou v `results[].classified`.

## Praktický přínos a hranice

Existuje potenciál rozšířit historický trénink o sezonu 2024 **bez opětovného
stahování střeleckých statistik**. Zbývá ověřit chybějící metadata: FT stav, fázi
soutěže a případně neutrální hřiště. Chybějící metadata nejsou důkaz chybného výsledku,
ale nelze je nahradit předpokladem, že všechny archivní zápasy jsou běžná liga.

Ani plná shoda inventáře nedokazuje původní čas zveřejnění statistik, jejich
historické revize nebo neutralitu hřiště. `trainingAllowed` a `activationAllowed`
zůstávají false. Sezona 2024 je případná rozšířená vývojová historie, nikoli náhrada
nového nezávislého závěrečného testu. Sezona 2025 už byla součástí předchozí práce;
1 751 řádků se nesmí přičíst jako nová data k původnímu datasetu.

Při obnovení ověřené kapacitní rezervy stačí nejprve dohledat **metadata** těchto
starších fixture, nikoli exportovat jejich celé statistiky znovu. Nejde o povolení
automatického backfillu. Žádný vzdálený export v této práci neběžel.

## Reprodukce a kód

```powershell
node --import tsx scripts/auditAILocalArchives.ts
npx vitest run lib/picks/aiLocalArchive.test.ts
```

`lib/picks/aiLocalArchive.ts` je čistá kontrola párování, nikoli produkční adaptér.
Skript má pevný rozsah, limit 32 MiB lokálních vstupů, 2 MiB výstupu a 30 sekund.
Hashuje všechny zdroje i kód, validuje integritu inventáře a ukládá audit pod hashem
bez přepsání předchozího běhu. Neimportuje DB klienta, nečte přístupové údaje,
netrénuje a nevolá síť. Audit je mimo deployment.

Ověřený běh: 3,44 MB čtení z lokálního disku, přibližně 0,10 s, DB dotazy 0,
provider volání 0. Lokální čtení není účtovaný Neon přenos.

Audit:
`.runtime/ai-quality-v2/5ea5357801d1f1aee6ab9a04326d5db4223e71fcd78ced1f530e610d2b61ed07.archives.json`.

Návaznost: [protokol dalšího experimentu](next-experiment.md).
