import { describe, expect, it } from "vitest";
import type { TrendPoint } from "./types";
import {
  SUPPLY_HIGH_ABOVE,
  SUPPLY_LOW_BELOW,
  computeMomentum,
  formatCount,
  supplyLevel,
  verdictFor,
  type Momentum,
  type SupplyLevel,
  type Verdict,
} from "./opportunity";

/** Builds consecutive daily points starting 2026-08-01. */
function series(values: number[]): TrendPoint[] {
  return values.map((value, index) => ({
    date: new Date(Date.UTC(2026, 7, 1 + index)).toISOString().slice(0, 10),
    value,
  }));
}
const flat = (value: number, count: number) => Array.from({ length: count }, () => value);

describe("computeMomentum", () => {
  it("is steady when the last 14 days match the 14 before", () => {
    expect(computeMomentum(series(flat(50, 28))).momentum).toBe("steady");
  });

  it("is rising when the recent average is clearly higher, and reports the change", () => {
    const result = computeMomentum(series([...flat(100, 14), ...flat(134, 14)]));
    expect(result.momentum).toBe("rising");
    expect(result.changePct).toBeCloseTo(34, 5);
  });

  it("is cooling when the recent average is clearly lower", () => {
    expect(computeMomentum(series([...flat(100, 14), ...flat(70, 14)])).momentum).toBe("cooling");
  });

  it("treats exactly +15% as rising and exactly -15% as cooling", () => {
    expect(computeMomentum(series([...flat(100, 14), ...flat(115, 14)])).momentum).toBe("rising");
    expect(computeMomentum(series([...flat(100, 14), ...flat(85, 14)])).momentum).toBe("cooling");
  });

  it("treats +14% and -14% as steady", () => {
    expect(computeMomentum(series([...flat(100, 14), ...flat(114, 14)])).momentum).toBe("steady");
    expect(computeMomentum(series([...flat(100, 14), ...flat(86, 14)])).momentum).toBe("steady");
  });

  it("is unknown with fewer than 28 points", () => {
    expect(computeMomentum(series(flat(50, 27)))).toEqual({ momentum: "unknown", changePct: null });
    expect(computeMomentum([])).toEqual({ momentum: "unknown", changePct: null });
  });

  it("looks only at the most recent 28 points when there are more", () => {
    const ninety = [...flat(10, 62), ...flat(100, 14), ...flat(134, 14)];
    expect(computeMomentum(series(ninety)).changePct).toBeCloseTo(34, 5);
  });

  it("sorts by date, so unordered input gives the same answer", () => {
    const ordered = series([...flat(100, 14), ...flat(134, 14)]);
    const shuffled = [...ordered].reverse();
    expect(computeMomentum(shuffled)).toEqual(computeMomentum(ordered));
  });

  it("does not divide by zero when the earlier period averaged zero", () => {
    expect(computeMomentum(series([...flat(0, 14), ...flat(0, 14)]))).toEqual({ momentum: "steady", changePct: 0 });
    expect(computeMomentum(series([...flat(0, 14), ...flat(20, 14)]))).toEqual({ momentum: "rising", changePct: null });
  });

  it("does not mutate its input", () => {
    const input = series([...flat(100, 14), ...flat(134, 14)]);
    const copy = input.map((p) => ({ ...p }));
    computeMomentum(input);
    expect(input).toEqual(copy);
  });
});

describe("supplyLevel", () => {
  it.each([
    [0, "low"],
    [SUPPLY_LOW_BELOW - 1, "low"],
    [SUPPLY_LOW_BELOW, "medium"],
    [73_419, "medium"],
    [SUPPLY_HIGH_ABOVE, "medium"],
    [SUPPLY_HIGH_ABOVE + 1, "high"],
    [2_212_193, "high"],
  ] as [number, SupplyLevel][])("%i listings is %s", (count, level) => {
    expect(supplyLevel(count)).toBe(level);
  });
});

describe("verdictFor", () => {
  const matrix: [Momentum, SupplyLevel, Verdict][] = [
    ["rising", "low", "opportunity"],
    ["rising", "medium", "promising"],
    ["rising", "high", "crowded"],
    ["steady", "low", "steady"],
    ["steady", "medium", "steady"],
    ["steady", "high", "crowded"],
    ["cooling", "low", "cooling"],
    ["cooling", "medium", "cooling"],
    ["cooling", "high", "cooling"],
  ];
  it.each(matrix)("%s demand with %s supply is %s", (momentum, level, verdict) => {
    expect(verdictFor(momentum, level)).toBe(verdict);
  });

  it("gives no verdict when demand is unknown or supply is unavailable", () => {
    expect(verdictFor("unknown", "low")).toBeNull();
    expect(verdictFor("rising", null)).toBeNull();
  });
});

describe("formatCount", () => {
  it("abbreviates large counts", () => {
    expect(formatCount(73_419, "en-US")).toBe("73K");
    expect(formatCount(2_212_193, "en-US")).toBe("2.2M");
    expect(formatCount(1_500, "en-US")).toBe("1.5K");
  });

  it("leaves small counts, including zero, as they are", () => {
    expect(formatCount(0, "en-US")).toBe("0");
    expect(formatCount(999, "en-US")).toBe("999");
  });
});
