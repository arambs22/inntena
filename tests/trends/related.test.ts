import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { keywords, relatedQueries } from "../../src/db/schema.js";

describe("GET /api/related", () => {
  test("only returns related queries from the most recent collection, not every past run", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "related-accum@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "related-accum@example.com", password: "password123" });
    const [keyword] = await db.insert(keywords).values({ userId: user.id, term: "clip art" }).returning();

    // Simulate two separate collection runs on different days for the same keyword+geo.
    await db.insert(relatedQueries).values({
      keywordId: keyword!.id,
      geo: "US",
      query: "old rising query",
      growthValue: "+250%",
      collectedAt: new Date("2026-08-20T10:00:00Z"),
    });
    await db.insert(relatedQueries).values({
      keywordId: keyword!.id,
      geo: "US",
      query: "new rising query",
      growthValue: "+500%",
      collectedAt: new Date("2026-08-27T10:00:00Z"),
    });

    const res = await agent.get("/api/related?geo=US");

    expect(res.status).toBe(200);
    const kwResult = res.body.find((r: { id: number }) => r.id === keyword!.id);
    const queries = kwResult.rising.map((r: { query: string }) => r.query);
    expect(queries).toContain("new rising query");
    expect(queries).not.toContain("old rising query");
  });
});

describe("related queries ordering", () => {
  // All rows share one collectedAt, exactly as a real collection run inserts them in a single batch.
  // Inserted out of order on purpose, so only an explicit sort can produce the expected result.
  const collectedAt = new Date("2026-08-27T10:00:00Z");
  const unsorted = [
    { query: "small", growthValue: "40" },
    { query: "breakout", growthValue: "836500" },
    { query: "medium", growthValue: "250" },
    { query: "large", growthValue: "59000" },
  ];
  const expectedOrder = ["breakout", "large", "medium", "small"];

  test("GET /api/related returns each keyword's rising queries from the largest growth to the smallest", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "related-order@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "related-order@example.com", password: "password123" });
    const [keyword] = await db.insert(keywords).values({ userId: user.id, term: "ordering" }).returning();
    await db
      .insert(relatedQueries)
      .values(unsorted.map((r) => ({ keywordId: keyword!.id, geo: "US", collectedAt, ...r })));

    const res = await agent.get("/api/related?geo=US");

    const kw = res.body.find((r: { id: number }) => r.id === keyword!.id);
    expect(kw.rising.map((r: { query: string }) => r.query)).toEqual(expectedOrder);
  });

  test("GET /api/keywords/:id/related sorts each region's column the same way", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "related-order-hist@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "related-order-hist@example.com", password: "password123" });
    const [keyword] = await db.insert(keywords).values({ userId: user.id, term: "ordering history" }).returning();
    await db
      .insert(relatedQueries)
      .values(unsorted.map((r) => ({ keywordId: keyword!.id, geo: "US", collectedAt, ...r })));

    const res = await agent.get(`/api/keywords/${keyword!.id}/related`);

    expect(res.status).toBe(200);
    const column = res.body.columns.find((c: { region: string }) => c.region === "US");
    expect(column.rising.map((r: { query: string }) => r.query)).toEqual(expectedOrder);
  });
});
