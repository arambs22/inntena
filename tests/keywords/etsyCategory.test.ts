import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { keywords } from "../../src/db/schema.js";

async function loginAgent(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "password123" });
  return agent;
}

describe("PATCH /api/keywords/:id/etsy-category", () => {
  test("sets and clears an allowed category", async () => {
    const user = await createTestUser({ email: "c1@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "a" }).returning();
    const agent = await loginAgent("c1@example.com");
    const set = await agent.patch(`/api/keywords/${kw!.id}/etsy-category`).send({ taxonomyId: 562 });
    expect(set.status).toBe(200);
    expect(set.body.etsyTaxonomyId).toBe(562);
    const cleared = await agent.patch(`/api/keywords/${kw!.id}/etsy-category`).send({ taxonomyId: null });
    expect(cleared.body.etsyTaxonomyId).toBeNull();
    const list = await agent.get("/api/keywords");
    expect(list.body[0].etsyTaxonomyId).toBeNull();
  });

  test("rejects categories outside the offered list and malformed bodies", async () => {
    const user = await createTestUser({ email: "c2@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: user.id, term: "a" }).returning();
    const agent = await loginAgent("c2@example.com");
    for (const body of [{ taxonomyId: 1 }, { taxonomyId: "562" }, { taxonomyId: 1.5 }, {}]) {
      expect((await agent.patch(`/api/keywords/${kw!.id}/etsy-category`).send(body)).status).toBe(400);
    }
  });

  test("404 for another user's keyword or an archived one", async () => {
    const owner = await createTestUser({ email: "c3@example.com" });
    const [kw] = await db.insert(keywords).values({ userId: owner.id, term: "a" }).returning();
    const [archived] = await db.insert(keywords).values({ userId: owner.id, term: "b", removedAt: new Date() }).returning();
    await createTestUser({ email: "c4@example.com" });
    const intruder = await loginAgent("c4@example.com");
    expect((await intruder.patch(`/api/keywords/${kw!.id}/etsy-category`).send({ taxonomyId: 66 })).status).toBe(404);
    const ownerAgent = await loginAgent("c3@example.com");
    expect((await ownerAgent.patch(`/api/keywords/${archived!.id}/etsy-category`).send({ taxonomyId: 66 })).status).toBe(404);
  });
});
