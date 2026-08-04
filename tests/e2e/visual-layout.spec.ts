import { expect, test } from "playwright/test";

const widths = [360, 390, 768, 1280, 1440] as const;

for (const width of widths) {
  test(`produktový dashboard při šířce ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const desktopNav = page.getByRole("navigation", { name: "Hlavní navigace" });
    const mobileNav = page.getByRole("navigation", { name: "Hlavní mobilní navigace" });
    if (width >= 1024) {
      await expect(desktopNav).toBeVisible();
      await expect(mobileNav).toBeHidden();
    } else {
      await expect(desktopNav).toBeHidden();
      await expect(mobileNav).toBeVisible();
    }

    await testInfo.attach(`home-${width}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test(`ligové žebříčky při šířce ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tabulky", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Herní profil ligy" })).toBeVisible();
    await testInfo.attach(`standings-${width}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test(`kontext porovnání při šířce ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      "/porovnani?mode=CLUB&homeLeague=140&awayLeague=140&home=541&away=529",
      { waitUntil: "networkidle" }
    );
    await expect(page.getByText("Posledních 5", { exact: true })).toBeVisible();
    await expect(page.getByText("xG trend", { exact: true })).toBeVisible();
    await testInfo.attach(`compare-context-${width}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}
