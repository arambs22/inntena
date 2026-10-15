import { describe, expect, it } from "vitest";
import { TRANSLATIONS } from "./i18n";
import { clampPage, describeOrigin, nextPage, pageCount, pageOf } from "./discover";

describe("describeOrigin", () => {
  const en = TRANSLATIONS.en;
  const es = TRANSLATIONS.es;
  it("describes a rising Google Shopping search with its growth", () => {
    expect(describeOrigin({ type: "shopping", seed: "clipart", growth: "4400" }, en)).toBe("Rising in Google Shopping (+4,400%)");
    expect(describeOrigin({ type: "shopping", seed: "clipart", growth: "4400" }, es, "es-MX")).toBe("En alza en Google Shopping (+4,400%)");
  });
  it("labels huge growth as Breakout", () => {
    expect(describeOrigin({ type: "shopping", seed: "x", growth: "Breakout" }, en)).toBe("Rising in Google Shopping (Breakout)");
    expect(describeOrigin({ type: "shopping", seed: "x", growth: "9000" }, en)).toBe("Rising in Google Shopping (Breakout)");
  });
  it("names the season and the days left", () => {
    expect(describeOrigin({ type: "season", event: "halloween", daysUntil: 17 }, en)).toBe("Season: Halloween in 17 days");
    expect(describeOrigin({ type: "season", event: "weddings", daysUntil: 0 }, en)).toBe("Season: Wedding season (now)");
  });
  it("names the catalog family in both languages", () => {
    expect(describeOrigin({ type: "catalog", family: "wallArt" }, en)).toBe("Digital product niche · Wall art");
    expect(describeOrigin({ type: "catalog", family: "wallArt" }, es)).toBe("Nicho de producto digital · Arte para pared");
  });
});

describe("paging", () => {
  const items = Array.from({ length: 12 }, (_, i) => i);
  it("counts pages, at least one", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(5)).toBe(1);
    expect(pageCount(6)).toBe(2);
    expect(pageCount(12)).toBe(3);
  });
  it("slices pages and clamps out-of-range ones", () => {
    expect(pageOf(items, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(pageOf(items, 2)).toEqual([10, 11]);
    expect(pageOf(items, 9)).toEqual([10, 11]);
    expect(pageOf(items, -1)).toEqual([0, 1, 2, 3, 4]);
    expect(pageOf([], 3)).toEqual([]);
  });
  it("advances and wraps to the first page after the last", () => {
    expect(nextPage(0, 12)).toBe(1);
    expect(nextPage(2, 12)).toBe(0);
    expect(nextPage(0, 5)).toBe(0);
    expect(nextPage(7, 12)).toBe(0);
  });
  it("clamps invalid page values", () => {
    expect(clampPage(Number.NaN, 12)).toBe(0);
    expect(clampPage(1.5, 12)).toBe(0);
    expect(clampPage(99, 12)).toBe(2);
  });
});
