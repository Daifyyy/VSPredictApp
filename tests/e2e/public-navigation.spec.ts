import { expect, test } from "playwright/test";

test("domovská stránka nabízí zápasy a rychlé vstupy", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveTitle("Fotbalové zápasy dnes a tento týden");
  await expect(
    page.getByRole("heading", { level: 1, name: "Zápasy bez zbytečného hledání" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Porovnat dva týmy" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Program/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Výsledky/ })).toBeVisible();
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

test("chyba přihlášení má srozumitelný návratový stav", async ({ page }) => {
  await page.goto("/auth/chyba?error=Configuration", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Přihlášení není správně nastavené" })).toBeVisible();
  await expect(page.getByText("Kód chyby: Configuration")).toBeVisible();
});
