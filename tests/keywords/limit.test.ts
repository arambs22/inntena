import { describe, expect, test } from "vitest";
import request from "supertest";
import { Client } from "pg";
import type { AddressInfo } from "node:net";
import { and, count, eq, isNull } from "drizzle-orm";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db, pool } from "../../src/db/client.js";
import { keywords } from "../../src/db/schema.js";
import { MAX_ACTIVE_KEYWORDS_PER_USER } from "../../src/config/limits.js";

const MAX = MAX_ACTIVE_KEYWORDS_PER_USER;
const LIMIT_MESSAGE = `Llegaste al máximo de ${MAX} keywords activas. Archiva alguna para agregar otra.`;

async function loginAgent(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "password123" });
  return agent;
}

/**
 * Waits until `expected` other sessions of the test database are blocked on a lock, so a test can be sure
 * every concurrent request has reached the point it wants to hold them at before releasing them.
 */
async function waitForLockWaiters(observer: Client, expected: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // Inside a transaction Postgres keeps serving the same statistics snapshot; drop it so each poll is fresh.
    await observer.query("SELECT pg_stat_clear_snapshot()");
    const { rows } = await observer.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
    );
    if (rows[0]!.waiting >= expected) return;
    if (Date.now() > deadline) throw new Error(`only ${rows[0]!.waiting} of ${expected} sessions reached the lock`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
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
    // The requests go through Node's own fetch against one listening server. Supertest is not used here: with a
    // bare app it starts (and closes) a separate ephemeral server per request, and dozens at once make Linux reuse
    // freed ports so a pooled socket hits a closed server (ECONNRESET); through one agent it sends them one by
    // one, which never exercises the race at all.
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "cap-race@example.com", password: "password123" }),
    });
    const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

    // A separate session holds a SHARE lock on `keywords`: every request can still read the count, but its
    // INSERT blocks. That parks all of them inside the check-then-insert window at the same time, so without
    // the user-row lock in withKeywordCapacity they would all see room and overshoot the cap — on any
    // machine, instead of only when the scheduler happens to interleave them.
    const blocker = new Client({ connectionString: process.env.DATABASE_URL });
    await blocker.connect();
    const terms = Array.from({ length: 25 }, (_, i) => `race ${i}`);
    let statuses: number[];
    try {
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE keywords IN SHARE MODE");
      const pending = Promise.all(
        terms.map((term) =>
          fetch(`${base}/api/keywords`, {
            method: "POST",
            headers: { "content-type": "application/json", cookie },
            body: JSON.stringify({ term }),
          }).then(async (res) => {
            await res.arrayBuffer();
            return res.status;
          }),
        ),
      );
      // Every pooled connection ends up waiting on a lock: on the blocked INSERT, or behind the user-row lock.
      await waitForLockWaiters(blocker, Math.min(pool.options.max ?? 10, terms.length));
      await blocker.query("COMMIT");
      statuses = await pending;
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      await blocker.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    const created = statuses.filter((status) => status === 201).length;
    const rejected = statuses.filter((status) => status === 422).length;
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
