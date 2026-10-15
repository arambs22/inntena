import { Router } from "express";
import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries } from "../db/schema.js";
import { and, eq, isNull, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.middleware.js";
import { sortByGrowthDesc } from "../utils/relatedGrowth.js";
import { latestRelatedQueriesFor } from "../utils/relatedQueries.js";

export const trendsRouter = Router();

/**
 * GET /api/trends?geo=US
 * Returns the snapshot history for the authenticated user's active
 * (non-archived) keywords for a given country (or worldwide if geo is
 * omitted), grouped by keyword. `requireAuth` is applied per-route (not
 * router-wide) so this router can be mounted at the bare "/api" prefix
 * without risking it also intercepting sibling routes like
 * /api/internal/collect, which authenticates differently.
 */
trendsRouter.get("/trends", requireAuth, async (req, res, next) => {
  try {
    const geo = typeof req.query.geo === "string" ? req.query.geo : "";

    const allKeywords = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), isNull(keywords.removedAt)));

    if (allKeywords.length === 0) {
      res.json([]);
      return;
    }

    const keywordIds = allKeywords.map((kw) => kw.id);
    const allSnapshots = await db
      .select()
      .from(trendSnapshots)
      .where(and(eq(trendSnapshots.geo, geo), inArray(trendSnapshots.keywordId, keywordIds)))
      .orderBy(trendSnapshots.date);

    const result = allKeywords.map((kw) => ({
      id: kw.id,
      term: kw.term,
      category: kw.category,
      timeline: allSnapshots
        .filter((s) => s.keywordId === kw.id)
        .map((s) => ({ date: s.date, value: s.value })),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/related?geo=US
 * Returns rising related queries grouped by keyword, for the
 * authenticated user's active (non-archived) keywords in a given
 * country (or worldwide if geo is omitted).
 */
trendsRouter.get("/related", requireAuth, async (req, res, next) => {
  try {
    const geo = typeof req.query.geo === "string" ? req.query.geo : "";

    const allKeywords = await db
      .select()
      .from(keywords)
      .where(and(eq(keywords.userId, req.userId!), isNull(keywords.removedAt)));

    if (allKeywords.length === 0) {
      res.json([]);
      return;
    }

    const keywordIds = allKeywords.map((kw) => kw.id);
    const allRelated = await db
      .select()
      .from(relatedQueries)
      .where(and(eq(relatedQueries.geo, geo), inArray(relatedQueries.keywordId, keywordIds)))
      .orderBy(desc(relatedQueries.collectedAt));

    const result = allKeywords
      .map((kw) => ({
        id: kw.id,
        term: kw.term,
        category: kw.category,
        rising: sortByGrowthDesc(
          latestRelatedQueriesFor(allRelated, kw.id).map((r) => ({ query: r.query, growthValue: r.growthValue }))
        ),
      }))
      .filter((kw) => kw.rising.length > 0);

    res.json(result);
  } catch (err) {
    next(err);
  }
});
