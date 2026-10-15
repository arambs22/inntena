import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { env } from "../../src/config/env.js";
import { logger } from "../../src/utils/logger.js";
import * as etsyHttp from "../../src/services/etsyHttp.js";
import { etsySupplyService } from "../../src/services/etsySupply.service.js";

vi.mock("../../src/services/etsyHttp.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/services/etsyHttp.js")>()),
  fetchListingCountFromEtsy: vi.fn(),
}));

const fetchMock = vi.mocked(etsyHttp.fetchListingCountFromEtsy);
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

describe("GET /api/discover", () => {
  test("requires a session", async () => {
    const res = await request(app).get("/api/discover");
    expect(res.status).toBe(401);
  });

  test("returns suggestions with supply null and never calls Etsy when it is not configured", async () => {
    env.ETSY_API_KEY = undefined;
    await createTestUser({ email: "off@example.com" });
    const agent = await loginAgent("off@example.com");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    let res;
    try {
      res = await agent.get("/api/discover?region=US");
    } finally {
      vi.useRealTimers();
    }
    await etsySupplyService.onIdle();

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["checking", "suggestions"]);
    expect(res.body.checking).toBe(false);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions.every((s: { supply: unknown }) => s.supply === null)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("never calls Etsy for a user who has not accepted the current terms", async () => {
    await createTestUser({ email: "noterms@example.com", termsVersion: null });
    const res = await (await loginAgent("noterms@example.com")).get("/api/discover");
    await etsySupplyService.onIdle();

    expect(res.status).toBe(200);
    expect(res.body.suggestions.every((s: { supply: unknown }) => s.supply === null)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
