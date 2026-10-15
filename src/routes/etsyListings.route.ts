import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { keywords } from "../db/schema.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { etsySupplyService } from "../services/etsySupply.service.js";
import { hasAcceptedCurrentTerms } from "../utils/termsAcceptance.js";

export const etsyListingsRouter = Router();

/**
 * GET /api/keywords/:id/etsy-listings — up to five current Etsy listings for one of the caller's active keywords,
 * exactly as Etsy returned them, never older than 6 h (Etsy's terms for listing content). Off unless
 * ETSY_LISTING_SAMPLES_ENABLED is set, Etsy credentials exist and the user accepted the current terms; in every
 * "off" case no Etsy request is made. Answers from the cache and refreshes in the background.
 */
etsyListingsRouter.get("/:id/etsy-listings", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const [keyword] = await db
      .select({ term: keywords.term, taxonomyId: keywords.etsyTaxonomyId })
      .from(keywords)
      .where(and(eq(keywords.id, id), eq(keywords.userId, req.userId!), isNull(keywords.removedAt)));
    if (!keyword) {
      res.status(404).json({ error: "Keyword no encontrada" });
      return;
    }

    if (!env.ETSY_LISTING_SAMPLES_ENABLED || !etsySupplyService.isEnabled() || !(await hasAcceptedCurrentTerms(req.userId!))) {
      res.json({ enabled: false, listings: [] });
      return;
    }

    const reading = await etsySupplyService.readListingSamples(keyword.term, keyword.taxonomyId);
    res.json({
      enabled: true,
      status: reading.status,
      fetchedAt: reading.fetchedAt?.toISOString() ?? null,
      listings: reading.listings,
    });
  } catch (err) {
    next(err);
  }
});
