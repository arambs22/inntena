import { describe, expect, test, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import { keywords, trendSnapshots, keywordCollectionStatus, userRegions } from "../../src/db/schema.js";
import { createTestUser } from "../helpers/factories.js";

vi.mock("../../src/services/googleTrends.service.js", () => ({
  GoogleBlockedError: class GoogleBlockedError extends Error {
    readonly code = "GOOGLE_BLOCKED";
  },
  fetchInterestOverTime: vi.fn(),
  fetchRelatedQueries: vi.fn(async () => []),
  sleep: vi.fn(async () => undefined),
}));
vi.mock("../../src/services/shoppingRising.service.js", () => ({
  collectShoppingRising: vi.fn(async () => ({ collectedSeeds: 0, failedSeeds: 0, skipped: true })),
}));

import { fetchInterestOverTime, GoogleBlockedError } from "../../src/services/googleTrends.service.js";
import { collectShoppingRising } from "../../src/services/shoppingRising.service.js";
import { collectTrendsForAllUsers, collectTrendsForAllRegions } from "../../src/services/trendCollector.service.js";

const mockedFetch = vi.mocked(fetchInterestOverTime);

describe("collectTrendsForAllUsers snapshot storage", () => {
  beforeEach(() => mockedFetch.mockReset());

  test("a later collection replaces the stored values for overlapping dates with its own normalization", async () => {
    const user = await createTestUser();
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "halloween" }).returning();

    mockedFetch.mockResolvedValueOnce([
      { date: "2026-10-01", value: 100 },
      { date: "2026-10-02", value: 40 },
    ]);
    await collectTrendsForAllUsers("");
    // Simulate a later day: the same-day guard would otherwise skip the rerun.
    await db.delete(keywordCollectionStatus);

    mockedFetch.mockResolvedValueOnce([
      { date: "2026-10-02", value: 100 },
      { date: "2026-10-03", value: 55 },
    ]);
    await collectTrendsForAllUsers("");

    const rows = await db.select().from(trendSnapshots).where(eq(trendSnapshots.keywordId, kw!.id));
    const byDate = Object.fromEntries(rows.map((r) => [r.date, r.value]));
    expect(byDate).toEqual({ "2026-10-01": 100, "2026-10-02": 100, "2026-10-03": 55 });
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

async function addKeyword(term = "halloween") {
  const user = await createTestUser();
  const [kw] = await db.insert(keywords).values({ userId: user.id, term }).returning();
  return { user, kw: kw! };
}

describe("same-day skip guard", () => {
  beforeEach(() => mockedFetch.mockReset());

  test("skips a keyword whose last success is today, without calling Google", async () => {
    const { kw } = await addKeyword();
    const now = new Date();
    await db
      .insert(keywordCollectionStatus)
      .values({ keywordId: kw.id, geo: "", lastAttemptAt: now, lastSuccessAt: now, consecutiveFailures: 0 });

    const result = await collectTrendsForAllUsers("");

    expect(mockedFetch).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  test("collects a keyword whose last success was yesterday", async () => {
    const { kw } = await addKeyword();
    const yesterday = new Date(Date.now() - DAY_MS);
    await db
      .insert(keywordCollectionStatus)
      .values({ keywordId: kw.id, geo: "", lastAttemptAt: yesterday, lastSuccessAt: yesterday, consecutiveFailures: 0 });
    mockedFetch.mockResolvedValueOnce([]);

    const result = await collectTrendsForAllUsers("");

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(1);
  });

  test("collects a keyword that has no status row", async () => {
    await addKeyword();
    mockedFetch.mockResolvedValueOnce([]);
    await collectTrendsForAllUsers("");
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  test("collects a keyword whose attempt today failed (last success is older)", async () => {
    const { kw } = await addKeyword();
    const yesterday = new Date(Date.now() - DAY_MS);
    await db.insert(keywordCollectionStatus).values({
      keywordId: kw.id,
      geo: "",
      lastAttemptAt: new Date(),
      lastSuccessAt: yesterday,
      lastErrorMessage: "boom",
      consecutiveFailures: 1,
    });
    mockedFetch.mockResolvedValueOnce([]);

    await collectTrendsForAllUsers("");

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});

describe("Google block handling", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    vi.mocked(collectShoppingRising).mockClear();
  });

  test("a block on the first keyword stops the run after one Google call and records a stable code", async () => {
    const user = await createTestUser();
    const rows = await db
      .insert(keywords)
      .values([
        { userId: user.id, term: "a" },
        { userId: user.id, term: "b" },
        { userId: user.id, term: "c" },
      ])
      .returning();
    await db.insert(userRegions).values({ userId: user.id, geo: "US" });
    mockedFetch.mockRejectedValue(new GoogleBlockedError());

    const summary = await collectTrendsForAllRegions();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ outcome: "blocked", succeeded: 0, failed: 1 });
    expect(collectShoppingRising).not.toHaveBeenCalled();
    const statuses = await db.select().from(keywordCollectionStatus);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.lastErrorMessage).toBe("GOOGLE_BLOCKED");
    expect(rows.map((r) => r.id)).toContain(statuses[0]!.keywordId);
  });

  test("a clean run reports ok with summed counts and runs the shopping step", async () => {
    await addKeyword();
    mockedFetch.mockResolvedValue([]);

    const summary = await collectTrendsForAllRegions();

    expect(summary).toEqual({ outcome: "ok", succeeded: 1, skipped: 0, failed: 0, regions: 1 });
    expect(collectShoppingRising).toHaveBeenCalledTimes(1);
  });

  test("three generic failures in a row report aborted and skip the shopping step", async () => {
    const user = await createTestUser();
    await db.insert(keywords).values(["a", "b", "c", "d"].map((term) => ({ userId: user.id, term })));
    mockedFetch.mockRejectedValue(new Error("network down"));

    const summary = await collectTrendsForAllRegions();

    expect(summary.outcome).toBe("aborted");
    expect(summary.failed).toBe(3);
    expect(collectShoppingRising).not.toHaveBeenCalled();
  });
});
