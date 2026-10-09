import { describe, expect, test } from "vitest";
import type { TrendPoint } from "./types";
import { countChartDays, parseStoredRange, sliceSeries, sliceTimeline } from "./trendChart";

/** Builds `count` consecutive daily points ending on `end` (YYYY-MM-DD, UTC). */
function daily(end: string, count: number): TrendPoint[] {
  const [y, m, d] = end.split("-").map(Number);
  const endMs = Date.UTC(y, m - 1, d);
  const points: TrendPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    points.push({ date: new Date(endMs - i * 86_400_000).toISOString().slice(0, 10), value: count - i });
  }
  return points;
}

describe("sliceTimeline", () => {
  test("90 consecutive days sliced to 7 and 30 end on the latest date", () => {
    const data = daily("2026-10-01", 90);
    const seven = sliceTimeline(data, 7);
    const thirty = sliceTimeline(data, 30);
    expect(seven).toHaveLength(7);
    expect(thirty).toHaveLength(30);
    expect(seven[seven.length - 1].date).toBe("2026-10-01");
    expect(thirty[thirty.length - 1].date).toBe("2026-10-01");
    expect(seven[0].date).toBe("2026-09-25");
  });

  test("fewer points than the window returns everything", () => {
    const data = daily("2026-10-01", 5);
    expect(sliceTimeline(data, 30)).toEqual(data);
  });

  test("cuts by calendar date when there are gaps, not by index", () => {
    const data: TrendPoint[] = [
      { date: "2026-09-01", value: 1 },
      { date: "2026-09-20", value: 2 },
      { date: "2026-09-28", value: 3 },
      { date: "2026-10-01", value: 4 },
    ];
    expect(sliceTimeline(data, 7).map((p) => p.date)).toEqual(["2026-09-28", "2026-10-01"]);
    expect(sliceTimeline(data, 14).map((p) => p.date)).toEqual(["2026-09-20", "2026-09-28", "2026-10-01"]);
  });

  test("empty timeline gives empty output", () => {
    expect(sliceTimeline([], 7)).toEqual([]);
  });

  test("does not mutate the input and returns a new array", () => {
    const data = daily("2026-10-01", 10);
    const copy = data.map((p) => ({ ...p }));
    const result = sliceTimeline(data, 90);
    expect(data).toEqual(copy);
    expect(result).not.toBe(data);
  });

  test("window crosses a month boundary", () => {
    const result = sliceTimeline(daily("2026-03-02", 10), 5);
    expect(result.map((p) => p.date)).toEqual([
      "2026-02-26",
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  test("window crosses a year boundary", () => {
    const result = sliceTimeline(daily("2027-01-02", 10), 4);
    expect(result.map((p) => p.date)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  test("window includes a leap day", () => {
    const result = sliceTimeline(daily("2028-03-01", 10), 3);
    expect(result.map((p) => p.date)).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });
});

describe("sliceSeries", () => {
  test("aligns every series on the global latest date", () => {
    const long = daily("2026-10-10", 10);
    const short = daily("2026-10-05", 10);
    const [a, b] = sliceSeries(
      [
        { region: "", timeline: long },
        { region: "US", timeline: short },
      ],
      3
    );
    expect(a.timeline.map((p) => p.date)).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
    expect(b.timeline).toEqual([]);
    expect(b.region).toBe("US");
  });

  test("a series ending earlier keeps points inside the shared window", () => {
    const [, b] = sliceSeries(
      [
        { region: "", timeline: daily("2026-10-10", 10) },
        { region: "US", timeline: daily("2026-10-08", 10) },
      ],
      5
    );
    expect(b.timeline.map((p) => p.date)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"]);
  });

  test("empty series and empty timelines", () => {
    expect(sliceSeries([], 7)).toEqual([]);
    expect(sliceSeries([{ region: "", timeline: [] }], 7)).toEqual([{ region: "", timeline: [] }]);
  });

  test("does not mutate the input", () => {
    const input = [{ region: "", timeline: daily("2026-10-10", 10) }];
    const copy = JSON.parse(JSON.stringify(input));
    sliceSeries(input, 3);
    expect(input).toEqual(copy);
  });
});

describe("countChartDays", () => {
  test("counts distinct dates across series", () => {
    expect(
      countChartDays([
        { region: "", timeline: daily("2026-10-03", 3) },
        { region: "US", timeline: daily("2026-10-04", 3) },
      ])
    ).toBe(4);
  });
});

describe("parseStoredRange", () => {
  test("accepts valid ranges", () => {
    expect(parseStoredRange("7")).toBe(7);
    expect(parseStoredRange("30")).toBe(30);
    expect(parseStoredRange("90")).toBe(90);
  });

  test("falls back to the default for null, garbage and empty", () => {
    expect(parseStoredRange(null)).toBe(90);
    expect(parseStoredRange("abc")).toBe(90);
    expect(parseStoredRange("30abc")).toBe(90);
    expect(parseStoredRange("0")).toBe(90);
    expect(parseStoredRange("")).toBe(90);
  });
});
