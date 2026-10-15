import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { CURRENT_TERMS_VERSION } from "../config/terms.js";

/** True when the user has accepted the current Terms of Use and Privacy Policy; no Etsy work is done for anyone else. */
export async function hasAcceptedCurrentTerms(userId: number): Promise<boolean> {
  const [account] = await db.select({ termsVersion: users.termsVersion }).from(users).where(eq(users.id, userId));
  return account?.termsVersion === CURRENT_TERMS_VERSION;
}
