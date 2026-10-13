import { inArray, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { etsySupply as etsySupplyTable } from "../db/schema.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { normalizeTerm } from "../utils/normalizeTerm.js";
import { EtsyHttpError, fetchListingCountFromEtsy, type EtsyFetcher } from "./etsyHttp.js";

/** A stored count older than this is refreshed in the background. */
export const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000;
/** Etsy's terms forbid showing "other Etsy content" older than 24 h, so a count older than this is never returned. */
export const MAX_DISPLAY_AGE_MS = 24 * 60 * 60 * 1000;
/** Keeps requests safely under Etsy's 5-per-second limit. */
export const MIN_REQUEST_INTERVAL_MS = 220;
/** Minimum spacing between purges triggered by reads. */
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;
export const FAILURE_THRESHOLD = 3;
export const CIRCUIT_OPEN_MS = 15 * 60 * 1000;
export const RATE_LIMIT_BACKOFF_MS = 60 * 1000;
/** Stops calling Etsy once this few requests remain in the day, leaving headroom for manual use. */
export const DAILY_RESERVE = 200;

export type SupplyStatus = "fresh" | "refreshing" | "unavailable";

export interface SupplyReading {
  /** The listing count, or null when unknown or too old to show. Zero is a real count. */
  count: number | null;
  fetchedAt: Date | null;
  status: SupplyStatus;
}

interface ServiceDeps {
  db?: typeof db;
  fetcher?: EtsyFetcher;
  isEnabled?: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Reads Etsy listing counts from a shared cache and refreshes stale ones in the background.
 *
 * `readSupply` never waits for Etsy: it answers from the cache and queues any missing or stale term. One queue
 * processes terms sequentially, spaced to respect Etsy's rate limit and deduplicated by term. A circuit breaker
 * pauses all Etsy traffic after repeated failures, a 429, or a nearly exhausted daily budget. State is held in
 * memory, which is correct for the single-instance deployment this project targets.
 */
export function createEtsySupplyService(deps: ServiceDeps = {}) {
  const database = deps.db ?? db;
  const fetcher: EtsyFetcher = deps.fetcher ?? ((term) => fetchListingCountFromEtsy(term));
  const isEnabled = deps.isEnabled ?? (() => Boolean(env.ETSY_API_KEY && env.ETSY_API_SECRET));
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const queued = new Set<string>();
  const queue: string[] = [];
  let draining = false;
  let drainPromise: Promise<void> | null = null;
  let consecutiveFailures = 0;
  let pausedUntil = 0;
  let lastRequestAt = 0;
  let lastPurgeAt = Number.NEGATIVE_INFINITY;
  let purgePromise: Promise<void> | null = null;

  const circuitOpen = () => now() < pausedUntil;
  const openCircuit = (ms: number) => {
    pausedUntil = now() + ms;
  };

  /**
   * Deletes rows older than the 24 h display limit so Etsy content is not kept longer than needed. A row exactly 24 h
   * old is kept. Fire-and-forget: failures are logged and never reach callers.
   */
  function purgeStale(): void {
    lastPurgeAt = now();
    const run = (async () => {
      try {
        await database.delete(etsySupplyTable).where(lt(etsySupplyTable.fetchedAt, new Date(now() - MAX_DISPLAY_AGE_MS)));
      } catch (err) {
        try {
          logger.error("Could not purge stale Etsy supply rows", { error: err instanceof Error ? err.message : String(err) });
        } catch {
          // Logging must never turn a handled failure into an unhandled rejection.
        }
      }
    })();
    const tracked = run.finally(() => {
      if (purgePromise === tracked) purgePromise = null;
    });
    purgePromise = tracked;
  }

  async function refreshOne(term: string): Promise<void> {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = now();

    let result;
    try {
      result = await fetcher(term);
    } catch (err) {
      const status = err instanceof EtsyHttpError ? err.status : null;
      if (status === 429) {
        openCircuit(RATE_LIMIT_BACKOFF_MS);
      } else {
        consecutiveFailures += 1;
        if (consecutiveFailures >= FAILURE_THRESHOLD) {
          openCircuit(CIRCUIT_OPEN_MS);
          consecutiveFailures = 0;
        }
      }
      logger.warn("Etsy supply refresh failed", { term, status, error: err instanceof Error ? err.message : String(err) });
      return;
    }

    try {
      const fetchedAt = new Date(now());
      await database
        .insert(etsySupplyTable)
        .values({ term, listingCount: result.count, fetchedAt })
        .onConflictDoUpdate({ target: etsySupplyTable.term, set: { listingCount: result.count, fetchedAt } });
    } catch (err) {
      logger.error("Could not store an Etsy supply count", { term, error: err instanceof Error ? err.message : String(err) });
      return;
    }

    consecutiveFailures = 0;
    if (result.remainingToday !== null && result.remainingToday <= DAILY_RESERVE) {
      openCircuit(CIRCUIT_OPEN_MS);
      logger.warn("Etsy daily request budget nearly spent; pausing refreshes", { remainingToday: result.remainingToday });
    }
  }

  async function drain(): Promise<void> {
    while (queue.length > 0) {
      if (circuitOpen()) {
        for (const term of queue.splice(0)) queued.delete(term);
        return;
      }
      const term = queue.shift()!;
      try {
        await refreshOne(term);
      } finally {
        queued.delete(term);
      }
    }
  }

  function startDrain(): void {
    if (draining) return;
    draining = true;
    drainPromise = drain()
      .catch((err) => {
        // An unexpected failure must neither crash the process nor strand the remaining queue.
        try {
          logger.error("Etsy supply refresh loop failed", { error: err instanceof Error ? err.message : String(err) });
        } catch {
          // Logging must never turn a handled failure back into an unhandled rejection.
        }
      })
      .finally(() => {
        draining = false;
        drainPromise = null;
        purgeStale();
        // A term queued in the gap between the loop ending and this callback must not be stranded.
        if (queue.length > 0) startDrain();
      });
  }

  function schedule(terms: string[]): void {
    for (const term of terms) {
      if (!queued.has(term)) {
        queued.add(term);
        queue.push(term);
      }
    }
    if (queue.length > 0) startDrain();
  }

  /** Answers from the cache right away and queues whatever is missing or stale; keyed by normalized term. Empty when disabled. */
  async function readSupply(rawTerms: string[]): Promise<Map<string, SupplyReading>> {
    const readings = new Map<string, SupplyReading>();
    if (!isEnabled()) return readings;

    const terms = [...new Set(rawTerms.map(normalizeTerm))].filter((term) => term !== "");
    if (terms.length === 0) return readings;
    if (now() - lastPurgeAt >= PURGE_INTERVAL_MS) purgeStale();

    const rows = await database.select().from(etsySupplyTable).where(inArray(etsySupplyTable.term, terms));
    const byTerm = new Map(rows.map((row) => [row.term, row]));
    const toRefresh: string[] = [];

    for (const term of terms) {
      const row = byTerm.get(term);
      const age = row ? now() - row.fetchedAt.getTime() : Number.POSITIVE_INFINITY;
      if (row && age <= MAX_DISPLAY_AGE_MS) {
        readings.set(term, { count: row.listingCount, fetchedAt: row.fetchedAt, status: "fresh" });
        if (age > REFRESH_AFTER_MS) toRefresh.push(term);
      } else {
        readings.set(term, { count: null, fetchedAt: null, status: circuitOpen() ? "unavailable" : "refreshing" });
        toRefresh.push(term);
      }
    }

    if (!circuitOpen()) schedule(toRefresh);
    return readings;
  }

  /** Resolves when the refresh queue is empty. Used by tests; production code never waits on it. */
  async function onIdle(): Promise<void> {
    while (drainPromise || purgePromise) await (drainPromise ?? purgePromise);
  }

  return { isEnabled, readSupply, onIdle };
}

/** The process-wide instance used by the routes. */
export const etsySupplyService = createEtsySupplyService();
