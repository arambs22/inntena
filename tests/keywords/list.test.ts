import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { keywords, trendSnapshots, relatedQueries, keywordCollectionStatus } from "../../src/db/schema.js";

describe("GET /api/keywords", () => {
  test("batches per-keyword regions correctly across multiple keywords and tables", async () => {
    const user = await createTestUser({ email: "kw-list@example.com", password: "password123" });
    const [kwA] = await db.insert(keywords).values({ userId: user.id, term: "keyword a" }).returning();
    const [kwB] = await db.insert(keywords).values({ userId: user.id, term: "keyword b" }).returning();

    // kwA has data in US (snapshots) and MX (related queries only) — regions must union both tables.
    await db.insert(trendSnapshots).values({ keywordId: kwA!.id, geo: "US", date: "2026-08-01", value: 10 });
    await db.insert(relatedQueries).values({ keywordId: kwA!.id, geo: "MX", query: "q1", growthValue: "+10%" });
    // kwB has data only in JP.
    await db.insert(trendSnapshots).values({ keywordId: kwB!.id, geo: "JP", date: "2026-08-01", value: 20 });

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "kw-list@example.com", password: "password123" });

    const res = await agent.get("/api/keywords");

    expect(res.status).toBe(200);
    const a = res.body.find((k: { id: number }) => k.id === kwA!.id);
    const b = res.body.find((k: { id: number }) => k.id === kwB!.id);
    expect(new Set(a.regions)).toEqual(new Set(["US", "MX"]));
    expect(b.regions).toEqual(["JP"]);
  });

  test("attaches per-region collection status only for the requested geos, batched across keywords", async () => {
    const user = await createTestUser({ email: "kw-status@example.com", password: "password123" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "status keyword" }).returning();

    await db.insert(keywordCollectionStatus).values([
      { keywordId: kw!.id, geo: "US", lastAttemptAt: new Date(), consecutiveFailures: 0 },
      { keywordId: kw!.id, geo: "MX", lastAttemptAt: new Date(), consecutiveFailures: 5 },
    ]);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "kw-status@example.com", password: "password123" });

    const res = await agent.get("/api/keywords?geo=US,MX,JP");

    expect(res.status).toBe(200);
    const result = res.body.find((k: { id: number }) => k.id === kw!.id);
    expect(result.collectionStatus.US.consecutiveFailures).toBe(0);
    expect(result.collectionStatus.MX.consecutiveFailures).toBe(5);
    expect(result.collectionStatus.MX.blocked).toBe(true);
    expect(result.collectionStatus.JP).toBeUndefined();
  });

  test("returns an empty regions list and no crash for a user with keywords but no collected data", async () => {
    const user = await createTestUser({ email: "kw-empty@example.com", password: "password123" });
    await db.insert(keywords).values({ userId: user.id, term: "empty keyword" }).returning();

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "kw-empty@example.com", password: "password123" });

    const res = await agent.get("/api/keywords");

    expect(res.status).toBe(200);
    expect(res.body[0].regions).toEqual([]);
  });

  test("?includeRemoved=true batches regions the same way for archived keywords", async () => {
    const user = await createTestUser({ email: "kw-archived@example.com", password: "password123" });
    const [kw] = await db
      .insert(keywords)
      .values({ userId: user.id, term: "archived keyword", removedAt: new Date() })
      .returning();
    await db.insert(trendSnapshots).values({ keywordId: kw!.id, geo: "US", date: "2026-08-01", value: 5 });

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "kw-archived@example.com", password: "password123" });

    const res = await agent.get("/api/keywords?includeRemoved=true");

    expect(res.status).toBe(200);
    expect(res.body[0].regions).toEqual(["US"]);
  });

  test("exposes failure info without leaking the raw error message", async () => {
    const user = await createTestUser({ email: "kw-failure@example.com", password: "password123" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "failure keyword" }).returning();
    const attempt = new Date("2026-10-14T10:00:00Z");

    await db.insert(keywordCollectionStatus).values([
      { keywordId: kw!.id, geo: "US", lastAttemptAt: attempt, lastErrorMessage: "GOOGLE_BLOCKED", consecutiveFailures: 1 },
      { keywordId: kw!.id, geo: "MX", lastAttemptAt: attempt, lastErrorMessage: "secret db detail", consecutiveFailures: 2 },
      { keywordId: kw!.id, geo: "JP", lastAttemptAt: attempt, lastSuccessAt: attempt, consecutiveFailures: 0 },
    ]);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "kw-failure@example.com", password: "password123" });
    const res = await agent.get("/api/keywords?geo=US,MX,JP");

    const status = res.body.find((k: { id: number }) => k.id === kw!.id).collectionStatus;
    expect(status.US).toMatchObject({ lastFailedAt: attempt.toISOString(), failureReason: "googleBlocked" });
    expect(status.MX).toMatchObject({ lastFailedAt: attempt.toISOString(), failureReason: "other" });
    expect(status.JP).toMatchObject({ lastFailedAt: null, failureReason: null });
    expect(JSON.stringify(res.body)).not.toContain("secret db detail");
  });
});
