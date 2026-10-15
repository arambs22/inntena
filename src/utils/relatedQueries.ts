import type { relatedQueries } from "../db/schema.js";

/**
 * relatedQueries rows are never replaced between collection runs (unlike
 * trendSnapshots, which has a uniqueness constraint) — GET /:id/related
 * (keywords.route.ts) relies on that to show archived keywords' full
 * history. Here, on the active dashboard, only the most recent collection's
 * rows represent what's currently rising, so every other run's rows must be
 * filtered out. `related` must already be sorted by collectedAt desc.
 */
export function latestRelatedQueriesFor(related: (typeof relatedQueries.$inferSelect)[], keywordId: number) {
  const forKeyword = related.filter((r) => r.keywordId === keywordId);
  const latestDate = forKeyword[0]?.collectedAt.toISOString().slice(0, 10);
  return forKeyword.filter((r) => r.collectedAt.toISOString().slice(0, 10) === latestDate);
}
