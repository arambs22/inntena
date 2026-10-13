import type { Keyword, KeywordTrend, SupplyItem } from "./types";
import { computeMomentum, supplyLevel, verdictFor, type Momentum, type SupplyLevel, type Verdict } from "./opportunity";

/** Everything the UI shows about one keyword's opportunity: demand momentum, Etsy supply and the combined verdict. */
export interface KeywordInsight {
  momentum: Momentum;
  changePct: number | null;
  /** The raw supply reading, or null when Etsy is off or has no entry for this keyword. */
  supply: SupplyItem | null;
  level: SupplyLevel | null;
  verdict: Verdict | null;
}

/**
 * Builds one insight per keyword. `trends` are the Google Trends timelines of ONE region (the first active one),
 * so momentum always refers to a single region. A supply count of 0 is real data and counts as low supply.
 */
export function buildInsights(
  keywords: Pick<Keyword, "id">[],
  trends: KeywordTrend[] | undefined,
  supply: SupplyItem[],
): Map<number, KeywordInsight> {
  const insights = new Map<number, KeywordInsight>();
  for (const keyword of keywords) {
    const { momentum, changePct } = computeMomentum(trends?.find((trend) => trend.id === keyword.id)?.timeline ?? []);
    const item = supply.find((entry) => entry.keywordId === keyword.id) ?? null;
    const level = item !== null && item.count !== null ? supplyLevel(item.count) : null;
    insights.set(keyword.id, { momentum, changePct, supply: item, level, verdict: verdictFor(momentum, level) });
  }
  return insights;
}
