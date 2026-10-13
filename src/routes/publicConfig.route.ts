import { Router } from "express";
import { env } from "../config/env.js";
import { CURRENT_TERMS_VERSION } from "../config/terms.js";

export const publicConfigRouter = Router();

/**
 * GET /api/public-config — instance details the client needs before anyone is logged in (the footer and the legal
 * pages). Deliberately limited to three non-secret fields.
 */
publicConfigRouter.get("/", (_req, res) => {
  res.json({
    supportEmail: env.SUPPORT_EMAIL ?? env.SENDGRID_FROM_EMAIL ?? null,
    operatorName: env.OPERATOR_NAME ?? null,
    termsVersion: CURRENT_TERMS_VERSION,
  });
});
