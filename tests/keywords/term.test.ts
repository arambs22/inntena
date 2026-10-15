import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";

async function loginAgent(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "password123" });
  return agent;
}

describe("POST /api/keywords term validation", () => {
  test("rejects a term containing the | character", async () => {
    await createTestUser({ email: "pipe@example.com" });
    const agent = await loginAgent("pipe@example.com");
    const res = await agent.post("/api/keywords").send({ term: "foo|562|" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("La keyword no puede contener el carácter |");
  });

  test("still accepts a normal term", async () => {
    await createTestUser({ email: "plain@example.com" });
    const agent = await loginAgent("plain@example.com");
    const res = await agent.post("/api/keywords").send({ term: "boho clipart" });
    expect(res.status).toBe(201);
  });
});
