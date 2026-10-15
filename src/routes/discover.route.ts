import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { discoverService } from "../services/discover.service.js";
import { hasAcceptedCurrentTerms } from "../utils/termsAcceptance.js";

export const discoverRouter = Router();

/**
 * GET /api/discover?region=XX — up to five keyword suggestions: rising searches related to the caller's keywords and
 * upcoming seasons, filtered by Etsy supply when Etsy is enabled and the user accepted the current terms. Without
 * Etsy the suggestions still come back, with `supply: null`. These are rising searches, not proven sales.
 */
discoverRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const region = typeof req.query.region === "string" ? req.query.region : "";
    const etsyAllowed = await hasAcceptedCurrentTerms(req.userId!);
    res.json({ suggestions: await discoverService.suggestionsFor(req.userId!, region, etsyAllowed) });
  } catch (err) {
    next(err);
  }
});
