import { expect, test } from "playwright/test";

test("domovská stránka nabízí zápasy a rychlé vstupy", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveTitle("Fotbalové zápasy dnes a tento týden");
  await expect(
    page.getByRole("heading", { level: 1, name: /Dnešní fotbal|Nejbližší fotbalový program/ })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Porovnat dva týmy" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Program/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Výsledky/ })).toBeVisible();
});

test("globální našeptávač otevře správný profil týmu", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const mobile = test.info().project.name.startsWith("mobile");
  if (mobile) {
    await page.getByRole("button", { name: "Vyhledat tým" }).click();
    await expect(page.getByRole("dialog", { name: "Vyhledávání týmů" })).toBeVisible();
  }
  const search = page.getByRole("combobox", { name: "Vyhledat tým" });
  const response = page.waitForResponse((candidate) => candidate.url().includes("/api/search/teams?q=") && candidate.ok());
  await search.fill("Manchester City");
  await response;
  const option = page.getByRole("option", { name: /Manchester City/ }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  await expect(page).toHaveURL(/\/tym\/50\?league=39/);
});

test("hlavní analytické sekce jsou dosažitelné z navigace", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const mobile = test.info().project.name.startsWith("mobile");
  const navigation = page.getByRole("navigation", {
    name: mobile ? "Hlavní mobilní navigace" : "Hlavní navigace",
  });
  await navigation
    .getByRole("link", { name: mobile ? "Analýzy" : /Porovnání/ })
    .click();

  // CompareApp doplní výchozí režim a ligy do query stringu; důležitá je routa.
  await expect(page).toHaveURL(/\/porovnani(?:\?|$)/);
  const analysisNav = page.getByRole("navigation", { name: "Sekce analýz" });
  if (mobile) {
    await expect(analysisNav.getByRole("link", { name: "Porovnání" })).toBeVisible();
    await expect(analysisNav.getByRole("link", { name: "Tabulky" })).toBeVisible();
    await expect(analysisNav.getByRole("link", { name: "Predikce" })).toBeVisible();
    await expect(analysisNav.getByRole("link", { name: "Model vs. trh" })).toBeVisible();
    await expect(analysisNav.getByRole("link", { name: "Přestupy" })).toBeVisible();
  } else {
    await expect(navigation.getByRole("link", { name: /Tabulky/ })).toBeVisible();
    await expect(navigation.getByRole("link", { name: /Predikce/ })).toBeVisible();
    await expect(navigation.getByRole("link", { name: /Model vs\. trh/ })).toBeVisible();
    await expect(navigation.getByRole("link", { name: /Přestupy/ })).toBeVisible();
  }
});

test("starý sdílený odkaz zachová parametry a přesměruje na porovnání", async ({ page }) => {
  await page.goto("/?home=10&away=20&homeLeague=39&awayLeague=39", {
    waitUntil: "domcontentloaded",
  });

  await expect(page).toHaveURL(/\/porovnani\?.*home=10.*away=20/);
});

test("mobilní navigace je viditelná a nepřekrývá konec stránky", async ({ page }) => {
  test.skip(!test.info().project.name.startsWith("mobile"), "Pouze mobilní projekt");
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const nav = page.getByRole("navigation", { name: "Hlavní mobilní navigace" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Zápasy" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Analýzy" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Tipy" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Manažer" })).toBeVisible();

  const navBox = await nav.boundingBox();
  const viewport = page.viewportSize();
  expect(navBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.round((navBox?.y ?? 0) + (navBox?.height ?? 0))).toBeLessThanOrEqual(
    viewport?.height ?? 0
  );
});

test("detail týmu přepíná výkon celkem, doma a venku", async ({ page }) => {
  await page.goto("/tym/50?league=39", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Manchester City" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Herní profil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Statistická výkonnost" })).toBeVisible();
  await page.getByRole("link", { name: "Doma", exact: true }).click();
  await expect(page).toHaveURL(/venue=HOME/);
  await expect(page.getByRole("link", { name: "Doma", exact: true })).toHaveAttribute("aria-current", "page");
});

test("ligové žebříčky přepínají pohled bez dalších datových požadavků", async ({ page }) => {
  let styleRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/standings/style")) styleRequests++;
  });
  await page.goto("/tabulky", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Herní profil ligy" })).toBeVisible();
  const loadedRequests = styleRequests;
  await page.getByRole("button", { name: "Doma", exact: true }).click();
  await page.getByRole("button", { name: /Obranná odolnost/ }).click();
  await expect(page.getByRole("heading", { name: "Obranná odolnost" })).toBeVisible();
  expect(styleRequests).toBe(loadedRequests);

  await page.getByRole("button", { name: /Premier League/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Vybrat ligu" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Vyhledat ligu" }).fill("Fortuna");
  await dialog.getByRole("option", { name: /Fortuna Liga/ }).click();
  await expect(page.getByRole("button", { name: /Fortuna Liga/ }).first()).toBeVisible();
});

test("chyba přihlášení má srozumitelný návratový stav", async ({ page }) => {
  await page.goto("/auth/chyba?error=Configuration", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Přihlášení není správně nastavené" })).toBeVisible();
  await expect(page.getByText("Kód chyby: Configuration")).toBeVisible();
});
