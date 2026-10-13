import { describe, expect, test } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { users } from "../../src/db/schema.js";
import { CURRENT_TERMS_VERSION } from "../../src/config/terms.js";

async function loginAgent(email: string, password = "password123") {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password });
  return agent;
}

describe("registration requires accepting the terms", () => {
  test.each([
    ["omitted", {}],
    ["false", { acceptTerms: false }],
    ["the string 'true'", { acceptTerms: "true" }],
  ])("rejects registration when acceptTerms is %s, and creates no account", async (_label, extra) => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "no-terms@example.com", password: "password123", ...extra });

    expect(res.status).toBe(400);
    expect(res.body.error.acceptTerms).toBeDefined();
    expect(await db.select().from(users).where(eq(users.email, "no-terms@example.com"))).toHaveLength(0);
  });

  test("stores when and which version was accepted, and reports termsAccepted", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "accepts@example.com", password: "password123", acceptTerms: true });

    expect(res.status).toBe(201);
    expect(res.body.termsAccepted).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.email, "accepts@example.com"));
    expect(row!.termsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(row!.termsAcceptedAt).toBeInstanceOf(Date);
  });
});

describe("termsAccepted on the public user", () => {
  test("is true for a user on the current version", async () => {
    await createTestUser({ email: "current@example.com" });
    const res = await (await loginAgent("current@example.com")).get("/api/auth/me");
    expect(res.body.termsAccepted).toBe(true);
  });

  test("is false for a user who never accepted", async () => {
    await createTestUser({ email: "never@example.com", termsVersion: null });
    const res = await (await loginAgent("never@example.com")).get("/api/auth/me");
    expect(res.body.termsAccepted).toBe(false);
  });

  test("is false when the stored version is outdated", async () => {
    await createTestUser({ email: "old@example.com", termsVersion: "2000-01-01" });
    const res = await (await loginAgent("old@example.com")).get("/api/auth/me");
    expect(res.body.termsAccepted).toBe(false);
  });

  test("also appears in the login response", async () => {
    await createTestUser({ email: "login-terms@example.com", termsVersion: null });
    const res = await request(app).post("/api/auth/login").send({ email: "login-terms@example.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.termsAccepted).toBe(false);
  });
});

describe("POST /api/auth/accept-terms", () => {
  test("requires a session", async () => {
    const res = await request(app).post("/api/auth/accept-terms").send({});
    expect(res.status).toBe(401);
  });

  test("records the current version and flips termsAccepted to true", async () => {
    const user = await createTestUser({ email: "flips@example.com", termsVersion: "2000-01-01" });
    const agent = await loginAgent("flips@example.com");

    const res = await agent.post("/api/auth/accept-terms").send({});

    expect(res.status).toBe(200);
    expect(res.body.termsAccepted).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row!.termsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(row!.termsAcceptedAt).toBeInstanceOf(Date);
  });

  test("never exposes the password hash or the raw version column", async () => {
    await createTestUser({ email: "nohash@example.com", termsVersion: null });
    const res = await (await loginAgent("nohash@example.com")).post("/api/auth/accept-terms").send({});
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(res.body.termsVersion).toBeUndefined();
  });
});
