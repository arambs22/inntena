import { describe, expect, test, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import { keywords, trendSnapshots } from "../../src/db/schema.js";
import { createTestUser } from "../helpers/factories.js";

vi.mock("../../src/services/googleTrends.service.js", () => ({
  fetchInterestOverTime: vi.fn(),
  fetchRelatedQueries: vi.fn(async () => []),
  sleep: vi.fn(async () => undefined),
}));
vi.mock("../../src/services/shoppingRising.service.js", () => ({
  collectShoppingRising: vi.fn(async () => ({ collectedSeeds: 0, failedSeeds: 0, skipped: true })),
}));

import { fetchInterestOverTime } from "../../src/services/googleTrends.service.js";
import { collectTrendsForAllUsers } from "../../src/services/trendCollector.service.js";

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
