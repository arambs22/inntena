import { describe, expect, it } from "vitest";
import { BREAKOUT_THRESHOLD, formatGrowth, growthLocale } from "./growth";

describe("formatGrowth", () => {
  it("shows a raw Google value as a signed percentage", () => {
    expect(formatGrowth("40", "en-US")).toEqual({ kind: "percent", text: "+40%" });
    expect(formatGrowth("250", "en-US")).toEqual({ kind: "percent", text: "+250%" });
  });

  it("groups thousands according to the locale", () => {
    expect(formatGrowth("1250", "en-US")).toEqual({ kind: "percent", text: "+1,250%" });
    // es-MX uses a comma for thousands too, es-ES would not; the point is that the locale is honored.
    expect(formatGrowth("1250", "de-DE")).toEqual({ kind: "percent", text: "+1.250%" });
  });

  it("calls growth above the breakout threshold a breakout", () => {
    expect(formatGrowth(String(BREAKOUT_THRESHOLD + 1), "en-US")).toEqual({ kind: "breakout" });
    expect(formatGrowth("836500", "en-US")).toEqual({ kind: "breakout" });
  });

  it("keeps growth at exactly the threshold as a percentage, since breakout means more than 5,000%", () => {
    expect(formatGrowth(String(BREAKOUT_THRESHOLD), "en-US")).toEqual({ kind: "percent", text: "+5,000%" });
  });

  it("recognizes a literal Breakout string", () => {
    expect(formatGrowth("Breakout", "en-US")).toEqual({ kind: "breakout" });
    expect(formatGrowth("breakout", "en-US")).toEqual({ kind: "breakout" });
  });

  it("passes through values that already carry their own formatting", () => {
    expect(formatGrowth("+250%", "en-US")).toEqual({ kind: "raw", text: "+250%" });
  });

  it("falls back to the raw text for anything it cannot read, instead of inventing a number", () => {
    expect(formatGrowth("n/a", "en-US")).toEqual({ kind: "raw", text: "n/a" });
    expect(formatGrowth("", "en-US")).toEqual({ kind: "raw", text: "" });
  });

  it("tolerates surrounding whitespace", () => {
    expect(formatGrowth(" 250 ", "en-US")).toEqual({ kind: "percent", text: "+250%" });
  });
});

describe("growthLocale", () => {
  it("maps each UI language to a number-formatting locale", () => {
    expect(growthLocale("es")).toBe("es-MX");
    expect(growthLocale("en")).toBe("en-US");
  });
});
