import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import { etsySupply, users } from "../../src/db/schema.js";
import { CURRENT_TERMS_VERSION } from "../../src/config/terms.js";

describe("etsy_supply table", () => {
  test("stores one row per term and an upsert overwrites it without keeping history", async () => {
    await db.insert(etsySupply).values({ term: "boho clipart", listingCount: 100 });
    await db
      .insert(etsySupply)
      .values({ term: "boho clipart", listingCount: 250 })
      .onConflictDoUpdate({ target: [etsySupply.term, etsySupply.taxonomyId, etsySupply.shopLocation], set: { listingCount: 250 } });

    const rows = await db.select().from(etsySupply).where(eq(etsySupply.term, "boho clipart"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.listingCount).toBe(250);
  });

  test("accepts a count of zero", async () => {
    await db.insert(etsySupply).values({ term: "zzqxjkwv", listingCount: 0 });
    const [row] = await db.select().from(etsySupply).where(eq(etsySupply.term, "zzqxjkwv"));
    expect(row!.listingCount).toBe(0);
  });
});

describe("users terms acceptance columns", () => {
  test("default to null, meaning the user has not accepted any version", async () => {
    const [user] = await db.insert(users).values({ email: "terms-default@example.com", passwordHash: "x" }).returning();
    expect(user!.termsAcceptedAt).toBeNull();
    expect(user!.termsVersion).toBeNull();
  });
});

describe("CURRENT_TERMS_VERSION", () => {
  test("is a non-empty date-like string", () => {
    expect(CURRENT_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
