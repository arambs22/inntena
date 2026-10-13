import { describe, expect, it } from "vitest";
import type { KeywordTrend, SupplyItem, TrendPoint } from "./types";
import { buildInsights } from "./keywordInsights";

function timeline(first: number, second: number): TrendPoint[] {
  return [...Array(14).fill(first), ...Array(14).fill(second)].map((value, index) => ({
    date: new Date(Date.UTC(2026, 7, 1 + index)).toISOString().slice(0, 10),
    value,
  }));
}
const trend = (id: number, first: number, second: number): KeywordTrend => ({ id, term: `k${id}`, category: "c", timeline: timeline(first, second) });
const item = (keywordId: number, count: number | null, status: SupplyItem["status"] = "fresh"): SupplyItem => ({
  keywordId,
  count,
  fetchedAt: count === null ? null : "2026-10-09T10:00:00Z",
  status,
});

describe("buildInsights", () => {
  it("combines rising demand with low supply into an opportunity", () => {
    const insights = buildInsights([{ id: 1 }], [trend(1, 100, 134)], [item(1, 5_000)]);
    expect(insights.get(1)).toMatchObject({ momentum: "rising", level: "low", verdict: "opportunity" });
  });

  it("treats a count of zero as real data: low supply, so rising demand is an opportunity", () => {
    const insights = buildInsights([{ id: 1 }], [trend(1, 100, 134)], [item(1, 0)]);
    expect(insights.get(1)).toMatchObject({ level: "low", verdict: "opportunity" });
  });

  it("gives no verdict while the count is unknown", () => {
    const insights = buildInsights([{ id: 1 }], [trend(1, 100, 134)], [item(1, null, "refreshing")]);
    expect(insights.get(1)).toMatchObject({ momentum: "rising", level: null, verdict: null });
    expect(insights.get(1)!.supply!.status).toBe("refreshing");
  });

  it("gives no verdict when there is not enough trend data", () => {
    const insights = buildInsights([{ id: 1 }], [{ id: 1, term: "k", category: "c", timeline: [] }], [item(1, 500)]);
    expect(insights.get(1)).toMatchObject({ momentum: "unknown", level: "low", verdict: null });
  });

  it("copes with a keyword that has no trend entry and no supply item", () => {
    const insights = buildInsights([{ id: 7 }], undefined, []);
    expect(insights.get(7)).toEqual({ momentum: "unknown", changePct: null, supply: null, level: null, verdict: null });
  });

  it("builds one insight per keyword and matches each to its own data", () => {
    const insights = buildInsights(
      [{ id: 1 }, { id: 2 }],
      [trend(1, 100, 134), trend(2, 100, 70)],
      [item(1, 500_000), item(2, 500)],
    );
    expect(insights.get(1)!.verdict).toBe("crowded");
    expect(insights.get(2)!.verdict).toBe("cooling");
  });
});
