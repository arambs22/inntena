import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { etsyListingSamples, keywords } from "../../src/db/schema.js";
import { env } from "../../src/config/env.js";
import { logger } from "../../src/utils/logger.js";
import * as etsyHttp from "../../src/services/etsyHttp.js";
import { etsySupplyService } from "../../src/services/etsySupply.service.js";

vi.mock("../../src/services/etsyHttp.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/services/etsyHttp.js")>()),
  fetchListingCountFromEtsy: vi.fn(),
  fetchListingSamplesFromEtsy: vi.fn(),
}));

const samplesMock = vi.mocked(etsyHttp.fetchListingSamplesFromEtsy);
const HOUR = 60 * 60 * 1000;
const original = {
  key: env.ETSY_API_KEY,
  secret: env.ETSY_API_SECRET,
  samples: env.ETSY_LISTING_SAMPLES_ENABLED,
};

beforeEach(() => {
  samplesMock.mockReset();
  samplesMock.mockResolvedValue({ listings: [], remainingToday: 4000 });
  env.ETSY_API_KEY = "test-key";
  env.ETSY_API_SECRET = "test-secret";
  env.ETSY_LISTING_SAMPLES_ENABLED = true;
  vi.spyOn(logger, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await etsySupplyService.onIdle();
  env.ETSY_API_KEY = original.key;
  env.ETSY_API_SECRET = original.secret;
  env.ETSY_LISTING_SAMPLES_ENABLED = original.samples;
  vi.restoreAllMocks();
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "password123" });
  return agent;
}

describe("GET /api/keywords/:id/etsy-listings", () => {
  test("requires a session", async () => {
    expect((await request(app).get("/api/keywords/1/etsy-listings")).status).toBe(401);
  });

  test("the flag off is a kill switch: disabled answer and no Etsy call", async () => {
    env.ETSY_LISTING_SAMPLES_ENABLED = false;
    const user = await createTestUser({ email: "f@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "boho clipart" }).returning();
    const res = await (await loginAgent("f@example.com")).get(`/api/keywords/${kw!.id}/etsy-listings`);
    await etsySupplyService.onIdle();
    expect(res.body).toEqual({ enabled: false, listings: [] });
    expect(samplesMock).not.toHaveBeenCalled();
  });

  test("no Etsy call for a user who has not accepted the current terms", async () => {
    const user = await createTestUser({ email: "t@example.com", termsVersion: null });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "x" }).returning();
    const res = await (await loginAgent("t@example.com")).get(`/api/keywords/${kw!.id}/etsy-listings`);
    await etsySupplyService.onIdle();
    expect(res.body).toEqual({ enabled: false, listings: [] });
    expect(samplesMock).not.toHaveBeenCalled();
  });

  test("404 for another user's keyword and for an archived keyword", async () => {
    const owner = await createTestUser({ email: "o@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: owner.id, term: "x" }).returning();
    const [archived] = await db.insert(keywords).values({ userId: owner.id, term: "y", removedAt: new Date() }).returning();
    await createTestUser({ email: "i@example.com" });
    expect((await (await loginAgent("i@example.com")).get(`/api/keywords/${kw!.id}/etsy-listings`)).status).toBe(404);
    expect((await (await loginAgent("o@example.com")).get(`/api/keywords/${archived!.id}/etsy-listings`)).status).toBe(404);
  });

  test("returns cached samples for the keyword's category, and never ones older than 6 h", async () => {
    const user = await createTestUser({ email: "s@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "Boho Clipart", etsyTaxonomyId: 562 }).returning();
    const listing = { listingId: 1, title: "L", price: 4, currency: "USD", url: "https://www.etsy.com/listing/1", thumbnailUrl: null, favorites: 0, views: 0 };
    await db.insert(etsyListingSamples).values({ key: "boho clipart|562", payload: [listing], fetchedAt: new Date(Date.now() - 1 * HOUR) });
    const agent = await loginAgent("s@example.com");
    const fresh = await agent.get(`/api/keywords/${kw!.id}/etsy-listings`);
    expect(fresh.body).toMatchObject({ enabled: true, status: "fresh", listings: [listing] });

    await db.update(etsyListingSamples).set({ fetchedAt: new Date(Date.now() - 7 * HOUR) });
    const stale = await agent.get(`/api/keywords/${kw!.id}/etsy-listings`);
    await etsySupplyService.onIdle();
    expect(stale.body.listings).toBeNull();
    expect(samplesMock.mock.calls.some(([term, tax]) => term === "boho clipart" && tax === 562)).toBe(true);
  });

  test("an Etsy failure leaves the card unavailable instead of failing the request", async () => {
    samplesMock.mockRejectedValue(new etsyHttp.EtsyHttpError(500, "down"));
    const user = await createTestUser({ email: "e@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "x" }).returning();
    const res = await (await loginAgent("e@example.com")).get(`/api/keywords/${kw!.id}/etsy-listings`);
    await etsySupplyService.onIdle();
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });
});
