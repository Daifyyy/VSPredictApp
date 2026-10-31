import { describe, expect, it } from "vitest";
import { isActiveSection, NAV_ITEMS } from "./nav";

describe("isActiveSection", () => {
  it('exposes only program, results and performance as primary destinations', () => {
    expect(NAV_ITEMS.map(item => item.href)).toEqual(['/', '/vysledky', '/vykonnost']);
    expect(isActiveSection('/zapas/42', '/')).toBe(true);
    expect(isActiveSection('/denni-vyber', '/')).toBe(true);
  });
  it("does not mark the homepage active on another route", () => {
    expect(isActiveSection("/predikce", "/")).toBe(false);
    expect(isActiveSection("/", "/")).toBe(true);
  });

  it("keeps nested routes in their parent section", () => {
    expect(isActiveSection("/tym/42", "/tym")).toBe(true);
    expect(isActiveSection("/tabulky", "/predikce")).toBe(false);
  });
});
