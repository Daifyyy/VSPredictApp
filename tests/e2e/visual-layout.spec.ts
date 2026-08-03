import { expect, test } from "playwright/test";

const widths = [360, 390, 768, 1280, 1440] as const;

for (const width of widths) {
  test(`redakční shell při šířce ${width}px`, async ({ page }, testInfo) => {
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
}
