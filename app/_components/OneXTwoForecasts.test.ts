import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OneXTwoForecasts, type OneXTwoForecast } from "./OneXTwoForecasts";

const fixture = (id: number): OneXTwoForecast => ({
  fixtureId: id, homeName: `Home-${id}`, awayName: `Away-${id}`,
  kickoff: "2026-10-23T18:00:00Z", capturedAt: "2026-10-23T10:00:00Z",
  modelVersion: 8, probabilities: [0.5, 0.3, 0.2], market: [0.45, 0.3, 0.25], quality: "COMPLETE",
});
const render = (rows?: OneXTwoForecast[], truncated?: boolean) => renderToStaticMarkup(createElement(OneXTwoForecasts, { rows, truncated }));

describe("OneXTwoForecasts", () => {
  it("identifies truncated counts as loaded records, not the complete day", () => {
    const html = render(Array.from({ length: 200 }, (_, i) => fixture(i + 1)), true);
    expect(html).toContain("Přehled je zkrácený");
    expect(html).toContain("nepokrývají celý den");
    expect(html).toContain("1–30 z 200 načtených záznamů · strana 1/7");
    expect(html.match(/<article/g)).toHaveLength(30);
  });

  it.each([undefined, false])("does not warn when truncation is absent or false", truncated => {
    expect(render([fixture(1)], truncated)).not.toContain("Přehled je zkrácený");
  });

  it("keeps the truncation warning even when no valid rows remain", () => {
    const html = render([], true);
    expect(html).toContain("Přehled je zkrácený");
    expect(html).toContain("Úplný předzápasový audit pro tento den zatím není zachycen");
    expect(html).not.toContain("strana");
  });
  it.each([undefined, []])("treats missing or empty audit as not captured", rows => {
    const html = render(rows);
    expect(html).toContain("Úplný předzápasový audit pro tento den zatím není zachycen");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("0 %");
  });

  it("shows all three immutable opening probabilities and market benchmark", () => {
    const html = render([fixture(1)]);
    for (const text of ["Zachycené předzápasové pravděpodobnosti · současný model", "1 · Domácí", "X · Remíza", "2 · Hosté", "50.0 %", "30.0 %", "20.0 %", "45.0 %", "25.0 %", "Model v8", "COMPLETE", "zachyceno", "nikoli nově nasazený model"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Kurz");
    expect(html).not.toContain("EV");
  });

  it("marks absent market data without inventing zero probabilities", () => {
    const html = render([{ ...fixture(1), market: null }]);
    expect(html).toContain("Tržní srovnání není zachyceno.");
    expect(html.match(/<td>—<\/td>/g)).toHaveLength(3);
  });

  it("limits the first page to 30 fixtures and exposes the next page", () => {
    const html = render(Array.from({ length: 31 }, (_, i) => fixture(i + 1)));
    expect(html.match(/<article/g)).toHaveLength(30);
    expect(html).toContain("Home-30");
    expect(html).not.toContain("Home-31");
    expect(html).toContain("1–30 z 31 · strana 1/2");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Předchozí/);
    expect(html).toMatch(/<button type="button" class="[^"]*">Další/);
  });

  it("disables both pagination buttons for one full page", () => {
    const html = render(Array.from({ length: 30 }, (_, i) => fixture(i + 1)));
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("strana 1/1");
  });
});
