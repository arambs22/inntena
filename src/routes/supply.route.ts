import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { keywords, users } from "../db/schema.js";
import { CURRENT_TERMS_VERSION } from "../config/terms.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { etsySupplyService } from "../services/etsySupply.service.js";
import { normalizeTerm } from "../utils/normalizeTerm.js";

export const supplyRouter = Router();

/**
 * GET /api/supply — the Etsy listing count for each of the caller's active keywords.
 *
 * Answers immediately from the shared cache and starts a background refresh for anything missing or stale, so a
 * slow or failing Etsy never delays or breaks the page. Counts older than 24 h are never returned (Etsy's terms).
 * A count of 0 is a real value and is returned as 0. Users who have not accepted the current terms get the
 * "disabled" answer without any service work, so no Etsy request is made on their behalf.
 */
supplyRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    if (!etsySupplyService.isEnabled()) {
      res.json({ enabled: false, items: [] });
      return;
    }

    const [account] = await db.select({ termsVersion: users.termsVersion }).from(users).where(eq(users.id, req.userId!));
    if (!account || account.termsVersion !== CURRENT_TERMS_VERSION) {
      res.json({ enabled: false, items: [] });
      return;
    }

    const own = await db
      .select({ id: keywords.id, term: keywords.term })
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), isNull(keywords.removedAt)));

    const readings = await etsySupplyService.readSupply(own.map((keyword) => keyword.term));

    res.json({
      enabled: true,
      items: own.map((keyword) => {
        const reading = readings.get(normalizeTerm(keyword.term));
        return {
          keywordId: keyword.id,
          count: reading?.count ?? null,
          fetchedAt: reading?.fetchedAt?.toISOString() ?? null,
          status: reading?.status ?? "unavailable",
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});
