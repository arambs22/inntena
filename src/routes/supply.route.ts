import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { keywords } from "../db/schema.js";
import { etsyCountryFor } from "../config/etsyCountries.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { etsySupplyService, supplyKeyId, type SupplyKey } from "../services/etsySupply.service.js";
import { hasAcceptedCurrentTerms } from "../utils/termsAcceptance.js";

export const supplyRouter = Router();

/**
 * GET /api/supply — the Etsy listing count for each of the caller's active keywords, scoped to the keyword's
 * chosen Etsy category (all categories when none is set). With `?region=XX` for a region whose seller country is
 * verified, each item also carries a `local` count of listings from sellers in that country; otherwise `local` is null.
 *
 * Answers immediately from the shared cache and starts a background refresh for anything missing or stale, so a
 * slow or failing Etsy never delays or breaks the page. Counts older than 24 h are never returned (Etsy's terms).
 * A count of 0 is a real value and is returned as 0. Users who have not accepted the current terms get the
 * "disabled" answer without any service work, so no Etsy request is made on their behalf.
 */
supplyRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    if (!etsySupplyService.isEnabled() || !(await hasAcceptedCurrentTerms(req.userId!))) {
      res.json({ enabled: false, items: [] });
      return;
    }

    const region = typeof req.query.region === "string" ? req.query.region : "";
    const country = etsyCountryFor(region);

    const own = await db
      .select({ id: keywords.id, term: keywords.term, taxonomyId: keywords.etsyTaxonomyId })
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), isNull(keywords.removedAt)));

    const keys: SupplyKey[] = own.flatMap((keyword) => {
      const main: SupplyKey = { term: keyword.term, taxonomyId: keyword.taxonomyId };
      return country ? [main, { ...main, shopLocation: country }] : [main];
    });
    const readings = await etsySupplyService.readSupply(keys);

    res.json({
      enabled: true,
      items: own.map((keyword) => {
        const main = readings.get(supplyKeyId({ term: keyword.term, taxonomyId: keyword.taxonomyId }));
        const local = country
          ? readings.get(supplyKeyId({ term: keyword.term, taxonomyId: keyword.taxonomyId, shopLocation: country }))
          : undefined;
        return {
          keywordId: keyword.id,
          count: main?.count ?? null,
          fetchedAt: main?.fetchedAt?.toISOString() ?? null,
          status: main?.status ?? "unavailable",
          local: country
            ? { region, count: local?.count ?? null, fetchedAt: local?.fetchedAt?.toISOString() ?? null, status: local?.status ?? "unavailable" }
            : null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});
