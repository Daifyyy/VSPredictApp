import { describe, expect, it } from "vitest";
import { rejectCrossSiteMutation } from "./requestSecurity";

describe("rejectCrossSiteMutation", () => {
  it("povolí stejný původ a serverové volání bez Origin", () => {
    expect(rejectCrossSiteMutation(new Request("https://app.test/api/tips"))).toBeNull();
    expect(rejectCrossSiteMutation(new Request("https://app.test/api/tips", { headers: { origin: "https://app.test" } }))).toBeNull();
  });

  it("odmítne browserovou cross-site mutaci", () => {
    expect(rejectCrossSiteMutation(new Request("https://app.test/api/tips", { headers: { origin: "https://evil.test", "sec-fetch-site": "cross-site" } }))?.status).toBe(403);
  });
});
