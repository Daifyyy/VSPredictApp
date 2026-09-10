import { describe, expect, it } from "vitest";
import { isActiveSection } from "./nav";

describe("isActiveSection", () => {
  it("does not mark the homepage active on another route", () => {
    expect(isActiveSection("/predikce", "/")).toBe(false);
    expect(isActiveSection("/", "/")).toBe(true);
  });

  it("keeps nested routes in their parent section", () => {
    expect(isActiveSection("/tym/42", "/tym")).toBe(true);
    expect(isActiveSection("/tabulky", "/predikce")).toBe(false);
  });
});
