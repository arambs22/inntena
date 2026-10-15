import { env } from "../config/env.js";
import type { ListingSampleRow } from "../db/schema.js";

export const REQUEST_TIMEOUT_MS = 10_000;
/** Listings shown per keyword in "On Etsy now". */
export const SAMPLE_SIZE = 5;
const API_BASE = "https://openapi.etsy.com/v3/application";

export interface EtsyFetchResult {
  count: number;
  /** Requests left in Etsy's daily budget, from `x-remaining-today`; null when the header is absent. */
  remainingToday: number | null;
}

/** Optional narrowing of a count: an Etsy category (subcategories included) and the sellers' country name. */
export interface EtsyCountFilters {
  taxonomyId?: number;
  shopLocation?: string;
}

export type EtsyFetcher = (term: string, filters?: EtsyCountFilters) => Promise<EtsyFetchResult>;

export interface EtsySamplesResult {
  listings: ListingSampleRow[];
  remainingToday: number | null;
}

/** `pause`, when given, is awaited between the fetcher's two Etsy requests so the caller can enforce request spacing. */
export type EtsySamplesFetcher = (term: string, taxonomyId?: number, pause?: () => Promise<void>) => Promise<EtsySamplesResult>;

/** A failed Etsy call. `status` is the HTTP status, or null for network errors, timeouts and unreadable bodies. */
export class EtsyHttpError extends Error {
  readonly status: number | null;

  constructor(status: number | null, message: string) {
    super(message);
    this.name = "EtsyHttpError";
    this.status = status;
  }
}

/**
 * One GET to Etsy's API with the 10 s timeout. The credentials go only into the request header and never into an
 * error message. Returns the parsed body and the remaining daily budget.
 */
async function etsyGet(url: string, fetchImpl: typeof fetch): Promise<{ body: unknown; remainingToday: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { "x-api-key": `${env.ETSY_API_KEY}:${env.ETSY_API_SECRET}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new EtsyHttpError(response.status, `Etsy responded with HTTP ${response.status}`);
    const body: unknown = await response.json();
    const header = response.headers.get("x-remaining-today");
    const remaining = header === null || header.trim() === "" ? Number.NaN : Number(header);
    return { body, remainingToday: Number.isFinite(remaining) ? remaining : null };
  } catch (err) {
    if (err instanceof EtsyHttpError) throw err;
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new EtsyHttpError(null, timedOut ? "Etsy request timed out" : "Etsy request failed");
  } finally {
    clearTimeout(timer);
  }
}

function searchUrl(term: string, limit: number, extra: Record<string, string | number | undefined>): string {
  let url = `${API_BASE}/listings/active?keywords=${encodeURIComponent(term)}&limit=${limit}`;
  for (const [name, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") url += `&${name}=${encodeURIComponent(String(value))}`;
  }
  return url;
}

/**
 * Asks Etsy how many active listings match a term, optionally within one category or from sellers in one country.
 * Requests a single listing (`limit=1`) and reads only `count`: Etsy's terms require asking for the minimum data.
 */
export async function fetchListingCountFromEtsy(
  term: string,
  fetchImpl: typeof fetch = fetch,
  filters: EtsyCountFilters = {},
): Promise<EtsyFetchResult> {
  const { body, remainingToday } = await etsyGet(
    searchUrl(term, 1, { taxonomy_id: filters.taxonomyId, shop_location: filters.shopLocation }),
    fetchImpl,
  );
  const count = (body as { count?: unknown } | null)?.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    throw new EtsyHttpError(null, "Etsy response had no valid count");
  }
  return { count, remainingToday };
}

function toSample(raw: unknown): ListingSampleRow | null {
  const item = raw as Record<string, unknown> | null;
  if (!item || typeof item.listing_id !== "number" || typeof item.title !== "string" || typeof item.url !== "string") {
    return null;
  }
  const price = item.price as { amount?: unknown; divisor?: unknown; currency_code?: unknown } | undefined;
  const amount = typeof price?.amount === "number" && typeof price?.divisor === "number" && price.divisor > 0
    ? price.amount / price.divisor
    : null;
  const images = Array.isArray(item.images) ? item.images : [];
  const thumb = (images[0] as { url_170x135?: unknown } | undefined)?.url_170x135;
  return {
    listingId: item.listing_id,
    title: item.title,
    price: amount,
    currency: typeof price?.currency_code === "string" ? price.currency_code : null,
    url: item.url,
    thumbnailUrl: typeof thumb === "string" ? thumb : null,
    favorites: typeof item.num_favorers === "number" ? item.num_favorers : 0,
    views: typeof item.views === "number" ? item.views : 0,
  };
}

/**
 * Up to five listings for a term, ordered by Etsy's own relevance (`sort_on=score`), with a thumbnail. Two calls:
 * the search returns ids, and the batch endpoint returns those listings with their images (the search endpoint
 * ignores `includes`). The optional `pause` runs between the two calls. Only the fields of `ListingSampleRow` are kept; everything else in the response is discarded.
 */
export async function fetchListingSamplesFromEtsy(
  term: string,
  taxonomyId?: number,
  fetchImpl: typeof fetch = fetch,
  pause?: () => Promise<void>,
): Promise<EtsySamplesResult> {
  const first = await etsyGet(searchUrl(term, SAMPLE_SIZE, { sort_on: "score", taxonomy_id: taxonomyId }), fetchImpl);
  const results = (first.body as { results?: unknown } | null)?.results;
  const ids = (Array.isArray(results) ? results : [])
    .map((r) => (r as { listing_id?: unknown } | null)?.listing_id)
    .filter((id): id is number => typeof id === "number");
  if (ids.length === 0) return { listings: [], remainingToday: first.remainingToday };

  if (pause) await pause();
  const second = await etsyGet(
    `${API_BASE}/listings/batch?listing_ids=${encodeURIComponent(ids.join(","))}&includes=Images`,
    fetchImpl,
  );
  const batch = (second.body as { results?: unknown } | null)?.results;
  const byId = new Map<number, ListingSampleRow>();
  for (const raw of Array.isArray(batch) ? batch : []) {
    const sample = toSample(raw);
    if (sample) byId.set(sample.listingId, sample);
  }
  return {
    listings: ids.map((id) => byId.get(id)).filter((s): s is ListingSampleRow => s !== undefined),
    remainingToday: second.remainingToday ?? first.remainingToday,
  };
}
