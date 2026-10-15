import { describe, expect, test, vi } from "vitest";
import { db } from "../../src/db/client.js";
import { discoverRising, keywords, relatedQueries } from "../../src/db/schema.js";
import { DISCOVER_CATALOG } from "../../src/config/discoverCatalog.js";
import { createTestUser } from "../helpers/factories.js";
import {
  buildCandidates,
  isBlockedShoppingTerm,
  createDailyQuota,
  createDiscoverService,
  DAILY_NEW_TERMS,
  DISCOVER_LIMIT,
  fnv1a,
  rankSuggestions,
  type Candidate,
} from "../../src/services/discover.service.js";
import type { SupplyReading } from "../../src/services/etsySupply.service.js";

const DAY = "2026-10-14";
const NOW = Date.parse("2026-10-14T12:00:00Z");
const seasons = [{ event: "halloween" as const, daysUntil: 17, seeds: ["halloween clipart", "spooky png"] }];

describe("isBlockedShoppingTerm", () => {
  test("blocks hardware, brands and freebie searches as whole words, keeps product niches", () => {
    for (const term of [
      "cricut joy replacement blade",
      "epson f570 sublimation printer",
      "pokemon 30th celebration tech sticker collection",
      "pokémon sticker",
      "free halloween clip art",
      "capcut template",
      "invitation homes",
      "sublimation ink",
    ]) {
      expect(isBlockedShoppingTerm(term)).toBe(true);
    }
    for (const term of ["halloween coloring pages printable", "pumpkin clip art", "family tree template", "fall wall art", "freedom svg"]) {
      expect(isBlockedShoppingTerm(term)).toBe(false);
    }
  });

  test("blocked shopping queries never become candidates", () => {
    const out = buildCandidates(
      [
        { seed: "sticker", query: "pokemon sticker collection", growthValue: "Breakout" },
        { seed: "clipart", query: "pumpkin clipart", growthValue: "Breakout" },
      ],
      [],
      new Set(),
      DAY,
    );
    const terms = out.filter((c) => c.origin.type === "shopping").map((c) => c.term);
    expect(terms).toEqual(["pumpkin clipart"]);
  });
});

describe("buildCandidates", () => {
  test("shopping needs growth >= 500, breakout first; tracked, empty and pipe terms dropped; best group wins", () => {
    const shopping = [
      { seed: "clipart", query: "Boho Rainbow PNG", growthValue: "4400" },
      { seed: "svg", query: "boho rainbow png", growthValue: "600" },
      { seed: "svg", query: "small growth", growthValue: "250" },
      { seed: "x", query: "halloween clipart", growthValue: "700" },
      { seed: "x", query: "Already Mine", growthValue: "Breakout" },
      { seed: "x", query: "bad | term", growthValue: "Breakout" },
      { seed: "x", query: "   ", growthValue: "Breakout" },
      { seed: "x", query: "huge one", growthValue: "Breakout" },
    ];
    const out = buildCandidates(shopping, seasons, new Set(["already mine"]), DAY);
    expect(out.slice(0, 3).map((c) => c.term)).toEqual(["huge one", "boho rainbow png", "halloween clipart"]);
    expect(out[0]!.origin).toEqual({ type: "shopping", seed: "x", growth: "Breakout" });
    expect(out[1]!.origin).toEqual({ type: "shopping", seed: "clipart", growth: "4400" });
    expect(out[2]!.group).toBe(0); // in shopping and season: shopping wins
    expect(out[3]!.term).toBe("spooky png");
    const terms = out.map((c) => c.term);
    expect(terms).not.toContain("already mine");
    expect(terms).not.toContain("small growth");
    expect(terms.some((t) => t.includes("|") || t === "")).toBe(false);
  });

  test("groups are ordered shopping, season (nearest first), catalog", () => {
    const out = buildCandidates(
      [{ seed: "s", query: "rising thing", growthValue: "900" }],
      [
        { event: "christmas", daysUntil: 40, seeds: ["christmas png"] },
        { event: "halloween", daysUntil: 17, seeds: ["spooky png"] },
      ],
      new Set(),
      DAY,
    );
    const groups = out.map((c) => c.group);
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    expect(out.slice(0, 3).map((c) => c.term)).toEqual(["rising thing", "spooky png", "christmas png"]);
    expect(out).toHaveLength(3 + DISCOVER_CATALOG.length);
    expect(out[3]!.origin.type).toBe("catalog");
  });

  test("catalog order is stable within a UTC day and differs across days", () => {
    const catalogOrder = (day: string) => buildCandidates([], [], new Set(), day).map((c) => c.term);
    expect(catalogOrder("2026-10-14")).toEqual(catalogOrder("2026-10-14"));
    expect(catalogOrder("2026-10-14")).not.toEqual(catalogOrder("2026-10-15"));
  });

  test("tracked catalog terms are excluded", () => {
    const first = DISCOVER_CATALOG[0]!.term;
    const out = buildCandidates([], [], new Set([first]), DAY);
    expect(out.map((c) => c.term)).not.toContain(first);
  });
});

describe("fnv1a", () => {
  test("is deterministic and spreads different inputs", () => {
    expect(fnv1a("a|2026-10-14")).toBe(fnv1a("a|2026-10-14"));
    expect(fnv1a("a|2026-10-14")).not.toBe(fnv1a("b|2026-10-14"));
  });
});

describe("rankSuggestions", () => {
  const c = (term: string, group: number): Candidate => ({
    term,
    group,
    origin:
      group === 0
        ? { type: "shopping", seed: "s", growth: "900" }
        : group === 1
          ? { type: "season", event: "halloween", daysUntil: 1 }
          : { type: "catalog", family: "clipart" },
  });
  type R = { count: number | null; status: "fresh" | "refreshing" | "unavailable"; fetchedAt?: Date | null };
  const fresh = (count: number): R => ({ count, status: "fresh" });

  test("keeps only fresh readings in [1000, 100000]; boundaries inclusive", () => {
    const supply = new Map<string, R>([
      ["zero", fresh(0)],
      ["tiny", fresh(999)],
      ["low", fresh(1000)],
      ["top", fresh(100_000)],
      ["over", fresh(100_001)],
      ["pending", { count: null, status: "refreshing" }],
      ["stale", { count: 5000, status: "unavailable" }],
    ]);
    const cands = ["zero", "tiny", "low", "top", "over", "pending", "stale", "unread"].map((t) => c(t, 2));
    expect(rankSuggestions(cands, supply, true).map((s) => s.term)).toEqual(["low", "top"]);
  });

  test("within a group low supply goes before medium; group order wins over supply", () => {
    const supply = new Map<string, R>([
      ["cat-med", fresh(50_000)],
      ["cat-low", fresh(2_000)],
      ["shop-med", fresh(60_000)],
    ]);
    const out = rankSuggestions([c("cat-med", 2), c("cat-low", 2), c("shop-med", 0)], supply, true);
    expect(out.map((s) => s.term)).toEqual(["shop-med", "cat-low", "cat-med"]);
  });

  test("includes supply details and is capped at DISCOVER_LIMIT", () => {
    const terms = Array.from({ length: 40 }, (_, i) => `t${i}`);
    const supply = new Map<string, R>(
      terms.map((t) => [t, { count: 5000, status: "fresh", fetchedAt: new Date("2026-10-14T10:00:00Z") }]),
    );
    const out = rankSuggestions(terms.map((t) => c(t, 2)), supply, true);
    expect(out).toHaveLength(DISCOVER_LIMIT);
    expect(out[0]!.supply).toEqual({ count: 5000, status: "fresh", fetchedAt: "2026-10-14T10:00:00.000Z" });
  });

  test("without Etsy nothing is filtered and supply is null", () => {
    const out = rankSuggestions([c("z", 0), c("y", 2)], new Map(), false);
    expect(out.map((s) => s.supply)).toEqual([null, null]);
    expect(out.map((s) => s.term)).toEqual(["z", "y"]);
  });
});

describe("createDailyQuota", () => {
  test("is global per UTC day: terms already taken are free, new ones are capped, resets next day", () => {
    let now = Date.parse("2026-10-14T10:00:00Z");
    const quota = createDailyQuota(() => now, 10);
    const terms = Array.from({ length: 12 }, (_, i) => `t${i}`);
    expect(quota.take(terms).size).toBe(10);
    expect(quota.take(["t0", "t11"])).toEqual(new Set(["t0"]));
    now = Date.parse("2026-10-15T00:00:01Z");
    expect(quota.take(["t11"]).size).toBe(1);
  });
});

describe("createDiscoverService", () => {
  const readingFor = (count: number | null, status: SupplyReading["status"] = "fresh"): SupplyReading =>
    ({ count, fetchedAt: count === null ? null : new Date(NOW), status }) as SupplyReading;
  const supplyOf = (read: (term: string) => SupplyReading) => ({
    isEnabled: () => true,
    readSupply: vi.fn(async (terms: string[]) => new Map(terms.map((t) => [t, read(t)]))),
  });

  test("ignores related queries of the user keywords and excludes tracked (active and archived) terms", async () => {
    const user = await createTestUser({ email: "d@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "boho clipart" }).returning();
    await db.insert(keywords).values({ userId: user.id, term: "Old Idea", removedAt: new Date() });
    await db.insert(keywords).values({ userId: user.id, term: DISCOVER_CATALOG[0]!.term });
    await db.insert(relatedQueries).values({
      keywordId: kw!.id,
      geo: "US",
      query: "did chris hansen cheat on his wife",
      growthValue: "Breakout",
      collectedAt: new Date(NOW),
    });
    await db.insert(discoverRising).values([
      { seed: "clipart", query: "old idea", growthValue: "Breakout", collectedAt: new Date(NOW) },
      { seed: "clipart", query: "fresh rising", growthValue: "Breakout", collectedAt: new Date(NOW) },
    ]);
    const service = createDiscoverService({ supply: supplyOf(() => readingFor(5000)), now: () => NOW });
    const { suggestions } = await service.suggestionsFor(user.id, "US", true);
    const terms = suggestions.map((s) => s.term);
    expect(terms[0]).toBe("fresh rising");
    expect(terms).not.toContain("did chris hansen cheat on his wife");
    expect(terms).not.toContain("old idea");
    expect(terms).not.toContain(DISCOVER_CATALOG[0]!.term.toLowerCase());
  });

  test("shopping rows older than 7 days or below 500 growth are ignored", async () => {
    const user = await createTestUser({ email: "old@example.com" });
    await db.insert(discoverRising).values([
      { seed: "s", query: "ancient rising", growthValue: "Breakout", collectedAt: new Date(NOW - 8 * 86_400_000) },
      { seed: "s", query: "recent rising", growthValue: "2000", collectedAt: new Date(NOW - 6 * 86_400_000) },
      { seed: "s", query: "slow rising", growthValue: "300", collectedAt: new Date(NOW) },
    ]);
    const service = createDiscoverService({ supply: { isEnabled: () => false, readSupply: vi.fn() }, now: () => NOW });
    const terms = (await service.suggestionsFor(user.id, "", true)).suggestions.map((s) => s.term);
    expect(terms).toContain("recent rising");
    expect(terms).not.toContain("ancient rising");
    expect(terms).not.toContain("slow rising");
  });

  test("without Etsy (not allowed or disabled) returns candidates unfiltered, supply null, never calls Etsy", async () => {
    const user = await createTestUser({ email: "d2@example.com" });
    const readSupply = vi.fn();
    const service = createDiscoverService({ supply: { isEnabled: () => true, readSupply }, now: () => NOW });
    const notAllowed = await service.suggestionsFor(user.id, "", false);
    expect(readSupply).not.toHaveBeenCalled();
    expect(notAllowed.checking).toBe(false);
    expect(notAllowed.suggestions).toHaveLength(DISCOVER_LIMIT);
    expect(notAllowed.suggestions.every((s) => s.supply === null)).toBe(true);
    expect(notAllowed.suggestions.some((s) => s.origin.type === "season")).toBe(true);

    const disabled = createDiscoverService({ supply: { isEnabled: () => false, readSupply }, now: () => NOW });
    expect((await disabled.suggestionsFor(user.id, "", true)).suggestions.every((s) => s.supply === null)).toBe(true);
    expect(readSupply).not.toHaveBeenCalled();
  });

  test("with Etsy: drops counts outside [1000, 100000], hides unknown/refreshing, reports checking", async () => {
    const user = await createTestUser({ email: "d3@example.com" });
    const terms = ["zero term", "tiny term", "low edge", "high edge", "huge term", "pending term"];
    await db
      .insert(discoverRising)
      .values(terms.map((query) => ({ seed: "s", query, growthValue: "Breakout", collectedAt: new Date(NOW) })));
    const table: Record<string, SupplyReading> = {
      "zero term": readingFor(0),
      "tiny term": readingFor(999),
      "low edge": readingFor(1000),
      "high edge": readingFor(100_000),
      "huge term": readingFor(100_001),
      "pending term": readingFor(null, "refreshing"),
    };
    const service = createDiscoverService({
      supply: supplyOf((t) => table[t] ?? readingFor(5_000_000)),
      now: () => NOW,
    });
    const out = await service.suggestionsFor(user.id, "", true);
    expect(out.suggestions.map((s) => s.term).sort()).toEqual(["high edge", "low edge"]);
    expect(out.checking).toBe(true);
  });

  test("the quota is global across users and resets the next UTC day", async () => {
    const a = await createTestUser({ email: "qa@example.com" });
    const b = await createTestUser({ email: "qb@example.com" });
    let now = NOW;
    const supply = supplyOf(() => readingFor(5000));
    const service = createDiscoverService({ supply, now: () => now });
    await service.suggestionsFor(a.id, "", true);
    const first = new Set(supply.readSupply.mock.calls[0]![0]);
    expect(first.size).toBe(DAILY_NEW_TERMS);
    supply.readSupply.mockClear();
    await service.suggestionsFor(b.id, "", true);
    const second = supply.readSupply.mock.calls[0]![0];
    expect(second).toHaveLength(DAILY_NEW_TERMS);
    expect(second.every((t: string) => first.has(t))).toBe(true); // nothing new for the second user
    now = NOW + 86_400_000;
    supply.readSupply.mockClear();
    await service.suggestionsFor(a.id, "", true);
    expect(supply.readSupply.mock.calls[0]![0]).toHaveLength(DAILY_NEW_TERMS);
  });
});
