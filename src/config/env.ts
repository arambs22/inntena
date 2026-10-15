import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),

  // JWT_SECRET must be at least 32 characters; a short or guessable
  // value allows session forgery for any user.
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7), // 7 days

  // Shared secret for the internal collection-trigger endpoint. Not tied
  // to any user — it authenticates the scheduled GitHub Actions workflow.
  CRON_SECRET: z.string().min(32, "CRON_SECRET debe tener al menos 32 caracteres"),

  // Etsy integration is optional: if either is missing, Etsy-backed
  // features are disabled rather than the app failing to start.
  ETSY_API_KEY: z.string().optional(),
  ETSY_API_SECRET: z.string().optional(),
  // Listing examples ("On Etsy now") need Etsy's approval of the updated app purpose; off until the owner enables it.
  ETSY_LISTING_SAMPLES_ENABLED: z
    .string()
    .default("false")
    .transform((value) => ["true", "1"].includes(value.trim().toLowerCase())),

  // Email (SendGrid) is optional: without credentials, verification/reset
  // links are logged instead of sent — dev, self-hosted instances, and tests
  // all work with zero external dependency. Sent over SendGrid's HTTPS API,
  // not raw SMTP — Render's free tier blocks outbound traffic to SMTP ports
  // (25/465/587), so a direct SMTP relay (e.g. Gmail) can never work there.
  // SENDGRID_FROM_EMAIL must be a Single Sender verified in the SendGrid
  // dashboard; it doesn't need to be on a domain you own.
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  APP_URL: z.string().url().default("http://localhost:5173"),
  // Public contact details shown in the footer and on the legal pages. Optional: SUPPORT_EMAIL falls back to
  // SENDGRID_FROM_EMAIL, and without either the address is simply omitted. Kept in the environment so no personal
  // address ever has to be committed to the repository.
  SUPPORT_EMAIL: z.string().email().optional(),
  OPERATOR_NAME: z.string().min(1).optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isEtsyEnabled = Boolean(env.ETSY_API_KEY && env.ETSY_API_SECRET);