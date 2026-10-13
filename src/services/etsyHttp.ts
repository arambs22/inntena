import { env } from "../config/env.js";

export const REQUEST_TIMEOUT_MS = 10_000;
const LISTINGS_URL = "https://openapi.etsy.com/v3/application/listings/active";

export interface EtsyFetchResult {
  count: number;
  /** Requests left in Etsy's daily budget, from `x-remaining-today`; null when the header is absent. */
  remainingToday: number | null;
}

export type EtsyFetcher = (term: string) => Promise<EtsyFetchResult>;

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
 * Asks Etsy how many active listings match a term. Requests a single listing (`limit=1`) and reads only the
 * `count` field: Etsy's terms require asking for the minimum data needed, so the listing itself is discarded.
 * The credentials go only into the request header and never into an error message.
 */
export async function fetchListingCountFromEtsy(term: string, fetchImpl: typeof fetch = fetch): Promise<EtsyFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${LISTINGS_URL}?keywords=${encodeURIComponent(term)}&limit=1`, {
      headers: { "x-api-key": `${env.ETSY_API_KEY}:${env.ETSY_API_SECRET}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new EtsyHttpError(response.status, `Etsy responded with HTTP ${response.status}`);

    const body: unknown = await response.json();
    const count = (body as { count?: unknown } | null)?.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new EtsyHttpError(null, "Etsy response had no valid count");
    }

    const header = response.headers.get("x-remaining-today");
    const remaining = header === null || header.trim() === "" ? Number.NaN : Number(header);
    return { count, remainingToday: Number.isFinite(remaining) ? remaining : null };
  } catch (err) {
    if (err instanceof EtsyHttpError) throw err;
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new EtsyHttpError(null, timedOut ? "Etsy request timed out" : "Etsy request failed");
  } finally {
    clearTimeout(timer);
  }
}
