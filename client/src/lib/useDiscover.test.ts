import { describe, expect, it } from "vitest";
import type { DiscoverSuggestion } from "./types";
import { applyDiscoverCutoff, discoverNeedsRefetch } from "./useDiscover";
import { SUPPLY_MAX_AGE_MS, SUPPLY_REFETCH_AGE_MS } from "./useSupply";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const suggestion = (count: number | null, ageMs: number | null): DiscoverSuggestion => ({
  term: "t",
  origin: { type: "related", from: "x", breakout: false },
  supply: { count, status: "fresh", fetchedAt: ageMs === null ? null : new Date(NOW - ageMs).toISOString() },
});

describe("applyDiscoverCutoff", () => {
  it("shows a count exactly 24 h old and hides it a millisecond later", () => {
    expect(applyDiscoverCutoff([suggestion(5, SUPPLY_MAX_AGE_MS)], NOW)[0]!.supply?.count).toBe(5);
    expect(applyDiscoverCutoff([suggestion(5, SUPPLY_MAX_AGE_MS + 1)], NOW)[0]!.supply).toEqual({
      count: null,
      status: "unavailable",
      fetchedAt: null,
    });
  });
  it("keeps a count of 0 inside the window and hides a count without timestamp", () => {
    expect(applyDiscoverCutoff([suggestion(0, 1000)], NOW)[0]!.supply?.count).toBe(0);
    expect(applyDiscoverCutoff([suggestion(3, null)], NOW)[0]!.supply?.count).toBeNull();
  });
  it("passes through suggestions without supply", () => {
    const bare = { ...suggestion(1, 0), supply: null };
    expect(applyDiscoverCutoff([bare], NOW)).toEqual([bare]);
  });
});

describe("discoverNeedsRefetch", () => {
  it("asks once the oldest count is 12 h old", () => {
    expect(discoverNeedsRefetch([suggestion(1, SUPPLY_REFETCH_AGE_MS - 1)], NOW)).toBe(false);
    expect(discoverNeedsRefetch([suggestion(1, 10), suggestion(1, SUPPLY_REFETCH_AGE_MS)], NOW)).toBe(true);
    expect(discoverNeedsRefetch([suggestion(null, null)], NOW)).toBe(false);
  });
});
