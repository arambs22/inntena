import { describe, expect, it } from "vitest";
import { SAMPLES_MAX_AGE_MS, applySamplesCutoff, formatListingPrice } from "./useEtsyListings";
import type { ListingSamplesResponse } from "./types";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const listing = { listingId: 1, title: "L", price: 4, currency: "USD", url: "u", thumbnailUrl: null, favorites: 0, views: 0 };
const at = (ageMs: number): ListingSamplesResponse => ({
  enabled: true, status: "fresh", fetchedAt: new Date(NOW - ageMs).toISOString(), listings: [listing],
});

describe("formatListingPrice", () => {
  it("formats a valid currency", () => {
    expect(formatListingPrice(4.5, "USD", "en-US")).toBe("$4.50");
  });
  it("falls back instead of throwing on an invalid currency code", () => {
    expect(formatListingPrice(4.5, "not-a-code", "en-US")).toBe("4.5 not-a-code");
  });
  it("returns null without price or currency", () => {
    expect(formatListingPrice(null, "USD", "en-US")).toBeNull();
    expect(formatListingPrice(4, null, "en-US")).toBeNull();
  });
});

describe("applySamplesCutoff", () => {
  it("keeps samples exactly 6 h old and hides them a millisecond later", () => {
    expect(applySamplesCutoff(at(SAMPLES_MAX_AGE_MS), NOW).listings).toEqual([listing]);
    expect(applySamplesCutoff(at(SAMPLES_MAX_AGE_MS + 1), NOW)).toMatchObject({ listings: null, status: "unavailable" });
  });
  it("keeps an empty list as a real result", () => {
    expect(applySamplesCutoff({ ...at(1000), listings: [] }, NOW).listings).toEqual([]);
  });
  it("passes through responses without listings or when disabled", () => {
    expect(applySamplesCutoff({ enabled: false, listings: [] }, NOW)).toEqual({ enabled: false, listings: [] });
    expect(applySamplesCutoff({ enabled: true, status: "refreshing", fetchedAt: null, listings: null }, NOW).status).toBe("refreshing");
  });
});
