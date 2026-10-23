import { describe, expect, it } from "vitest";
import { GET } from "./route";
describe("retired duplicate portfolio",()=>{
  it("returns only the replacement route without a history query",async()=>{
    const response=await GET();
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({code:"PORTFOLIO_CONSOLIDATED",replacement:"/strategie"});
  });
});
