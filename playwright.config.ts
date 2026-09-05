import { defineConfig, devices } from "playwright/test";

const PORT = 3212;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Next dev kompiluje routy lazy; paralelní první návštěvy na Windows zahltily Turbopack
  // a dělaly z testu měření studené kompilace místo UI. Jeden worker je stabilnější.
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    // Webpack je pro krátký E2E proces na Windows stabilnější při startu i ukončení;
    // produkční build dál používá výchozí Turbopack.
    command: `node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATA_SOURCE: "mock",
    },
  },
});
