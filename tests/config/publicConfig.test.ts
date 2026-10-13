import { afterEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { env } from "../../src/config/env.js";
import { CURRENT_TERMS_VERSION } from "../../src/config/terms.js";

const original = { support: env.SUPPORT_EMAIL, sender: env.SENDGRID_FROM_EMAIL, operator: env.OPERATOR_NAME };
afterEach(() => {
  env.SUPPORT_EMAIL = original.support;
  env.SENDGRID_FROM_EMAIL = original.sender;
  env.OPERATOR_NAME = original.operator;
});

describe("GET /api/public-config", () => {
  test("needs no session", async () => {
    const res = await request(app).get("/api/public-config");
    expect(res.status).toBe(200);
  });

  test("exposes exactly three fields, so no secret can leak by accident", async () => {
    const res = await request(app).get("/api/public-config");
    expect(Object.keys(res.body).sort()).toEqual(["operatorName", "supportEmail", "termsVersion"]);
    expect(res.body.termsVersion).toBe(CURRENT_TERMS_VERSION);
  });

  test("uses SUPPORT_EMAIL when set", async () => {
    env.SUPPORT_EMAIL = "help@example.com";
    env.SENDGRID_FROM_EMAIL = "sender@example.com";
    const res = await request(app).get("/api/public-config");
    expect(res.body.supportEmail).toBe("help@example.com");
  });

  test("falls back to the email sender address", async () => {
    env.SUPPORT_EMAIL = undefined;
    env.SENDGRID_FROM_EMAIL = "sender@example.com";
    const res = await request(app).get("/api/public-config");
    expect(res.body.supportEmail).toBe("sender@example.com");
  });

  test("is null when neither address is configured", async () => {
    env.SUPPORT_EMAIL = undefined;
    env.SENDGRID_FROM_EMAIL = undefined;
    const res = await request(app).get("/api/public-config");
    expect(res.body.supportEmail).toBeNull();
  });

  test("returns the operator name, or null when unset", async () => {
    env.OPERATOR_NAME = "Jane Doe";
    expect((await request(app).get("/api/public-config")).body.operatorName).toBe("Jane Doe");
    env.OPERATOR_NAME = undefined;
    expect((await request(app).get("/api/public-config")).body.operatorName).toBeNull();
  });
});
