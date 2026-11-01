# Modelové predikce 2002: týmové góly a společný přehled

Navazuje na politiku 2001. Změna nabídky denního selektoru znamená novou kohortu;
2001 se nepřepisuje a zůstává čitelná volbou verze v přehledu. Settlement dokončí
obě verze, souhrny zůstanou oddělené. Nejde o prokázané zlepšení modelu.

## Týmové góly

- TEAM_HOME_05 / TEAM_AWAY_05: alespoň jeden gól, pravděpodobnost >= 78 %.
- TEAM_HOME_15 / TEAM_AWAY_15: alespoň dva góly, pravděpodobnost >= 60 %.
- Poissonova pravděpodobnost ze stávající týmové lambda: 1-exp(-lambda), resp.
  1-exp(-lambda)*(1+lambda). Žádné kurzy ani násobení nezávislých sázek.
- Stejné požadavky na čerstvost, předvýkopový čas a důvěru jako u 2001;
  nejméně osm relevantních zápasů. Chybějící lambda se nenahrazuje domněnkou.
- Čtyři samostatné zdrojové identity umožňují oddělenou kalibraci a úspěšnost.
  Do seznamu všech predikcí patří i nekvalifikované prognózy.
- Settlement používá skóre příslušného týmu v základní době. Ne celkový počet gólů.
  Neznámý výsledek zůstává pending, skutečný void je nehodnocený.
- Denní výběr dál maximálně pět položek, jeden fixture a dvě položky na ligu.
  Vyšší pravděpodobnost sama neznamená výhodnější sázku ani prokázanou kalibraci.

## Rozhraní

- Výsledky, Denní výběr a Výkonnost používají společný ModelOnlyPanel.
- Vybrané / Všechny kvalifikované / Všechny predikce; filtr modelu a verze.
- Kvalifikační filtr probíhá v SQL před stránkováním (30 položek).
- Historický TOP 3 zůstává v rozbalovacím archivu, načítaném až při otevření.
- Detail zápasu: hlavní 1X2, gólové odhady, zmrazené modelové tipy; technická
  evidence, průběhový audit a cenová historie až po rozbalení.
- Telegram /tipy tymove_goly, /dalsi tymove_goly, /vysledky tymove_goly čte stejný
  kvalifikovaný ledger. Ranní TOP 3 může obsahovat týmové góly; jejich přítomnost
  v konkrétní ranní zprávě není garantována. Starší potvrzená publikace 2001
  z předchozího dne zůstává dostupná pro přechodové ranní výsledky.

## Provoz

Bez nové migrace a bez provider volání. Na fixture přibývají čtyři malé skalární
záznamy. Počet dávkových čtecích dotazů se nemění; objem ukládání roste.
Nasadit kód, spustit predict-upcoming a daily-selection. Neprovádět historický
backfill: první nové záznamy pouze před výkopem. Starší záznamy zůstanou v archivu.
AI flagy, pozastavené sestavy, BTTS a ostatní experimenty se neaktivují.
