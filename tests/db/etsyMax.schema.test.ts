import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import { etsyListingSamples, etsySupply, keywords, users } from "../../src/db/schema.js";
import { ETSY_CATEGORY_IDS, isEtsyCategoryId } from "../../src/config/etsyCategories.js";
import { hasAcceptedCurrentTerms } from "../../src/utils/termsAcceptance.js";
import { createTestUser } from "../helpers/factories.js";

describe("etsy_supply composite key", () => {
  test("the same term with another category or seller country is a separate row", async () => {
    await db.insert(etsySupply).values([
      { term: "boho clipart", listingCount: 73355 },
      { term: "boho clipart", taxonomyId: 562, listingCount: 43707 },
      { term: "boho clipart", shopLocation: "Mexico", listingCount: 104 },
    ]);
    const rows = await db.select().from(etsySupply).where(eq(etsySupply.term, "boho clipart"));
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.taxonomyId === 0 && r.shopLocation === "")?.listingCount).toBe(73355);
  });

  test("an upsert on the full key overwrites only that row", async () => {
    await db.insert(etsySupply).values({ term: "x", taxonomyId: 66, listingCount: 1 });
    await db
      .insert(etsySupply)
      .values({ term: "x", taxonomyId: 66, listingCount: 2 })
      .onConflictDoUpdate({ target: [etsySupply.term, etsySupply.taxonomyId, etsySupply.shopLocation], set: { listingCount: 2 } });
    const rows = await db.select().from(etsySupply).where(eq(etsySupply.term, "x"));
    expect(rows).toEqual([expect.objectContaining({ taxonomyId: 66, shopLocation: "", listingCount: 2 })]);
  });
});

describe("etsy_listing_samples", () => {
  test("stores a JSON payload per key, including an empty list", async () => {
    await db.insert(etsyListingSamples).values({ key: "none|0", payload: [], fetchedAt: new Date() });
    const [row] = await db.select().from(etsyListingSamples).where(eq(etsyListingSamples.key, "none|0"));
    expect(row!.payload).toEqual([]);
  });
});

describe("keywords.etsy_taxonomy_id", () => {
  test("defaults to null (all categories)", async () => {
    const [user] = await db.insert(users).values({ email: "tax@example.com", passwordHash: "x" }).returning();
    const [kw] = await db.insert(keywords).values({ userId: user!.id, term: "a" }).returning();
    expect(kw!.etsyTaxonomyId).toBeNull();
  });
});

describe("etsy categories", () => {
  test("offers exactly the six agreed categories", () => {
    expect([...ETSY_CATEGORY_IDS].sort((a, b) => a - b)).toEqual([66, 374, 562, 891, 1250, 1633]);
    expect(isEtsyCategoryId(562)).toBe(true);
    expect(isEtsyCategoryId(1)).toBe(false);
    expect(isEtsyCategoryId(0)).toBe(false);
  });
});

describe("hasAcceptedCurrentTerms", () => {
  test("is true only for the current version", async () => {
    const accepted = await createTestUser({ email: "acc@example.com" });
    const never = await createTestUser({ email: "never@example.com", termsVersion: null });
    const old = await createTestUser({ email: "old@example.com", termsVersion: "2000-01-01" });
    expect(await hasAcceptedCurrentTerms(accepted.id)).toBe(true);
    expect(await hasAcceptedCurrentTerms(never.id)).toBe(false);
    expect(await hasAcceptedCurrentTerms(old.id)).toBe(false);
    expect(await hasAcceptedCurrentTerms(999999)).toBe(false);
  });
});
