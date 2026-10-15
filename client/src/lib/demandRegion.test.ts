import { describe, expect, it } from "vitest";
import { resolveDemandRegion } from "./demandRegion";

describe("resolveDemandRegion", () => {
  it("keeps the stored region while it is active", () => {
    expect(resolveDemandRegion("MX", ["", "US", "MX"])).toBe("MX");
  });
  it("falls back to the first active region when the stored one is gone or missing", () => {
    expect(resolveDemandRegion("FR", ["US", "MX"])).toBe("US");
    expect(resolveDemandRegion(null, ["", "US"])).toBe("");
  });
  it("treats worldwide ('') as a valid stored region", () => {
    expect(resolveDemandRegion("", ["US", ""])).toBe("");
  });
  it("is undefined when no region is active", () => {
    expect(resolveDemandRegion("US", [])).toBeUndefined();
  });
});
