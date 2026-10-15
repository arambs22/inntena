import googleTrends from "google-trends-api";

export interface TrendPoint {
  date: string;
  value: number;
}

export interface RelatedQueryResult {
  query: string;
  growthValue: string;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Fetches the interest-over-time series for a keyword over the last 90 days.
 *
 * Deliberately one keyword per request: Google Trends normalizes a
 * multi-keyword (comparison) response against the peak of the highest-volume
 * term in that group, so a low-volume niche keyword's 0-100 values would
 * depend on whichever keywords it happened to be grouped with. Requesting one
 * term at a time keeps every stored value self-normalized and comparable
 * across days. Do not batch this.
 *
 * Partial points (the still-incomplete most recent period) are dropped: their
 * value is artificially low and would otherwise be stored permanently.
 */
export async function fetchInterestOverTime(
  keyword: string,
  geo: string = ""
): Promise<TrendPoint[]> {
  const raw = await googleTrends.interestOverTime({
    keyword,
    startTime: new Date(Date.now() - NINETY_DAYS_MS),
    geo,
  });

  const parsed = JSON.parse(raw);
  const timelineData = parsed.default?.timelineData ?? [];

  return timelineData
    .filter((point: any) => !point.isPartial)
    .map((point: any) => ({
      date: new Date(Number(point.time) * 1000).toISOString().slice(0, 10),
      value: point.value[0],
    }));
}

/**
 * Fetches rising related queries for a keyword over the last 90 days.
 * When `property` is "froogle" the queries come from Google Shopping search.
 */
export async function fetchRelatedQueries(
  keyword: string,
  geo: string = "",
  property?: "froogle"
): Promise<RelatedQueryResult[]> {
  const raw = await googleTrends.relatedQueries({
    keyword,
    startTime: new Date(Date.now() - NINETY_DAYS_MS),
    geo,
    ...(property ? { property } : {}),
  });

  const parsed = JSON.parse(raw);
  const rankedList = parsed.default?.rankedList?.[1]?.rankedKeyword ?? [];

  return rankedList.map((item: any) => ({
    query: item.query,
    growthValue: String(item.value),
  }));
}

/** Resolves after the given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}