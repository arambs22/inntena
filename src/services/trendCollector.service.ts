import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries, keywordCollectionStatus, userRegions } from "../db/schema.js";
import { eq, and, isNull, sql } from "drizzle-orm";
import {
  fetchInterestOverTime,
  fetchRelatedQueries,
  sleep,
} from "./googleTrends.service.js";
import { getTodayLocal } from "../utils/date.js";
import { logger } from "../utils/logger.js";
import { collectShoppingRising } from "./shoppingRising.service.js";
import { MAX_CONSECUTIVE_FAILURES, randomDelay } from "./collectionPacing.js";

const SKIP_DELAY_MS = 700;

export { MAX_CONSECUTIVE_FAILURES };

type CollectionStatus = "skipped" | "success" | "failed";

export interface RegionCollectionResult {
  succeeded: number;
  skipped: number;
  failed: number;
  /** True when the region's loop bailed out early on repeated failures (likely rate-limited) rather than finishing its keyword list. */
  stoppedByCircuitBreaker: boolean;
}

interface KeywordRow {
  id: number;
  term: string;
}

/** Every actively tracked (non-archived, not paused) keyword across all users. */
async function getEligibleKeywords(): Promise<KeywordRow[]> {
  return db
    .select({ id: keywords.id, term: keywords.term })
    .from(keywords)
    .where(and(isNull(keywords.removedAt), eq(keywords.autoCollectPaused, false)));
}

/** True when this keyword+region already has a snapshot for today (local time). */
async function alreadyCollectedToday(keywordId: number, geo: string): Promise<boolean> {
  const existing = await db
    .select({ id: trendSnapshots.id })
    .from(trendSnapshots)
    .where(
      and(
        eq(trendSnapshots.keywordId, keywordId),
        eq(trendSnapshots.geo, geo),
        eq(trendSnapshots.date, getTodayLocal())
      )
    )
    .limit(1);

  return existing.length > 0;
}

async function recordCollectionSuccess(keywordId: number, geo: string, attemptedAt: Date): Promise<void> {
  await db
    .insert(keywordCollectionStatus)
    .values({
      keywordId,
      geo,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: attemptedAt,
      lastErrorMessage: null,
      consecutiveFailures: 0,
    })
    .onConflictDoUpdate({
      target: [keywordCollectionStatus.keywordId, keywordCollectionStatus.geo],
      set: { lastAttemptAt: attemptedAt, lastSuccessAt: attemptedAt, lastErrorMessage: null, consecutiveFailures: 0 },
    });
}

async function recordCollectionFailure(
  keywordId: number,
  geo: string,
  attemptedAt: Date,
  message: string
): Promise<void> {
  const [existing] = await db
    .select()
    .from(keywordCollectionStatus)
    .where(and(eq(keywordCollectionStatus.keywordId, keywordId), eq(keywordCollectionStatus.geo, geo)))
    .limit(1);

  const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;

  await db
    .insert(keywordCollectionStatus)
    .values({ keywordId, geo, lastAttemptAt: attemptedAt, lastErrorMessage: message, consecutiveFailures })
    .onConflictDoUpdate({
      target: [keywordCollectionStatus.keywordId, keywordCollectionStatus.geo],
      set: { lastAttemptAt: attemptedAt, lastErrorMessage: message, consecutiveFailures },
    });
}

/**
 * Collects one keyword in one region: its interest-over-time series (one
 * request, one keyword — never batched, see fetchInterestOverTime) and then
 * its rising related queries. Records collection status for the
 * keyword+region on every attempt, success or failure.
 */
async function collectForKeyword(keywordId: number, term: string, geo: string): Promise<CollectionStatus> {
  if (await alreadyCollectedToday(keywordId, geo)) {
    logger.info(`  [${geo || "worldwide"}] "${term}" skipped (already collected today)`);
    return "skipped";
  }

  const attemptedAt = new Date();

  try {
    const timeline = await fetchInterestOverTime(term, geo);
    if (timeline.length > 0) {
      await db
        .insert(trendSnapshots)
        .values(timeline.map((point) => ({ keywordId, geo, date: point.date, value: point.value })))
        .onConflictDoUpdate({
          target: [trendSnapshots.keywordId, trendSnapshots.geo, trendSnapshots.date],
          set: { value: sql`excluded.value` },
        });
    }

    await sleep(randomDelay());

    const rising = await fetchRelatedQueries(term, geo);
    if (rising.length > 0) {
      await db
        .insert(relatedQueries)
        .values(rising.map((item) => ({ keywordId, geo, query: item.query, growthValue: item.growthValue })));
    }

    await recordCollectionSuccess(keywordId, geo, attemptedAt);
    logger.info(
      `  [${geo || "worldwide"}] "${term}" ok (${timeline.length} snapshots, ${rising.length} related queries)`
    );
    return "success";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to collect "${term}" for region "${geo || "worldwide"}"`, { error: message });
    await recordCollectionFailure(keywordId, geo, attemptedAt, message);
    return "failed";
  }
}

/**
 * Collects trend data for every eligible keyword across all users, for a
 * single region, one keyword per request. Runs sequentially and stops early
 * after repeated consecutive failures (likely a temporary upstream rate
 * limit), reporting that back to the caller.
 */
export async function collectTrendsForAllUsers(geo: string = ""): Promise<RegionCollectionResult> {
  const eligible = await getEligibleKeywords();

  let consecutiveFailures = 0;
  const result: RegionCollectionResult = {
    succeeded: 0,
    skipped: 0,
    failed: 0,
    stoppedByCircuitBreaker: false,
  };

  for (const { id, term } of eligible) {
    const status = await collectForKeyword(id, term, geo);

    if (status === "skipped") {
      result.skipped++;
      await sleep(SKIP_DELAY_MS);
      continue;
    }

    if (status === "success") {
      result.succeeded++;
      consecutiveFailures = 0;
    } else {
      result.failed++;
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error(
          `Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures (likely rate-limited).`
        );
        result.stoppedByCircuitBreaker = true;
        break;
      }
    }

    await sleep(randomDelay());
  }

  logger.info(
    `Summary [${geo || "worldwide"}]: ${result.succeeded} succeeded, ${result.skipped} skipped, ${result.failed} failed`
  );
  return result;
}

/**
 * Collects trend data across every region tracked by any user (plus
 * Worldwide, always implicit), one region at a time, sequentially. This
 * is the entry point for the scheduled collection endpoint.
 *
 * If a region's run trips the circuit breaker, the remaining regions are
 * abandoned too: the rate limit is upstream and per-IP, so starting the
 * next region with a fresh failure counter would just multiply the
 * requests hitting an endpoint that is already refusing us.
 */
export async function collectTrendsForAllRegions(): Promise<void> {
  const regions = await getAllTrackedRegions();
  for (const geo of regions) {
    logger.info(`Starting collection for geo="${geo || "worldwide"}"...`);
    const result = await collectTrendsForAllUsers(geo);
    if (result.stoppedByCircuitBreaker) {
      logger.error(
        `Aborting the rest of the run after region "${geo || "worldwide"}" tripped the circuit breaker (likely rate-limited).`
      );
      return;
    }
  }

  try {
    await collectShoppingRising();
  } catch (err) {
    logger.error("Shopping rising step failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function getAllTrackedRegions(): Promise<string[]> {
  const rows = await db.selectDistinct({ geo: userRegions.geo }).from(userRegions);
  return ["", ...rows.map((r) => r.geo)];
}
