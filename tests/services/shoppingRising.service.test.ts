import { describe, expect, test, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import { discoverRising } from "../../src/db/schema.js";
import { GoogleBlockedError } from "../../src/services/googleTrends.service.js";
import {
  HUB_SEEDS,
  seedsForDay,
  collectShoppingRising,
} from "../../src/services/shoppingRising.service.js";

const NOW = new Date("2026-10-15T12:00:00Z");
const noSleep = async () => undefined;

function deps(fetchFn: any, now = NOW) {
  return { fetchRising: fetchFn, sleep: noSleep, now: () => now };
}

describe("seedsForDay", () => {
  test("is deterministic, 6 seeds, alternating halves by UTC day", () => {
    expect(HUB_SEEDS).toHaveLength(12);
    const day0 = seedsForDay(new Date("1970-01-01T05:00:00Z"));
    const day1 = seedsForDay(new Date("1970-01-02T05:00:00Z"));
    expect(day0).toEqual(HUB_SEEDS.slice(0, 6));
    expect(day1).toEqual(HUB_SEEDS.slice(6));
    expect(seedsForDay(new Date("1970-01-03T23:00:00Z"))).toEqual(day0);
    expect(seedsForDay(NOW)).toEqual(seedsForDay(new Date("2026-10-15T01:00:00Z")));
  });
});

describe("collectShoppingRising", () => {
  beforeEach(async () => {
    await db.delete(discoverRising);
  });

  test("skips when a row was already collected today (UTC)", async () => {
    await db.insert(discoverRising).values({ seed: "x", query: "q", growthValue: "100", collectedAt: NOW });
    const fetchFn = vi.fn();
    const res = await collectShoppingRising(deps(fetchFn));
    expect(res.skipped).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("replaces rows per seed and keeps other seeds' rows", async () => {
    const [today] = seedsForDay(NOW);
    const old = new Date("2026-10-10T12:00:00Z");
    await db.insert(discoverRising).values([
      { seed: today!, query: "stale", growthValue: "1", collectedAt: old },
      { seed: "unrelated seed", query: "keep me", growthValue: "2", collectedAt: old },
    ]);
    const fetchFn = vi.fn(async (seed: string) => [{ query: `${seed} new`, growthValue: "Breakout" }]);
    const res = await collectShoppingRising(deps(fetchFn));
    expect(res).toEqual({ collectedSeeds: 6, failedSeeds: 0, skipped: false });
    expect(fetchFn).toHaveBeenCalledWith(today, "US", "froogle");
    const mine = await db.select().from(discoverRising).where(eq(discoverRising.seed, today!));
    expect(mine.map((r) => r.query)).toEqual([`${today} new`]);
    const kept = await db.select().from(discoverRising).where(eq(discoverRising.seed, "unrelated seed"));
    expect(kept).toHaveLength(1);
  });

  test("stops after 3 consecutive failures", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("blocked");
    });
    const res = await collectShoppingRising(deps(fetchFn));
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(res).toEqual({ collectedSeeds: 0, failedSeeds: 3, skipped: false });
  });

  test("never throws when fetch rejects", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(collectShoppingRising(deps(fetchFn))).resolves.toBeDefined();
  });

  test("stops at the first Google block instead of trying the remaining seeds", async () => {
    const fetchFn = vi.fn(async () => {
      throw new GoogleBlockedError();
    });
    const res = await collectShoppingRising(deps(fetchFn));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(res.failedSeeds).toBe(1);
  });
});
