import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { etsySupply, keywords } from "../../src/db/schema.js";
import { env } from "../../src/config/env.js";
import { logger } from "../../src/utils/logger.js";
import * as etsyHttp from "../../src/services/etsyHttp.js";
import { etsySupplyService } from "../../src/services/etsySupply.service.js";

vi.mock("../../src/services/etsyHttp.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/services/etsyHttp.js")>()),
  fetchListingCountFromEtsy: vi.fn(),
}));

const fetchMock = vi.mocked(etsyHttp.fetchListingCountFromEtsy);
const HOUR = 60 * 60 * 1000;
const original = { key: env.ETSY_API_KEY, secret: env.ETSY_API_SECRET };

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ count: 123, remainingToday: 4000 });
  env.ETSY_API_KEY = "test-key";
  env.ETSY_API_SECRET = "test-secret";
  vi.spyOn(logger, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await etsySupplyService.onIdle();
  env.ETSY_API_KEY = original.key;
  env.ETSY_API_SECRET = original.secret;
  vi.restoreAllMocks();
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "password123" });
  return agent;
}

describe("GET /api/supply", () => {
  test("requires a session", async () => {
    const res = await request(app).get("/api/supply");
    expect(res.status).toBe(401);
  });

  test("answers 'disabled' and never calls Etsy when the credentials are not configured", async () => {
    env.ETSY_API_KEY = undefined;
    const user = await createTestUser({ email: "off@example.com" });
    await db.insert(keywords).values({ userId: user.id, term: "boho clipart" });

    const res = await (await loginAgent("off@example.com")).get("/api/supply");
    await etsySupplyService.onIdle();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("answers 'disabled' and never calls Etsy for a user who has not accepted the current terms", async () => {
    const user = await createTestUser({ email: "noterms@example.com", termsVersion: null });
    await db.insert(keywords).values({ userId: user.id, term: "boho clipart" });
    const stale = await createTestUser({ email: "oldterms@example.com", termsVersion: "2020-01-01" });
    await db.insert(keywords).values({ userId: stale.id, term: "other term" });

    const res = await (await loginAgent("noterms@example.com")).get("/api/supply");
    const res2 = await (await loginAgent("oldterms@example.com")).get("/api/supply");
    await etsySupplyService.onIdle();

    expect(res.body).toEqual({ enabled: false, items: [] });
    expect(res2.body).toEqual({ enabled: false, items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("starts as 'refreshing' with no count, then serves the fetched count", async () => {
    const user = await createTestUser({ email: "flow@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "boho clipart" }).returning();
    const agent = await loginAgent("flow@example.com");

    const first = await agent.get("/api/supply");
    await etsySupplyService.onIdle();
    const second = await agent.get("/api/supply");

    expect(first.body.enabled).toBe(true);
    expect(first.body.items).toEqual([{ keywordId: kw!.id, count: null, fetchedAt: null, status: "refreshing", local: null }]);
    expect(second.body.items[0]).toMatchObject({ keywordId: kw!.id, count: 123, status: "fresh" });
    expect(typeof second.body.items[0].fetchedAt).toBe("string");
  });

  test("returns a count of zero as 0, not null", async () => {
    fetchMock.mockResolvedValue({ count: 0, remainingToday: 4000 });
    const user = await createTestUser({ email: "zero@example.com" });
    await db.insert(keywords).values({ userId: user.id, term: "zzqxjkwv" });
    const agent = await loginAgent("zero@example.com");

    await agent.get("/api/supply");
    await etsySupplyService.onIdle();
    const res = await agent.get("/api/supply");

    expect(res.body.items[0].count).toBe(0);
    expect(res.body.items[0].status).toBe("fresh");
  });

  test("only returns the caller's own active keywords, never archived ones or another user's", async () => {
    const a = await createTestUser({ email: "a@example.com" });
    const b = await createTestUser({ email: "b@example.com" });
    const [activeA] = await db.insert(keywords).values({ userId: a.id, term: "alpha" }).returning();
    await db.insert(keywords).values({ userId: a.id, term: "archived one", removedAt: new Date() });
    const [onlyB] = await db.insert(keywords).values({ userId: b.id, term: "beta" }).returning();

    const resA = await (await loginAgent("a@example.com")).get("/api/supply");
    const resB = await (await loginAgent("b@example.com")).get("/api/supply");

    expect(resA.body.items.map((i: { keywordId: number }) => i.keywordId)).toEqual([activeA!.id]);
    expect(resB.body.items.map((i: { keywordId: number }) => i.keywordId)).toEqual([onlyB!.id]);
  });

  test("two users tracking the same term cost a single Etsy request", async () => {
    const a = await createTestUser({ email: "share-a@example.com" });
    const b = await createTestUser({ email: "share-b@example.com" });
    await db.insert(keywords).values({ userId: a.id, term: "boho clipart" });
    await db.insert(keywords).values({ userId: b.id, term: "Boho Clipart" });

    await (await loginAgent("share-a@example.com")).get("/api/supply");
    await (await loginAgent("share-b@example.com")).get("/api/supply");
    await etsySupplyService.onIdle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("keywords that differ only by case or spacing share one cached count", async () => {
    const user = await createTestUser({ email: "case@example.com" });
    const [one] = await db.insert(keywords).values({ userId: user.id, term: "Boho Clipart" }).returning();
    const [two] = await db.insert(keywords).values({ userId: user.id, term: "boho  clipart" }).returning();
    await db.insert(etsySupply).values({ term: "boho clipart", listingCount: 77, fetchedAt: new Date() });

    const res = await (await loginAgent("case@example.com")).get("/api/supply");

    const byId = Object.fromEntries(res.body.items.map((i: { keywordId: number; count: number }) => [i.keywordId, i.count]));
    expect(byId[one!.id]).toBe(77);
    expect(byId[two!.id]).toBe(77);
  });

  test("never returns a count older than 24 hours, and does return one a little younger", async () => {
    const user = await createTestUser({ email: "age@example.com" });
    const [old] = await db.insert(keywords).values({ userId: user.id, term: "old term" }).returning();
    const [young] = await db.insert(keywords).values({ userId: user.id, term: "young term" }).returning();
    await db.insert(etsySupply).values({ term: "old term", listingCount: 5, fetchedAt: new Date(Date.now() - 25 * HOUR) });
    await db.insert(etsySupply).values({ term: "young term", listingCount: 6, fetchedAt: new Date(Date.now() - 23 * HOUR) });

    const res = await (await loginAgent("age@example.com")).get("/api/supply");

    const byId = Object.fromEntries(res.body.items.map((i: { keywordId: number; count: number | null }) => [i.keywordId, i.count]));
    expect(byId[old!.id]).toBeNull();
    expect(byId[young!.id]).toBe(6);
  });

  test("an Etsy failure leaves the dashboard working: supply is 'refreshing', keywords still load", async () => {
    fetchMock.mockRejectedValue(new etsyHttp.EtsyHttpError(500, "Etsy is down"));
    const user = await createTestUser({ email: "down@example.com" });
    await db.insert(keywords).values({ userId: user.id, term: "boho clipart" });
    const agent = await loginAgent("down@example.com");

    const supply = await agent.get("/api/supply");
    await etsySupplyService.onIdle();
    const keywordList = await agent.get("/api/keywords");

    expect(supply.status).toBe(200);
    expect(supply.body.items[0]).toMatchObject({ count: null, status: "refreshing" });
    expect(keywordList.status).toBe(200);
    expect(keywordList.body).toHaveLength(1);
  });
});

describe("GET /api/supply with categories and seller country", () => {
  test("uses the keyword's category for the main count", async () => {
    const user = await createTestUser({ email: "cat@example.com" });
    await db.insert(keywords).values({ userId: user.id, term: "boho clipart", etsyTaxonomyId: 562 });
    const agent = await loginAgent("cat@example.com");
    await agent.get("/api/supply");
    await etsySupplyService.onIdle();
    expect(fetchMock).toHaveBeenCalledWith("boho clipart", fetch, { taxonomyId: 562 });
  });

  test("adds a local count only for a verified country, and none for worldwide or unknown codes", async () => {
    const user = await createTestUser({ email: "local@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "boho clipart" }).returning();
    await db.insert(etsySupply).values([
      { term: "boho clipart", listingCount: 73355, fetchedAt: new Date() },
      { term: "boho clipart", shopLocation: "Mexico", listingCount: 0, fetchedAt: new Date() },
    ]);
    const agent = await loginAgent("local@example.com");

    const mx = await agent.get("/api/supply?region=MX");
    expect(mx.body.items[0]).toMatchObject({ keywordId: kw!.id, count: 73355, local: { region: "MX", count: 0, status: "fresh" } });

    const ww = await agent.get("/api/supply?region=");
    expect(ww.body.items[0].local).toBeNull();
    const xx = await agent.get("/api/supply?region=XX");
    expect(xx.body.items[0].local).toBeNull();
    await etsySupplyService.onIdle();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), fetch, expect.objectContaining({ shopLocation: "XX" }));
  });
});

describe("GET /api/supply error handling", () => {
  test("a failing cache read yields a clean 500 instead of a hung request", async () => {
    const user = await createTestUser({ email: "boom@example.com" });
    await db.insert(keywords).values({ userId: user.id, term: "boho clipart" });
    const agent = await loginAgent("boom@example.com");
    vi.spyOn(etsySupplyService, "readSupply").mockRejectedValue(new Error("db exploded"));

    const res = await agent.get("/api/supply");

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("db exploded");
  });
});
