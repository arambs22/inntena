import { describe, expect, test } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { keywords } from "../../src/db/schema.js";

async function loginAgent(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "password123" });
  return agent;
}

describe("PATCH /api/keywords/:id/pin", () => {
  test("pinned: true sets pinnedAt", async () => {
    const user = await createTestUser({ email: "pin-set@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "pin me" }).returning();
    const agent = await loginAgent("pin-set@example.com");

    const res = await agent.patch(`/api/keywords/${kw!.id}/pin`).send({ pinned: true });

    expect(res.status).toBe(200);
    expect(res.body.pinnedAt).not.toBeNull();
    const [row] = await db.select().from(keywords).where(eq(keywords.id, kw!.id));
    expect(row!.pinnedAt).toBeInstanceOf(Date);
  });

  test("pinned: false clears pinnedAt", async () => {
    const user = await createTestUser({ email: "pin-clear@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "unpin me", pinnedAt: new Date() }).returning();
    const agent = await loginAgent("pin-clear@example.com");

    const res = await agent.patch(`/api/keywords/${kw!.id}/pin`).send({ pinned: false });

    expect(res.status).toBe(200);
    expect(res.body.pinnedAt).toBeNull();
    const [row] = await db.select().from(keywords).where(eq(keywords.id, kw!.id));
    expect(row!.pinnedAt).toBeNull();
  });

  test("returns 404 when pinning another user's keyword", async () => {
    const owner = await createTestUser({ email: "pin-owner@example.com" });
    await createTestUser({ email: "pin-intruder@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: owner.id, term: "not yours" }).returning();
    const agent = await loginAgent("pin-intruder@example.com");

    const res = await agent.patch(`/api/keywords/${kw!.id}/pin`).send({ pinned: true });

    expect(res.status).toBe(404);
    const [row] = await db.select().from(keywords).where(eq(keywords.id, kw!.id));
    expect(row!.pinnedAt).toBeNull();
  });

  test("returns 404 when pinning an archived keyword", async () => {
    const user = await createTestUser({ email: "pin-archived@example.com" });
    const [kw] = await db
      .insert(keywords)
      .values({ userId: user.id, term: "archived", removedAt: new Date() })
      .returning();
    const agent = await loginAgent("pin-archived@example.com");

    const res = await agent.patch(`/api/keywords/${kw!.id}/pin`).send({ pinned: true });

    expect(res.status).toBe(404);
  });

  test("returns 400 for an invalid body", async () => {
    const user = await createTestUser({ email: "pin-invalid@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "invalid body" }).returning();
    const agent = await loginAgent("pin-invalid@example.com");

    const res = await agent.patch(`/api/keywords/${kw!.id}/pin`).send({ pinned: "yes" });

    expect(res.status).toBe(400);
  });

  test("returns 401 when unauthenticated", async () => {
    const res = await request(app).patch("/api/keywords/1/pin").send({ pinned: true });
    expect(res.status).toBe(401);
  });

  test("archiving a pinned keyword clears pinnedAt, so a restore does not come back pinned", async () => {
    const user = await createTestUser({ email: "pin-archive@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "pinned then archived", pinnedAt: new Date() }).returning();
    const agent = await loginAgent("pin-archive@example.com");

    const del = await agent.delete(`/api/keywords/${kw!.id}`);
    expect(del.status).toBe(204);
    const [archived] = await db.select().from(keywords).where(eq(keywords.id, kw!.id));
    expect(archived!.removedAt).not.toBeNull();
    expect(archived!.pinnedAt).toBeNull();

    const restore = await agent.patch(`/api/keywords/${kw!.id}/restore`);
    expect(restore.status).toBe(200);
    expect(restore.body.pinnedAt).toBeNull();
  });

  test("GET /api/keywords and ?includeRemoved=true both include pinnedAt", async () => {
    const user = await createTestUser({ email: "pin-list@example.com" });
    await db.insert(keywords).values([
      { userId: user.id, term: "pinned one", pinnedAt: new Date() },
      { userId: user.id, term: "plain one" },
      { userId: user.id, term: "archived one", removedAt: new Date() },
    ]);
    const agent = await loginAgent("pin-list@example.com");

    const active = await agent.get("/api/keywords");
    expect(active.status).toBe(200);
    const pinned = active.body.find((k: { term: string }) => k.term === "pinned one");
    const plain = active.body.find((k: { term: string }) => k.term === "plain one");
    expect(pinned.pinnedAt).toEqual(expect.any(String));
    expect(plain).toHaveProperty("pinnedAt", null);

    const all = await agent.get("/api/keywords?includeRemoved=true");
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(3);
    for (const k of all.body) expect(k).toHaveProperty("pinnedAt");
    expect(all.body.find((k: { term: string }) => k.term === "pinned one").pinnedAt).toEqual(expect.any(String));
  });
});
