import { db } from "../db/client.js";
import { keywords, trendSnapshots, relatedQueries, keywordCollectionStatus, userRegions } from "../db/schema.js";
import { eq, and, isNull, gte, sql } from "drizzle-orm";
import {
  fetchInterestOverTime,
  fetchRelatedQueries,
  sleep,
  GoogleBlockedError,
} from "./googleTrends.service.js";
import { getStartOfTodayLocal } from "../utils/date.js";
import { logger } from "../utils/logger.js";
import { collectShoppingRising } from "./shoppingRising.service.js";
import { MAX_CONSECUTIVE_FAILURES, randomDelay } from "./collectionPacing.js";

const SKIP_DELAY_MS = 700;

export { MAX_CONSECUTIVE_FAILURES };

/** Stable code stored in `lastErrorMessage` when Google blocked the request, instead of the raw message. */
export const GOOGLE_BLOCKED_CODE = "GOOGLE_BLOCKED";

type CollectionStatus = "skipped" | "success" | "failed" | "blocked";

/** Aggregate outcome of a full multi-region run. "aborted" is the generic consecutive-failure breaker. */
export interface CollectionRunSummary {
  outcome: "ok" | "blocked" | "aborted";
  succeeded: number;
  skipped: number;
  failed: number;
  regions: number;
}

export interface RegionCollectionResult {
  succeeded: number;
  skipped: number;
  failed: number;
  /** True when the region's loop bailed out early on repeated failures (likely rate-limited) rather than finishing its keyword list. */
  stoppedByCircuitBreaker: boolean;
  /** True when Google answered with an HTML block page; the run stopped at once because the block is per IP. */
  blockedByGoogle: boolean;
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

/**
 * True when this keyword+region was successfully collected during the current
 * local day. Based on the collection status, not on a snapshot dated today:
 * Google's series lags a day and drops the partial point, so no snapshot ever
 * carries today's date.
 */
async function alreadyCollectedToday(keywordId: number, geo: string): Promise<boolean> {
  const existing = await db
    .select({ id: keywordCollectionStatus.id })
    .from(keywordCollectionStatus)
    .where(
      and(
        eq(keywordCollectionStatus.keywordId, keywordId),
        eq(keywordCollectionStatus.geo, geo),
        gte(keywordCollectionStatus.lastSuccessAt, getStartOfTodayLocal())
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
    const blocked = err instanceof GoogleBlockedError;
    const message = blocked ? GOOGLE_BLOCKED_CODE : err instanceof Error ? err.message : String(err);
    logger.error(`Failed to collect "${term}" for region "${geo || "worldwide"}"`, { error: message });
    await recordCollectionFailure(keywordId, geo, attemptedAt, message);
    return blocked ? "blocked" : "failed";
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
    blockedByGoogle: false,
  };

  for (const { id, term } of eligible) {
    const status = await collectForKeyword(id, term, geo);

    if (status === "skipped") {
      result.skipped++;
      await sleep(SKIP_DELAY_MS);
      continue;
    }

    if (status === "blocked") {
      result.failed++;
      result.blockedByGoogle = true;
      logger.error("Google blocked the collection (HTML instead of JSON); stopping the run.");
      break;
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
 * Returns an aggregate summary across regions. A Google block (HTML instead
 * of JSON) stops the whole run at the first occurrence, and the shopping step
 * does not run after a block or an abort.
 *
 * If a region's run trips the circuit breaker, the remaining regions are
 * abandoned too: the rate limit is upstream and per-IP, so starting the
 * next region with a fresh failure counter would just multiply the
 * requests hitting an endpoint that is already refusing us.
 */
export async function collectTrendsForAllRegions(): Promise<CollectionRunSummary> {
  const regions = await getAllTrackedRegions();
  const summary: CollectionRunSummary = { outcome: "ok", succeeded: 0, skipped: 0, failed: 0, regions: 0 };

  for (const geo of regions) {
    logger.info(`Starting collection for geo="${geo || "worldwide"}"...`);
    const result = await collectTrendsForAllUsers(geo);
    summary.regions++;
    summary.succeeded += result.succeeded;
    summary.skipped += result.skipped;
    summary.failed += result.failed;

    if (result.blockedByGoogle) {
      summary.outcome = "blocked";
      return summary;
    }
    if (result.stoppedByCircuitBreaker) {
      logger.error(
        `Aborting the rest of the run after region "${geo || "worldwide"}" tripped the circuit breaker (likely rate-limited).`
      );
      summary.outcome = "aborted";
      return summary;
    }
  }

  try {
    await collectShoppingRising();
  } catch (err) {
    logger.error("Shopping rising step failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return summary;
}

async function getAllTrackedRegions(): Promise<string[]> {
  const rows = await db.selectDistinct({ geo: userRegions.geo }).from(userRegions);
  return ["", ...rows.map((r) => r.geo)];
}
