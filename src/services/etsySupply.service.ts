import { eq, inArray, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { etsyListingSamples as samplesTable, etsySupply as etsySupplyTable, type ListingSampleRow } from "../db/schema.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { normalizeTerm } from "../utils/normalizeTerm.js";
import {
  EtsyHttpError,
  fetchListingCountFromEtsy,
  fetchListingSamplesFromEtsy,
  type EtsyCountFilters,
  type EtsyFetcher,
  type EtsySamplesFetcher,
} from "./etsyHttp.js";

/** A stored count older than this is refreshed in the background. */
export const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000;
/** Etsy's terms forbid showing "other Etsy content" older than 24 h, so a count older than this is never returned. */
export const MAX_DISPLAY_AGE_MS = 24 * 60 * 60 * 1000;
/** A stored listing sample older than this is refreshed in the background. */
export const SAMPLES_REFRESH_AFTER_MS = 3 * 60 * 60 * 1000;
/** Etsy's terms forbid showing listing content more than 6 h older than Etsy itself, so older samples are never returned. */
export const SAMPLES_MAX_AGE_MS = 6 * 60 * 60 * 1000;
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

/** What a count is about: a term, optionally within one Etsy category and/or from sellers in one country. */
export interface SupplyKey {
  term: string;
  taxonomyId?: number | null;
  shopLocation?: string | null;
}

export interface SamplesReading {
  /** The listings, or null when unknown or too old to show. An empty array is a real result. */
  listings: ListingSampleRow[] | null;
  fetchedAt: Date | null;
  status: SupplyStatus;
}

/**
 * Cache id of a count. A key without filters is just the normalized term (the id plain-term callers already use);
 * a filtered key is "term|taxonomyId|shopLocation" (0 / '' meaning "all").
 */
export function supplyKeyId(key: SupplyKey | string): string {
  const k = typeof key === "string" ? { term: key } : key;
  const term = normalizeTerm(k.term);
  const taxonomyId = k.taxonomyId ?? 0;
  const shopLocation = k.shopLocation ?? "";
  return taxonomyId === 0 && shopLocation === "" ? term : `${term}|${taxonomyId}|${shopLocation}`;
}

/** Cache id of a listing sample: "term|taxonomyId" (0 meaning all categories). */
export function samplesKeyId(term: string, taxonomyId?: number | null): string {
  return `${normalizeTerm(term)}|${taxonomyId ?? 0}`;
}

type CountJob = { kind: "count"; id: string; term: string; taxonomyId: number; shopLocation: string };
type SamplesJob = { kind: "samples"; id: string; term: string; taxonomyId: number };
type Job = CountJob | SamplesJob;

/** Thrown when Etsy answered but the database write failed: logged, never counted as an Etsy failure. */
class StoreError extends Error {}

interface ServiceDeps {
  db?: typeof db;
  fetcher?: EtsyFetcher;
  samplesFetcher?: EtsySamplesFetcher;
  isEnabled?: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Reads Etsy listing counts and example listings from a shared cache and refreshes stale ones in the background.
 *
 * `readSupply` (counts, keyed by term plus optional category and seller country) and `readListingSamples` (up to five
 * example listings) never wait for Etsy: they answer from the cache and queue whatever is missing or stale. Counts
 * refresh after 12 h and are never shown past 24 h; samples refresh after 3 h and are never shown past 6 h. One queue
 * processes both job kinds sequentially, spaced to respect Etsy's rate limit and deduplicated by kind and key. A
 * circuit breaker pauses all Etsy traffic after repeated failures, a 429, or a nearly exhausted daily budget. State is
 * held in memory, which is correct for the single-instance deployment this project targets.
 */
export function createEtsySupplyService(deps: ServiceDeps = {}) {
  const database = deps.db ?? db;
  const fetcher: EtsyFetcher =
    deps.fetcher ?? ((term, filters) => (filters ? fetchListingCountFromEtsy(term, fetch, filters) : fetchListingCountFromEtsy(term)));
  const samplesFetcher: EtsySamplesFetcher =
    deps.samplesFetcher ?? ((term, taxonomyId, pause) => fetchListingSamplesFromEtsy(term, taxonomyId, fetch, pause));
  const isEnabled = deps.isEnabled ?? (() => Boolean(env.ETSY_API_KEY && env.ETSY_API_SECRET));
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const queued = new Set<string>();
  const queue: Job[] = [];
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
   * Deletes counts older than the 24 h display limit and samples older than 6 h so Etsy content is not kept longer
   * than needed. A row exactly at its limit is kept. Fire-and-forget: failures are logged and never reach callers.
   */
  function purgeStale(): void {
    lastPurgeAt = now();
    const run = (async () => {
      const attempt = async (table: typeof etsySupplyTable | typeof samplesTable, cutoff: Date) => {
        try {
          await database.delete(table).where(lt(table.fetchedAt, cutoff));
        } catch (err) {
          try {
            logger.error("Could not purge stale Etsy supply rows", { error: err instanceof Error ? err.message : String(err) });
          } catch {
            // Logging must never turn a handled failure into an unhandled rejection.
          }
        }
      };
      // Separate attempts: one table failing must not skip the other.
      await attempt(etsySupplyTable, new Date(now() - MAX_DISPLAY_AGE_MS));
      await attempt(samplesTable, new Date(now() - SAMPLES_MAX_AGE_MS));
    })();
    const tracked = run.finally(() => {
      if (purgePromise === tracked) purgePromise = null;
    });
    purgePromise = tracked;
  }

  async function storeCount(job: CountJob, count: number): Promise<void> {
    const fetchedAt = new Date(now());
    try {
      await database
        .insert(etsySupplyTable)
        .values({ term: job.term, taxonomyId: job.taxonomyId, shopLocation: job.shopLocation, listingCount: count, fetchedAt })
        .onConflictDoUpdate({
          target: [etsySupplyTable.term, etsySupplyTable.taxonomyId, etsySupplyTable.shopLocation],
          set: { listingCount: count, fetchedAt },
        });
    } catch (err) {
      throw new StoreError(err instanceof Error ? err.message : String(err));
    }
  }

  async function storeSamples(job: SamplesJob, listings: ListingSampleRow[]): Promise<void> {
    const fetchedAt = new Date(now());
    try {
      await database
        .insert(samplesTable)
        .values({ key: job.id, payload: listings, fetchedAt })
        .onConflictDoUpdate({ target: samplesTable.key, set: { payload: listings, fetchedAt } });
    } catch (err) {
      throw new StoreError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshOne(job: Job): Promise<void> {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = now();

    let remainingToday: number | null;
    try {
      if (job.kind === "count") {
        const filters: EtsyCountFilters = {};
        if (job.taxonomyId !== 0) filters.taxonomyId = job.taxonomyId;
        if (job.shopLocation !== "") filters.shopLocation = job.shopLocation;
        const result = Object.keys(filters).length === 0 ? await fetcher(job.term) : await fetcher(job.term, filters);
        remainingToday = result.remainingToday;
        await storeCount(job, result.count);
      } else {
        // A samples job makes two Etsy requests; the pause keeps the second one MIN_REQUEST_INTERVAL_MS after the first.
        const pause = async () => {
          const gap = lastRequestAt + MIN_REQUEST_INTERVAL_MS - now();
          if (gap > 0) await sleep(gap);
          lastRequestAt = now();
        };
        const result = await samplesFetcher(job.term, job.taxonomyId === 0 ? undefined : job.taxonomyId, pause);
        remainingToday = result.remainingToday;
        await storeSamples(job, result.listings);
      }
    } catch (err) {
      if (err instanceof StoreError) {
        logger.error("Could not store Etsy data", { term: job.term, kind: job.kind, error: err.message });
        return;
      }
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
      logger.warn("Etsy supply refresh failed", {
        term: job.term,
        kind: job.kind,
        status,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    } finally {
      // Spaces the next job from the end of this one (including the second request of a samples job).
      lastRequestAt = now();
    }

    consecutiveFailures = 0;
    if (remainingToday !== null && remainingToday <= DAILY_RESERVE) {
      openCircuit(CIRCUIT_OPEN_MS);
      logger.warn("Etsy daily request budget nearly spent; pausing refreshes", { remainingToday });
    }
  }

  const jobKey = (job: Job) => `${job.kind}:${job.id}`;

  async function drain(): Promise<void> {
    while (queue.length > 0) {
      if (circuitOpen()) {
        for (const job of queue.splice(0)) queued.delete(jobKey(job));
        return;
      }
      const job = queue.shift()!;
      try {
        await refreshOne(job);
      } finally {
        queued.delete(jobKey(job));
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
        // A job queued in the gap between the loop ending and this callback must not be stranded.
        if (queue.length > 0) startDrain();
      });
  }

  function schedule(jobs: Job[]): void {
    for (const job of jobs) {
      const key = jobKey(job);
      if (!queued.has(key)) {
        queued.add(key);
        queue.push(job);
      }
    }
    if (queue.length > 0) startDrain();
  }

  function maybePurge(): void {
    if (now() - lastPurgeAt >= PURGE_INTERVAL_MS) purgeStale();
  }

  /**
   * Answers from the cache right away and queues whatever is missing or stale; keyed by `supplyKeyId` (the normalized
   * term when there are no filters). Empty when disabled.
   */
  async function readSupply(keys: (SupplyKey | string)[]): Promise<Map<string, SupplyReading>> {
    const readings = new Map<string, SupplyReading>();
    if (!isEnabled()) return readings;

    const jobs = new Map<string, CountJob>();
    for (const raw of keys) {
      const key = typeof raw === "string" ? { term: raw } : raw;
      const term = normalizeTerm(key.term);
      if (term === "") continue;
      const id = supplyKeyId(key);
      jobs.set(id, { kind: "count", id, term, taxonomyId: key.taxonomyId ?? 0, shopLocation: key.shopLocation ?? "" });
    }
    if (jobs.size === 0) return readings;
    maybePurge();

    const terms = [...new Set([...jobs.values()].map((job) => job.term))];
    const rows = await database.select().from(etsySupplyTable).where(inArray(etsySupplyTable.term, terms));
    const byId = new Map(
      rows.map((row) => [supplyKeyId({ term: row.term, taxonomyId: row.taxonomyId, shopLocation: row.shopLocation }), row]),
    );
    const toRefresh: Job[] = [];

    for (const job of jobs.values()) {
      const row = byId.get(job.id);
      const age = row ? now() - row.fetchedAt.getTime() : Number.POSITIVE_INFINITY;
      if (row && age <= MAX_DISPLAY_AGE_MS) {
        readings.set(job.id, { count: row.listingCount, fetchedAt: row.fetchedAt, status: "fresh" });
        if (age > REFRESH_AFTER_MS) toRefresh.push(job);
      } else {
        readings.set(job.id, { count: null, fetchedAt: null, status: circuitOpen() ? "unavailable" : "refreshing" });
        toRefresh.push(job);
      }
    }

    if (!circuitOpen()) schedule(toRefresh);
    return readings;
  }

  /** Up to five example listings for a term, from the cache; queues a refresh when missing or older than 3 h. */
  async function readListingSamples(rawTerm: string, taxonomyId: number | null = null): Promise<SamplesReading> {
    const unavailable: SamplesReading = { listings: null, fetchedAt: null, status: "unavailable" };
    if (!isEnabled()) return unavailable;
    const term = normalizeTerm(rawTerm);
    if (term === "") return unavailable;
    maybePurge();

    const id = samplesKeyId(term, taxonomyId);
    const job: Job = { kind: "samples", id, term, taxonomyId: taxonomyId ?? 0 };
    const [row] = await database.select().from(samplesTable).where(eq(samplesTable.key, id));
    const age = row ? now() - row.fetchedAt.getTime() : Number.POSITIVE_INFINITY;

    if (row && age <= SAMPLES_MAX_AGE_MS) {
      if (age > SAMPLES_REFRESH_AFTER_MS && !circuitOpen()) schedule([job]);
      return { listings: row.payload, fetchedAt: row.fetchedAt, status: "fresh" };
    }
    if (circuitOpen()) return unavailable;
    schedule([job]);
    return { listings: null, fetchedAt: null, status: "refreshing" };
  }

  /** Resolves when the refresh queue is empty. Used by tests; production code never waits on it. */
  async function onIdle(): Promise<void> {
    while (drainPromise || purgePromise) await (drainPromise ?? purgePromise);
  }

  return { isEnabled, readSupply, readListingSamples, onIdle };
}

/** The process-wide instance used by the routes. */
export const etsySupplyService = createEtsySupplyService();
