import { describe, expect, it } from "vitest";
import { buttonClass } from "./primitives";

describe("buttonClass", () => {
  it("keeps a visible focus state and minimum touch target", () => {
    const classes = buttonClass("accent", "md");
    expect(classes).toContain("focus-visible:outline-none");
    expect(classes).toContain("min-h-11");
    expect(classes).toContain("bg-accent");
  });

  it("preserves caller classes", () => {
    expect(buttonClass("ghost", "sm", "w-full")).toContain("w-full");
  });
});
