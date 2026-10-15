import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { discoverService } from "../services/discover.service.js";
import { hasAcceptedCurrentTerms } from "../utils/termsAcceptance.js";

export const discoverRouter = Router();

/**
 * GET /api/discover?region=XX — up to 30 brand-new keyword ideas that are not derived from the caller's keywords:
 * Google Shopping rising queries, upcoming seasons and a curated catalog of digital-product niches. When Etsy is
 * enabled and the user accepted the current terms, only niches with a healthy Etsy listing count are returned;
 * otherwise they come back unfiltered with `supply: null`. Responds `{ suggestions, checking }`, where `checking`
 * means Etsy counts are still being fetched. These are rising searches, not proven sales.
 */
discoverRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const region = typeof req.query.region === "string" ? req.query.region : "";
    const etsyAllowed = await hasAcceptedCurrentTerms(req.userId!);
    res.json(await discoverService.suggestionsFor(req.userId!, region, etsyAllowed));
  } catch (err) {
    next(err);
  }
});
