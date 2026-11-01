# Tmavý sportovní dashboard — první etapa

Implementované obrazovky: Dnes a detail zápasu. Společné barevné tokeny, karty,
hlavička a navigace jsou sdílené i s ostatními sekcemi. Nejde ještě o kompletní
vizuální audit historických, administrativních a vedlejších obrazovek.

- Pozadí #0b1017, povrch #141c26, zvýšený povrch #1b2633.
- Text #f1f5f9, sekundární text #9aabba, oddělovače #2a3745.
- Limetková #c6f65b pouze pro ovládání a navigaci. Neoznačuje jistotu tipu.
- Zelená/červená pro vyhodnocené úspěchy/neúspěchy; odhad je neutrální.
- Dnes: stručná hlavička, datum, modelový výběr, program zápasů.
- Detail: hlavička týmů, přehled 1X2, gólové odhady, karty zmrazených tipů.
  Podklady, audit a historické cenové záznamy zůstávají rozbalovací.
- Čtyři cíle navigace: Dnes / Predikce / Výsledky / Úspěšnost.
- Desktop: boční panel; mobil: spodní navigace se safe-area odsazením.
- Žádné nové externí fonty, obrázky, databázové dotazy ani intervaly obnovy.
- Predikční pravidla se redesignem nemění.

Ověření první etapy: 253 testových souborů, 1919 testů a offline produkční build.
Před nasazením ještě ověřit skutečný vzhled Dnes a detailu při šířkách 360, 390,
768 a 1440 px, navigaci klávesnicí, dlouhé názvy týmů a PRO/veřejný stav.
