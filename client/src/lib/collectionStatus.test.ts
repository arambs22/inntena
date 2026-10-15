import { describe, expect, it } from "vitest";
import { failedRegions, formatAttemptTime, latestFailure } from "./collectionStatus";
import type { KeywordRegionStatus } from "./types";

function status(overrides: Partial<KeywordRegionStatus> = {}): KeywordRegionStatus {
  return {
    blocked: false,
    lastAttemptAt: "2026-10-14T06:00:00.000Z",
    lastSuccessAt: null,
    consecutiveFailures: 0,
    lastFailedAt: null,
    failureReason: null,
    ...overrides,
  };
}

const failed = (at: string, reason: "googleBlocked" | "other" = "googleBlocked", extra: Partial<KeywordRegionStatus> = {}) =>
  status({ lastFailedAt: at, failureReason: reason, consecutiveFailures: 1, ...extra });

describe("failedRegions", () => {
  it("returns only the requested regions whose last attempt failed", () => {
    const byGeo = { US: failed("2026-10-14T06:00:00Z"), MX: status(), ES: failed("2026-10-14T07:00:00Z", "other") };
    expect(failedRegions(byGeo, ["US", "MX"]).map((r) => r.geo)).toEqual(["US"]);
  });

  it("returns an empty list without status data", () => {
    expect(failedRegions(undefined, ["US"])).toEqual([]);
  });
});

describe("latestFailure", () => {
  it("is null when nothing failed or there is no status", () => {
    expect(latestFailure({ US: status() }, ["US"])).toBeNull();
    expect(latestFailure(undefined, ["US"])).toBeNull();
    expect(latestFailure({}, [])).toBeNull();
  });

  it("picks the most recent failure among the visible regions", () => {
    const byGeo = {
      US: failed("2026-10-13T06:00:00Z", "other"),
      MX: failed("2026-10-14T06:00:00Z", "googleBlocked"),
      ES: failed("2026-10-15T06:00:00Z", "other"),
    };
    expect(latestFailure(byGeo, ["US", "MX"])).toEqual({ at: "2026-10-14T06:00:00Z", reason: "googleBlocked" });
  });

  it("ignores failures in regions that are not visible", () => {
    expect(latestFailure({ ES: failed("2026-10-15T06:00:00Z") }, ["US"])).toBeNull();
  });
});

describe("formatAttemptTime", () => {
  it("formats a valid timestamp using the locale", () => {
    const text = formatAttemptTime("2026-10-14T06:00:00Z", "en-US");
    expect(text).toMatch(/2026/);
    expect(text).not.toContain("T06");
  });

  it("returns unparseable input unchanged", () => {
    expect(formatAttemptTime("not a date", "en-US")).toBe("not a date");
  });
});
