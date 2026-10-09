import { describe, expect, test } from "vitest";
import request from "supertest";
import { and, count, eq, isNull } from "drizzle-orm";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { keywords } from "../../src/db/schema.js";
import { MAX_ACTIVE_KEYWORDS_PER_USER } from "../../src/config/limits.js";

const MAX = MAX_ACTIVE_KEYWORDS_PER_USER;
const LIMIT_MESSAGE = `Llegaste al máximo de ${MAX} keywords activas. Archiva alguna para agregar otra.`;

async function loginAgent(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "password123" });
  return agent;
}

/** Inserts `count` active keywords named `<prefix> 1..count` for the user. */
async function seedActive(userId: number, count: number, prefix = "seed") {
  if (count === 0) return;
  await db
    .insert(keywords)
    .values(Array.from({ length: count }, (_, i) => ({ userId, term: `${prefix} ${i + 1}` })));
}

describe("active keyword cap", () => {
  test("allows the 15th keyword and rejects the 16th with 422", async () => {
    const user = await createTestUser({ email: "cap-create@example.com" });
    await seedActive(user.id, MAX - 1);
    const agent = await loginAgent("cap-create@example.com");

    const ok = await agent.post("/api/keywords").send({ term: "the last one" });
    expect(ok.status).toBe(201);

    const blocked = await agent.post("/api/keywords").send({ term: "one too many" });
    expect(blocked.status).toBe(422);
    expect(blocked.body).toEqual({ error: LIMIT_MESSAGE, code: "KEYWORD_LIMIT_REACHED", limit: MAX });
  });

  test("archived keywords do not count toward the cap", async () => {
    const user = await createTestUser({ email: "cap-archived@example.com" });
    await seedActive(user.id, MAX - 1);
    await db.insert(keywords).values([
      { userId: user.id, term: "old 1", removedAt: new Date() },
      { userId: user.id, term: "old 2", removedAt: new Date() },
    ]);
    const agent = await loginAgent("cap-archived@example.com");

    const res = await agent.post("/api/keywords").send({ term: "fits fine" });

    expect(res.status).toBe(201);
  });

  test("re-adding an archived term via POST at the cap returns 422", async () => {
    const user = await createTestUser({ email: "cap-readd@example.com" });
    await seedActive(user.id, MAX);
    await db.insert(keywords).values({ userId: user.id, term: "archived term", removedAt: new Date() });
    const agent = await loginAgent("cap-readd@example.com");

    const res = await agent.post("/api/keywords").send({ term: "archived term" });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("KEYWORD_LIMIT_REACHED");
    expect(res.body.limit).toBe(MAX);
  });

  test("re-adding an archived term via POST below the cap still restores it", async () => {
    const user = await createTestUser({ email: "cap-readd-ok@example.com" });
    await seedActive(user.id, MAX - 1);
    await db.insert(keywords).values({ userId: user.id, term: "archived term", removedAt: new Date() });
    const agent = await loginAgent("cap-readd-ok@example.com");

    const res = await agent.post("/api/keywords").send({ term: "archived term" });

    expect(res.status).toBe(200);
    expect(res.body.removedAt).toBeNull();
  });

  test("PATCH /:id/restore at the cap returns 422", async () => {
    const user = await createTestUser({ email: "cap-restore@example.com" });
    await seedActive(user.id, MAX);
    const [archived] = await db
      .insert(keywords)
      .values({ userId: user.id, term: "archived", removedAt: new Date() })
      .returning();
    const agent = await loginAgent("cap-restore@example.com");

    const res = await agent.patch(`/api/keywords/${archived!.id}/restore`);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: LIMIT_MESSAGE, code: "KEYWORD_LIMIT_REACHED", limit: MAX });
  });

  test("PATCH /:id/restore below the cap still works", async () => {
    const user = await createTestUser({ email: "cap-restore-ok@example.com" });
    await seedActive(user.id, MAX - 1);
    const [archived] = await db
      .insert(keywords)
      .values({ userId: user.id, term: "archived", removedAt: new Date() })
      .returning();
    const agent = await loginAgent("cap-restore-ok@example.com");

    const res = await agent.patch(`/api/keywords/${archived!.id}/restore`);

    expect(res.status).toBe(200);
    expect(res.body.removedAt).toBeNull();
  });

  test("re-adding an already active term at the cap still returns 409, not 422", async () => {
    const user = await createTestUser({ email: "cap-409@example.com" });
    await seedActive(user.id, MAX, "dup");
    const agent = await loginAgent("cap-409@example.com");

    const res = await agent.post("/api/keywords").send({ term: "dup 1" });

    expect(res.status).toBe(409);
  });

  test("concurrent creations cannot slip past the cap", async () => {
    const user = await createTestUser({ email: "cap-race@example.com" });
    await seedActive(user.id, MAX - 1);
    const agent = await loginAgent("cap-race@example.com");

    // Many simultaneous requests, not a handful: with few, the transactions can happen to run one
    // after another and the test would pass even without the row lock.
    const terms = Array.from({ length: 25 }, (_, i) => `race ${i}`);
    const responses = await Promise.all(terms.map((term) => agent.post("/api/keywords").send({ term })));

    const created = responses.filter((r) => r.status === 201).length;
    const rejected = responses.filter((r) => r.status === 422).length;
    expect(created).toBe(1);
    expect(rejected).toBe(terms.length - 1);

    // The database, not the HTTP statuses, is the source of truth for the cap.
    const [row] = await db
      .select({ active: count() })
      .from(keywords)
      .where(and(eq(keywords.userId, user.id), isNull(keywords.removedAt)));
    expect(row?.active).toBe(MAX);
  });
});

describe("GET /api/keywords/limit", () => {
  test("returns the max and the count of active keywords, ignoring archived ones", async () => {
    const user = await createTestUser({ email: "limit-get@example.com" });
    await seedActive(user.id, 3);
    await db.insert(keywords).values({ userId: user.id, term: "archived", removedAt: new Date() });
    const agent = await loginAgent("limit-get@example.com");

    const res = await agent.get("/api/keywords/limit");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ max: MAX, active: 3 });
  });

  test("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/keywords/limit");
    expect(res.status).toBe(401);
  });
});
