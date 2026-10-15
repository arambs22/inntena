import { describe, expect, it } from "vitest";
import type { SupplyResponse } from "./types";
import type { SupplyItem } from "./types";
import { SUPPLY_MAX_AGE_MS, SUPPLY_REFETCH_AGE_MS, applySupplyCutoff, needsAgeRefetch, needsRepoll } from "./useSupply";
import { nextPollDelay } from "./polling";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const item = (count: number | null, ageMs: number | null, status: SupplyItem["status"] = "fresh"): SupplyItem => ({
  keywordId: 1,
  count,
  fetchedAt: ageMs === null ? null : new Date(NOW - ageMs).toISOString(),
  status,
  local: null,
});

describe("applySupplyCutoff", () => {
  it("shows a count of exactly 24 h", () => {
    expect(applySupplyCutoff([item(5, SUPPLY_MAX_AGE_MS)], NOW)[0].count).toBe(5);
  });

  it("hides a count older than 24 h as unavailable", () => {
    const [out] = applySupplyCutoff([item(5, SUPPLY_MAX_AGE_MS + 1)], NOW);
    expect(out.count).toBeNull();
    expect(out.fetchedAt).toBeNull();
    expect(out.status).toBe("unavailable");
  });

  it("hides a count that has no fetchedAt", () => {
    const [out] = applySupplyCutoff([item(5, null)], NOW);
    expect(out.count).toBeNull();
    expect(out.status).toBe("unavailable");
  });

  it("keeps a count of 0 within 24 h", () => {
    expect(applySupplyCutoff([item(0, 1000)], NOW)[0].count).toBe(0);
  });

  it("leaves items without a count untouched", () => {
    const refreshing = item(null, null, "refreshing");
    expect(applySupplyCutoff([refreshing], NOW)[0]).toEqual(refreshing);
  });
});

describe("needsAgeRefetch", () => {
  it("is false while the only count is younger than 12 h", () => {
    expect(needsAgeRefetch([item(5, SUPPLY_REFETCH_AGE_MS - 1)], NOW)).toBe(false);
  });

  it("is true once the only count reaches 12 h", () => {
    expect(needsAgeRefetch([item(5, SUPPLY_REFETCH_AGE_MS)], NOW)).toBe(true);
  });

  it("uses the oldest count: one old item triggers a refetch even if another is fresh", () => {
    expect(needsAgeRefetch([item(5, SUPPLY_REFETCH_AGE_MS + 1), { ...item(7, 1000), keywordId: 2 }], NOW)).toBe(true);
    expect(needsAgeRefetch([{ ...item(7, 1000), keywordId: 2 }, { ...item(8, 2000), keywordId: 3 }], NOW)).toBe(false);
  });

  it("is false when no count is displayed", () => {
    expect(needsAgeRefetch([item(null, null)], NOW)).toBe(false);
    expect(needsAgeRefetch([], NOW)).toBe(false);
  });
});

const response = (status: "fresh" | "refreshing" | "unavailable", enabled = true): SupplyResponse => ({
  enabled,
  items: [{ keywordId: 1, count: null, fetchedAt: null, status, local: null }],
});

describe("needsRepoll", () => {
  it("polls again while something is still refreshing", () => {
    expect(needsRepoll(response("refreshing"), 0)).toBe(true);
  });

  it("stops once everything has settled", () => {
    expect(needsRepoll(response("fresh"), 0)).toBe(false);
    expect(needsRepoll(response("unavailable"), 0)).toBe(false);
  });

  it("stops at the end of the shared poll schedule even if still refreshing", () => {
    let last = 0;
    while (nextPollDelay(last + 1) !== null) last++;
    expect(needsRepoll(response("refreshing"), last)).toBe(true);
    expect(needsRepoll(response("refreshing"), last + 1)).toBe(false);
  });

  it("polls again while only the seller-country count is refreshing", () => {
    const onlyLocal: SupplyResponse = {
      enabled: true,
      items: [
        {
          keywordId: 1,
          count: 5,
          fetchedAt: new Date(NOW).toISOString(),
          status: "fresh",
          local: { region: "MX", count: null, fetchedAt: null, status: "refreshing" },
        },
      ],
    };
    expect(needsRepoll(onlyLocal, 0)).toBe(true);
    expect(needsRepoll(onlyLocal, 10)).toBe(false);
  });

  it("does not poll when main and local counts are fresh or unavailable", () => {
    const settled: SupplyResponse = {
      enabled: true,
      items: [
        { keywordId: 1, count: 5, fetchedAt: null, status: "fresh", local: { region: "MX", count: 1, fetchedAt: null, status: "fresh" } },
        { keywordId: 2, count: null, fetchedAt: null, status: "unavailable", local: { region: "MX", count: null, fetchedAt: null, status: "unavailable" } },
      ],
    };
    expect(needsRepoll(settled, 0)).toBe(false);
  });

  it("does not poll when the feature is disabled or nothing has loaded", () => {
    expect(needsRepoll(response("refreshing", false), 0)).toBe(false);
    expect(needsRepoll(null, 0)).toBe(false);
  });
});

describe("applySupplyCutoff and local supply", () => {
  it("clears a stale local count even when the main count is fresh", () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    const fresh = new Date(now - 1000).toISOString();
    const stale = new Date(now - SUPPLY_MAX_AGE_MS - 1).toISOString();
    const [item] = applySupplyCutoff(
      [{ keywordId: 1, count: 5, fetchedAt: fresh, status: "fresh", local: { region: "MX", count: 0, fetchedAt: stale, status: "fresh" } }],
      now,
    );
    expect(item!.count).toBe(5);
    expect(item!.local).toEqual({ region: "MX", count: null, fetchedAt: null, status: "unavailable" });
  });
});
