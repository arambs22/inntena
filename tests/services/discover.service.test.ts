import { describe, expect, test, vi } from "vitest";
import { db } from "../../src/db/client.js";
import { keywords, relatedQueries } from "../../src/db/schema.js";
import { createTestUser } from "../helpers/factories.js";
import {
  buildCandidates,
  createDailyQuota,
  createDiscoverService,
  rankSuggestions,
} from "../../src/services/discover.service.js";

describe("buildCandidates", () => {
  const seasons = [{ event: "halloween" as const, daysUntil: 17, seeds: ["halloween clipart", "spooky png"] }];

  test("keeps breakouts and growth ≥ 500, drops tracked terms (normalized) and duplicates, best origin wins", () => {
    const related = [
      { query: "Boho Rainbow PNG", growthValue: "836500", from: "boho rainbow clipart" },
      { query: "boho rainbow png", growthValue: "600", from: "other" },
      { query: "small growth", growthValue: "250", from: "x" },
      { query: "halloween clipart", growthValue: "700", from: "x" },
      { query: "Already Mine", growthValue: "Breakout", from: "x" },
    ];
    const tracked = new Set(["already mine"]);
    const out = buildCandidates(related, seasons, tracked);
    expect(out).toEqual([
      { term: "boho rainbow png", origin: { type: "related", from: "boho rainbow clipart", breakout: true }, rank: 0 },
      { term: "halloween clipart", origin: { type: "season", event: "halloween", daysUntil: 17 }, rank: 1 },
      { term: "spooky png", origin: { type: "season", event: "halloween", daysUntil: 17 }, rank: 1 },
    ]);
  });
});

describe("rankSuggestions", () => {
  test("drops high supply, orders by origin rank then low < medium < unknown, then alphabetically, max 5", () => {
    const c = (term: string, rank: number) => ({ term, origin: { type: "related" as const, from: "x", breakout: rank === 0 }, rank });
    const supply = new Map<string, { count: number | null; status: "fresh" | "refreshing" | "unavailable"; fetchedAt?: Date | null }>([
      ["a", { count: 200_000, status: "fresh" }],
      ["b", { count: 50_000, status: "fresh" }],
      ["c", { count: 0, status: "fresh", fetchedAt: new Date("2026-10-14T10:00:00Z") }],
      ["d", { count: null, status: "refreshing" }],
    ]);
    const out = rankSuggestions([c("d", 0), c("b", 0), c("c", 0), c("a", 0), c("e", 2), c("f", 1), c("g", 1), c("h", 2)], supply, true);
    expect(out.map((s) => s.term)).toEqual(["c", "b", "d", "f", "g"]);
    expect(out[0]!.supply).toEqual({ count: 0, status: "fresh", fetchedAt: "2026-10-14T10:00:00.000Z" });
    expect(out[1]!.supply).toEqual({ count: 50_000, status: "fresh", fetchedAt: null });
  });

  test("without Etsy every suggestion has supply null and nothing is dropped for supply", () => {
    const out = rankSuggestions([{ term: "z", origin: { type: "related", from: "x", breakout: true }, rank: 0 }], new Map(), false);
    expect(out).toEqual([{ term: "z", origin: { type: "related", from: "x", breakout: true }, supply: null }]);
  });
});

describe("createDailyQuota", () => {
  test("allows 10 new terms per user per UTC day; terms already seen today are free", () => {
    let now = Date.parse("2026-10-14T10:00:00Z");
    const quota = createDailyQuota(() => now);
    const terms = Array.from({ length: 12 }, (_, i) => `t${i}`);
    expect(quota.take(1, terms).size).toBe(10);
    expect(quota.take(1, ["t0", "t11"])).toEqual(new Set(["t0"]));
    expect(quota.take(2, ["t11"]).size).toBe(1); // per user
    now = Date.parse("2026-10-15T00:00:01Z");
    expect(quota.take(1, ["t11"]).size).toBe(1); // new day
  });
});

describe("createDiscoverService", () => {
  test("uses the latest collection of related queries for the region, excludes archived and active terms", async () => {
    const user = await createTestUser({ email: "d@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "boho clipart" }).returning();
    await db.insert(keywords).values({ userId: user.id, term: "Old Idea", removedAt: new Date() });
    await db.insert(relatedQueries).values([
      { keywordId: kw!.id, geo: "US", query: "boho png", growthValue: "836500", collectedAt: new Date("2026-10-13T06:00:00Z") },
      { keywordId: kw!.id, geo: "US", query: "old idea", growthValue: "900", collectedAt: new Date("2026-10-13T06:00:00Z") },
      { keywordId: kw!.id, geo: "US", query: "stale query", growthValue: "Breakout", collectedAt: new Date("2026-10-01T06:00:00Z") },
      { keywordId: kw!.id, geo: "MX", query: "otra región", growthValue: "Breakout", collectedAt: new Date("2026-10-13T06:00:00Z") },
    ]);
    const readSupply = vi.fn(async (terms: string[]) => new Map(terms.map((t) => [t, { count: 100, fetchedAt: new Date(), status: "fresh" as const }])));
    const service = createDiscoverService({ supply: { isEnabled: () => true, readSupply }, now: () => Date.parse("2026-06-20T12:00:00Z") });

    const out = await service.suggestionsFor(user.id, "US", true);
    const terms = out.map((s) => s.term);
    expect(terms[0]).toBe("boho png");
    expect(terms).not.toContain("old idea");
    expect(terms).not.toContain("stale query");
    expect(terms).not.toContain("otra región");
    expect(terms).not.toContain("boho clipart");
    expect(readSupply).toHaveBeenCalled();
  });

  test("never calls Etsy when etsyAllowed is false", async () => {
    const user = await createTestUser({ email: "d2@example.com" });
    const readSupply = vi.fn();
    const service = createDiscoverService({ supply: { isEnabled: () => true, readSupply }, now: () => Date.parse("2026-10-14T12:00:00Z") });
    const out = await service.suggestionsFor(user.id, "", false);
    expect(readSupply).not.toHaveBeenCalled();
    expect(out.length).toBeGreaterThan(0); // seasons still produce suggestions
    expect(out.every((s) => s.supply === null)).toBe(true);
  });
});
