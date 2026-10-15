import { db as defaultDb } from "../db/client.js";
import { discoverRising } from "../db/schema.js";
import { eq, gte } from "drizzle-orm";
import { fetchRelatedQueries, sleep as defaultSleep, GoogleBlockedError } from "./googleTrends.service.js";
import { MAX_CONSECUTIVE_FAILURES, randomDelay } from "./collectionPacing.js";
import { logger } from "../utils/logger.js";

/** Hub seeds for digital-product niches on Etsy; half of them are queried each day. */
export const HUB_SEEDS: readonly string[] = [
  "clipart",
  "printable",
  "coloring pages",
  "wall art",
  "sticker",
  "png",
  "clip art",
  "template",
  "planner",
  "invitation",
  "stencil",
  "svg",
];

const SEEDS_PER_DAY = HUB_SEEDS.length / 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ShoppingRisingSummary {
  collectedSeeds: number;
  failedSeeds: number;
  skipped: boolean;
}

export interface ShoppingRisingDeps {
  fetchRising: typeof fetchRelatedQueries;
  db: typeof defaultDb;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
}

/** Returns the 8 seeds for a given date, alternating between both halves of HUB_SEEDS by UTC day index. */
export function seedsForDay(date: Date): string[] {
  const dayIndex = Math.floor(date.getTime() / DAY_MS);
  const start = (dayIndex % 2) * SEEDS_PER_DAY;
  return HUB_SEEDS.slice(start, start + SEEDS_PER_DAY);
}

/**
 * Collects rising Google Shopping queries for today's hub seeds into
 * `discover_rising`. Runs at most once per UTC day, sequentially, replaces
 * each seed's rows atomically, stops at the first Google block, and never throws.
 */
export async function collectShoppingRising(
  overrides: Partial<ShoppingRisingDeps> = {}
): Promise<ShoppingRisingSummary> {
  const deps: ShoppingRisingDeps = {
    fetchRising: fetchRelatedQueries,
    db: defaultDb,
    sleep: defaultSleep,
    now: () => new Date(),
    ...overrides,
  };
  const summary: ShoppingRisingSummary = { collectedSeeds: 0, failedSeeds: 0, skipped: false };

  try {
    const now = deps.now();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const existing = await deps.db
      .select({ id: discoverRising.id })
      .from(discoverRising)
      .where(gte(discoverRising.collectedAt, startOfDay))
      .limit(1);
    if (existing.length > 0) {
      summary.skipped = true;
      return summary;
    }

    let consecutiveFailures = 0;
    for (const seed of seedsForDay(now)) {
      try {
        const rising = await deps.fetchRising(seed, "US", "froogle");
        await deps.db.transaction(async (tx) => {
          await tx.delete(discoverRising).where(eq(discoverRising.seed, seed));
          if (rising.length > 0) {
            await tx
              .insert(discoverRising)
              .values(rising.map((r) => ({ seed, query: r.query, growthValue: r.growthValue, collectedAt: now })));
          }
        });
        summary.collectedSeeds++;
        consecutiveFailures = 0;
      } catch (err) {
        summary.failedSeeds++;
        consecutiveFailures++;
        logger.error(`Shopping rising failed for seed "${seed}"`, {
          error: err instanceof Error ? err.message : String(err),
        });
        // The block applies to the whole IP: retrying other seeds would only add requests.
        if (err instanceof GoogleBlockedError || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
      }
      await deps.sleep(randomDelay());
    }
  } catch (err) {
    logger.error("Shopping rising collection failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return summary;
}
