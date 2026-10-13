import { describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { logger } from "../../src/utils/logger.js";
import * as emailService from "../../src/services/email.service.js";

describe("POST /api/auth/register", () => {
  test("creates the user unverified and sends a verification email", async () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => {});

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new-user@example.com", password: "password123", acceptTerms: true });

    expect(res.status).toBe(201);
    expect(res.body.emailVerified).toBe(false);
    const verificationCall = spy.mock.calls.find((call) => String(call[0]).includes("new-user@example.com"));
    expect(verificationCall).toBeDefined();
    spy.mockRestore();
  });

  test("succeeds even if verification email send fails", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const sendEmailSpy = vi.spyOn(emailService, "sendVerificationEmail").mockRejectedValueOnce(new Error("Email service down"));

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "resilient-user@example.com", password: "password123", acceptTerms: true });

    expect(res.status).toBe(201);
    expect(res.body.emailVerified).toBe(false);
    expect(res.body.id).toBeDefined();
    const errorCall = errorSpy.mock.calls.find((call) => String(call[0]).includes("Failed to send verification email"));
    expect(errorCall).toBeDefined();

    sendEmailSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
