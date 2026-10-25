# VALUE singly a rozpad tiketů

## Rozsah změny

VALUE nabízí dnešní již kvalifikované kombinace výsledek + góly nezávisle na
vzniku akumulátoru. Čte stejný krátký uložený přehled jako `/tipy value`.
Není to nová policy, změna kvalifikačních filtrů ani nový ziskovostní důkaz.
ROI starých akumulátorů se nevydává za ROI singlů. Modely, settlement,
neměnné ceny, provider sběr a generování historických tiketů se nemění.

Bez preference kanceláře: vždy uvádíme skutečný referenční bookmaker.
Českou dostupnost celé kombinace musí uživatel ověřit; dílčí kurzy nenásobíme.
Minimum se odvozuje ze stejných cenových bran policy 11: raw EV, konzervativní
EV a efektivita přidané podmínky při zachovaném referenčním kurzu samotné výhry.
Zaokrouhluje se nahoru na setinu, maximum zůstává 6. Jiná kancelář může mít jiné
podklady, proto minimum není zárukou kvalifikace nebo zisku. Starý payload bez
cenového auditu zobrazí „minimum nezachyceno“. Nové pole doplní další stávající
běh daily-selection; žádný nový sběr není potřeba.

## Rozhraní

- Strategie → VALUE: aktuální samostatné kombinace, přímá cena, bookmaker a čas.
- Strategie → VALUE/ELO: historie do 30 dní, přesný rozpad tiketů včetně skóre,
  výsledku celé kombinace a dílčích podmínek. Detail chybějící nohy je explicitní.
- `/vysledky`, `/vysledky YYYY-MM-DD`: zachovaná syntaxe.
- `/vysledky value [YYYY-MM-DD]`, `/vysledky elo [YYYY-MM-DD]`: výběr strategie.
- `/tipy value`: současné jednotlivé kvalifikované výběry, již existující příkaz.

Nový PRO read `?strategy=VALUE&singles=1` čte jediný klíč ApiCache, ne historii.
Stará/budoucí cena, výkop za méně než 30 minut, neplatné datum projekce či staré
podklady znamenají odmítnutí. Výpis je stránkovaný po 30, payload omezený na 200.

## Integrita historie

Každý tiket nese vlastní nohy. Dvě odlišné kombinace na stejném fixture se neslučují.
Starší payload bez vlastních noh používá pouze jednoznačné členství v ticket slotu;
neznámé nebo duplicitní členství se nedoplňuje odhadem.
Dílčí diagnóza se počítá pouze ze strukturovaného trhu a vyhodnoceného skóre,
nikoli parsováním názvu sázky. Live skóre ani chybějící skóre nejsou settlement.
Celkový výsledek a profit jsou nadále autoritativní uložené hodnoty.

Nasazení nevyžaduje migraci, nový flag ani nový cron. Aktuální singly potřebují
existující úspěšný `daily-selection` běh stejně jako `/tipy`.
