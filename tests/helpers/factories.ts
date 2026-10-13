import { db } from "../../src/db/client.js";
import { users } from "../../src/db/schema.js";
import { hashPassword } from "../../src/utils/auth.js";
import { CURRENT_TERMS_VERSION } from "../../src/config/terms.js";

interface TestUserOverrides {
  email?: string;
  password?: string;
  emailVerified?: boolean;
  /** Version of the terms the user "accepted"; defaults to the current one. Pass null for a user who never accepted. */
  termsVersion?: string | null;
}

/** Inserts a user directly (bypassing the API) for tests that need one already logged in or already verified. Returns the plain-text password alongside the row, since only the hash is stored. */
export async function createTestUser(overrides: TestUserOverrides = {}) {
  const email = overrides.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = overrides.password ?? "password123";
  const passwordHash = await hashPassword(password);
  const termsVersion = overrides.termsVersion === undefined ? CURRENT_TERMS_VERSION : overrides.termsVersion;
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      emailVerified: overrides.emailVerified ?? false,
      termsVersion,
      termsAcceptedAt: termsVersion === null ? null : new Date(),
    })
    .returning();
  return { ...user!, password };
}
