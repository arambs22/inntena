import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { keywords, relatedQueries } from "../db/schema.js";
import { activeSeasons, type ActiveSeason, type SeasonEvent } from "../config/seasonalSeeds.js";
import { growthNumber } from "../utils/relatedGrowth.js";
import { latestRelatedQueriesFor } from "../utils/relatedQueries.js";
import { normalizeTerm } from "../utils/normalizeTerm.js";
import { etsySupplyService, type SupplyReading, type SupplyStatus } from "./etsySupply.service.js";

export const DISCOVER_LIMIT = 5;
export const DAILY_NEW_TERMS = 10;
export const MIN_GROWTH = 500;
export const BREAKOUT_GROWTH = 5000;
/** Same thresholds as the client's opportunity logic (client/src/lib/opportunity.ts). */
export const LOW_SUPPLY_BELOW = 10_000;
export const HIGH_SUPPLY_ABOVE = 100_000;

export type DiscoverOrigin =
  | { type: "related"; from: string; breakout: boolean }
  | { type: "season"; event: SeasonEvent; daysUntil: number };

export interface Candidate {
  term: string;
  origin: DiscoverOrigin;
  /** 0 = breakout, 1 = season, 2 = other high growth. */
  rank: number;
}

export interface DiscoverSuggestion {
  term: string;
  origin: DiscoverOrigin;
  supply: { count: number | null; status: SupplyStatus; fetchedAt: string | null } | null;
}

interface RelatedInput {
  query: string;
  growthValue: string;
  /** The tracked keyword this query rose with. */
  from: string;
}

/**
 * Candidate keywords: rising related queries with growth ≥ 500 % (breakouts above 5,000 % or labelled "Breakout")
 * and the seed terms of active seasons. Terms the user already has (active or archived) and duplicates are dropped;
 * a term reached by several origins keeps the best one. Sorted by rank, then term.
 */
export function buildCandidates(related: RelatedInput[], seasons: ActiveSeason[], tracked: Set<string>): Candidate[] {
  const best = new Map<string, Candidate>();
  const offer = (candidate: Candidate) => {
    if (candidate.term === "" || tracked.has(candidate.term)) return;
    const current = best.get(candidate.term);
    if (!current || candidate.rank < current.rank) best.set(candidate.term, candidate);
  };
  for (const item of related) {
    const growth = growthNumber(item.growthValue);
    if (growth < MIN_GROWTH) continue;
    const breakout = growth > BREAKOUT_GROWTH;
    offer({ term: normalizeTerm(item.query), origin: { type: "related", from: item.from, breakout }, rank: breakout ? 0 : 2 });
  }
  for (const season of seasons) {
    for (const seed of season.seeds) {
      offer({ term: normalizeTerm(seed), origin: { type: "season", event: season.event, daysUntil: season.daysUntil }, rank: 1 });
    }
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank || a.term.localeCompare(b.term));
}

const levelOrder = (count: number | null | undefined) =>
  count === null || count === undefined ? 2 : count < LOW_SUPPLY_BELOW ? 0 : 1;

/** Drops crowded terms (> 100,000 listings), orders by origin, then low < medium < unknown supply, then term; at most 5. */
export function rankSuggestions(
  candidates: Candidate[],
  supply: Map<string, Pick<SupplyReading, "count" | "status"> & { fetchedAt?: Date | null }>,
  etsyAllowed: boolean,
): DiscoverSuggestion[] {
  return candidates
    .map((candidate) => ({ candidate, reading: etsyAllowed ? supply.get(candidate.term) : undefined }))
    .filter(({ reading }) => !(reading && reading.count !== null && reading.count > HIGH_SUPPLY_ABOVE))
    .sort(
      (a, b) =>
        a.candidate.rank - b.candidate.rank ||
        levelOrder(a.reading?.count) - levelOrder(b.reading?.count) ||
        a.candidate.term.localeCompare(b.candidate.term),
    )
    .slice(0, DISCOVER_LIMIT)
    .map(({ candidate, reading }) => ({
      term: candidate.term,
      origin: candidate.origin,
      supply: etsyAllowed
        ? { count: reading?.count ?? null, status: reading?.status ?? "unavailable", fetchedAt: reading?.fetchedAt?.toISOString() ?? null }
        : null,
    }));
}

/**
 * Caps how many distinct candidate terms each user can send to Etsy per UTC day, so Discover cannot drain the shared
 * daily budget. Terms already taken today are free to look up again. In memory, like the rest of the Etsy guards.
 */
export function createDailyQuota(now: () => number = Date.now, limit = DAILY_NEW_TERMS) {
  const byUser = new Map<number, { day: string; terms: Set<string> }>();
  return {
    take(userId: number, terms: string[]): Set<string> {
      const day = new Date(now()).toISOString().slice(0, 10);
      let record = byUser.get(userId);
      if (!record || record.day !== day) {
        record = { day, terms: new Set() };
        byUser.set(userId, record);
      }
      const allowed = new Set<string>();
      for (const term of terms) {
        if (record.terms.has(term)) allowed.add(term);
        else if (record.terms.size < limit) {
          record.terms.add(term);
          allowed.add(term);
        }
      }
      return allowed;
    },
  };
}

interface DiscoverDeps {
  db?: typeof db;
  supply?: { isEnabled: () => boolean; readSupply: (terms: string[]) => Promise<Map<string, SupplyReading>> };
  now?: () => number;
}

/** Builds each user's Discover suggestions from their latest related queries and the season calendar. */
export function createDiscoverService(deps: DiscoverDeps = {}) {
  const database = deps.db ?? db;
  const supply = deps.supply ?? etsySupplyService;
  const now = deps.now ?? Date.now;
  const quota = createDailyQuota(now);

  async function suggestionsFor(userId: number, region: string, etsyAllowed: boolean): Promise<DiscoverSuggestion[]> {
    const own = await database
      .select({ id: keywords.id, term: keywords.term, removedAt: keywords.removedAt })
      .from(keywords)
      .where(eq(keywords.userId, userId));
    const tracked = new Set(own.map((keyword) => normalizeTerm(keyword.term)));
    const active = own.filter((keyword) => keyword.removedAt === null);

    const rows = active.length
      ? await database
          .select()
          .from(relatedQueries)
          .where(and(inArray(relatedQueries.keywordId, active.map((keyword) => keyword.id)), eq(relatedQueries.geo, region)))
          .orderBy(desc(relatedQueries.collectedAt))
      : [];
    const related = active.flatMap((keyword) =>
      latestRelatedQueriesFor(rows, keyword.id).map((row) => ({ query: row.query, growthValue: row.growthValue, from: keyword.term })),
    );

    const candidates = buildCandidates(related, activeSeasons(new Date(now()), region), tracked);
    const useEtsy = etsyAllowed && supply.isEnabled();
    let readings = new Map<string, SupplyReading>();
    if (useEtsy && candidates.length > 0) {
      const allowed = quota.take(userId, candidates.map((c) => c.term));
      if (allowed.size > 0) readings = await supply.readSupply([...allowed]);
    }
    return rankSuggestions(candidates, readings, useEtsy);
  }

  return { suggestionsFor };
}

export const discoverService = createDiscoverService();
