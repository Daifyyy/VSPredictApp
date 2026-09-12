# Neon: obnova databáze a omezení přenosu dat

## Aktuální problém

Produkční databáze odmítá dotazy chybou:

> Your project has exceeded the data transfer quota.

Na tarifu Neon Free překročení měsíčního limitu síťového přenosu pozastaví compute do dalšího fakturačního období. Důsledkem nejsou jen prázdné predikce: Auth.js nemůže načíst session, uživatel se jeví jako nepřihlášený a Google přihlášení nelze dokončit.

Známá identifikace databáze:

- endpoint projektu: `ep-icy-lab-a2v36fp8`
- region: `eu-central-1`
- databázový uživatel: `neondb_owner`
- aplikace používá pooled connection string v `DATABASE_URL`

`neondb_owner` není přihlášení do webové Neon Console. E-mail ani heslo vlastníka Neon účtu nejsou v repozitáři ani v `.env`, takže je z aplikace nelze určit.

## Jak se dostat do Neon Console

1. Otevřít [console.neon.tech](https://console.neon.tech/).
2. Přihlásit se metodou použitou při založení projektu: nejčastěji GitHub, Google nebo e-mail.
3. Nejprve vyzkoušet GitHub/Google účet, pod kterým je spravován Vercel a repozitář `Daifyyy/VSPredictApp`.
4. V seznamu organizací/projektů vyhledat projekt podle endpointu `ep-icy-lab-a2v36fp8`.
5. Pokud projekt není vidět, otevřít ve Vercelu projekt `vs-predict-app` a zkontrolovat `Settings → Integrations` nebo `Storage`. U Neon integrace použít `Manage/Open in Neon`; tím se obvykle ukáže organizace, která integraci vlastní.
6. Pokud ani to nepomůže, v e-mailových schránkách hledat `Neon`, `neon.tech`, `project created` nebo přímo `ep-icy-lab-a2v36fp8`.
7. Nevytvářet nový Neon projekt a neměnit `DATABASE_URL`, dokud není potvrzeno, že původní projekt nelze obnovit. Nový prázdný projekt by neobsahoval účty, predikce ani historii.

## Okamžitá obnova provozu

- [ ] V Neon Console otevřít projekt odpovídající endpointu `ep-icy-lab-a2v36fp8`.
- [ ] V `Billing/Plans` ověřit, že příčinou je vyčerpaný `Public network transfer`.
- [ ] Pro okamžitou obnovu přejít z Free na Launch. Alternativou je čekat na reset měsíční kvóty, během kterého zůstane databázová část aplikace mimo provoz.
- [ ] Nastavit rozpočtové upozornění a limit výdajů, pokud je Neon nabízí pro danou organizaci.
- [ ] Po obnovení ověřit v Neon SQL Editoru jednoduchý read-only dotaz `SELECT 1;`.
- [ ] Ověřit `https://vs-predict-app.vercel.app/api/me` po přihlášení.
- [ ] Ověřit stránku `/strategie` jako PRO uživatel a zkontrolovat dnešek i zítřek.
- [ ] Ručně spustit jen nezbytné crony; nespouštět opakovaně kompletní backfilly.

## Následná optimalizace aplikace

- [ ] Upravit `/api/picks/strategies`, aby při každém přepnutí strategie nenačítal celou historickou kohortu.
- [ ] Bilance aktuální verze a 30denní trend číst z denních agregovaných snapshotů; detail dne načítat pouze v rozsahu vybraného data.
- [ ] VALUE/ELO preview ponechat point-in-time, ale omezit vybrané DB sloupce a opakované načítání stejného 48hodinového okna.
- [ ] Sloučit společné dotazy pro hlavní souhrn strategií a zabránit jednomu historickému dotazu na každou kartu.
- [ ] Změřit přenos a dobu DB dotazů pro `/`, `/strategie`, `/predikce`, `/porovnani` a cron endpointy.
- [ ] Prověřit největší zdroje přenosu: široká JSON pole s kurzy, opakované Elo replaye, historické reporty, backfilly a příliš časté crony.
- [ ] Doplnit krátkodobou privátní cache tam, kde uživatelská oprávnění dovolují sdílet pouze bezpečný agregovaný výsledek.
- [ ] Nastavit provozní kontrolu spotřeby na 50 %, 80 % a 95 % měsíčního limitu.

## Bezpečnostní poznámky

- Nikam do dokumentace, issue ani chatu nekopírovat celý `DATABASE_URL`; obsahuje databázové heslo.
- Heslo z connection stringu není heslo do Neon Console.
- Změnu tarifu a fakturačních údajů musí potvrdit vlastník Neon organizace.
- Po případné změně databázového hesla aktualizovat `DATABASE_URL` ve Vercel Production i lokálním bezpečném prostředí a provést nový deployment.

## Ověřený stav nasazení

- commit `0b6085a` je nasazený na `origin/main` i ve Vercelu,
- `/strategie` odpovídá HTTP 200,
- anonymní API správně nevrací PRO data,
- Auth.js správně vytváří Google OAuth přesměrování,
- blokující příčina je vyčerpaná kvóta Neon, nikoli chybějící route nebo nefunkční Google provider.

Aktuální limity a postup při překročení jsou popsány na [oficiálním ceníku Neon](https://neon.com/pricing).
