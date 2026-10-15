import { eq, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { discoverRising, keywords } from "../db/schema.js";
import { DISCOVER_CATALOG, type CatalogFamily } from "../config/discoverCatalog.js";
import { activeSeasons, type ActiveSeason, type SeasonEvent } from "../config/seasonalSeeds.js";
import { growthNumber } from "../utils/relatedGrowth.js";
import { normalizeTerm } from "../utils/normalizeTerm.js";
import { etsySupplyService, type SupplyReading, type SupplyStatus } from "./etsySupply.service.js";

/** Maximum suggestions returned; the client pages through them. */
export const DISCOVER_LIMIT = 30;
/** Distinct new terms the whole instance may send to Etsy per UTC day for Discover. */
export const DAILY_NEW_TERMS = 150;
/** Minimum growth (percent) for a Google Shopping rising query to become a candidate. */
export const MIN_GROWTH = 500;
/** Shopping rows older than this are ignored. */
export const SHOPPING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A suggestion needs at least this many Etsy listings to prove the niche exists. */
export const MIN_ETSY_PRESENCE = 1_000;
/** Same thresholds as the client's opportunity logic (client/src/lib/opportunity.ts). */
export const LOW_SUPPLY_BELOW = 10_000;
export const HIGH_SUPPLY_ABOVE = 100_000;

export type DiscoverOrigin =
  | { type: "shopping"; seed: string; growth: string }
  | { type: "season"; event: SeasonEvent; daysUntil: number }
  | { type: "catalog"; family: CatalogFamily };

export interface Candidate {
  term: string;
  origin: DiscoverOrigin;
  /** 0 = shopping, 1 = season, 2 = catalog. */
  group: number;
}

export interface DiscoverSuggestion {
  term: string;
  origin: DiscoverOrigin;
  supply: { count: number | null; status: SupplyStatus; fetchedAt: string | null } | null;
}

export interface DiscoverResult {
  suggestions: DiscoverSuggestion[];
  /** True while Etsy counts for some candidates are still being fetched, so the client should ask again shortly. */
  checking: boolean;
}

export interface ShoppingInput {
  seed: string;
  query: string;
  growthValue: string;
}

/** 32-bit FNV-1a hash of a string. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Day key (YYYY-MM-DD, UTC) for a timestamp. */
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Ranked = Candidate & { growth: number };

/**
 * Words that mark a Google Shopping query as something a digital seller cannot or should not list: hardware and
 * supplies (the hub seeds also pull in cutting machines and printers), freebie searches, and brands or licensed
 * characters whose use invites trademark claims. Matched as whole words after lower-casing and removing accents.
 * Not exhaustive; the Etsy listing-count filter is the second line of defence.
 */
const SHOPPING_BLOCKED_WORDS = new Set([
  "free", "printer", "printers", "machine", "ink", "blade", "press", "maker",
  "cricut", "epson", "michaels", "capcut",
  "pokemon", "disney", "marvel", "mario", "nintendo", "barbie", "sanrio", "hello kitty",
  "franklin covey", "happy planner", "invitation homes",
]);

/** True when a Google Shopping rising query contains a blocked word or phrase (see SHOPPING_BLOCKED_WORDS). */
export function isBlockedShoppingTerm(query: string): boolean {
  const words = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const text = ` ${words.join(" ")} `;
  for (const blocked of SHOPPING_BLOCKED_WORDS) {
    if (text.includes(` ${blocked} `)) return true;
  }
  return false;
}

/**
 * Candidate terms from three sources, none derived from the user's keywords: Google Shopping rising queries with
 * growth of at least 500 % ("Breakout" counts as the highest) that are not blocked by isBlockedShoppingTerm, the seed terms of active seasons, and the curated
 * catalog. Terms are normalized; empty terms, terms containing "|" and terms the user already has (active or
 * archived) are dropped; a term reached by several sources keeps the best group. Ordering: shopping (growth
 * descending, then term), season (nearest first, then term), catalog (stable pseudo-random order that changes each
 * UTC day).
 */
export function buildCandidates(
  shopping: ShoppingInput[],
  seasons: ActiveSeason[],
  tracked: Set<string>,
  day: string,
): Candidate[] {
  const best = new Map<string, Ranked>();
  const offer = (term: string, origin: DiscoverOrigin, group: number, growth = 0) => {
    if (term === "" || term.includes("|") || tracked.has(term)) return;
    const current = best.get(term);
    const better = !current || group < current.group || (group === 0 && current.group === 0 && growth > current.growth);
    if (better) best.set(term, { term, origin, group, growth });
  };
  for (const row of shopping) {
    const growth = growthNumber(row.growthValue);
    if (growth < MIN_GROWTH || isBlockedShoppingTerm(row.query)) continue;
    offer(normalizeTerm(row.query), { type: "shopping", seed: row.seed, growth: row.growthValue }, 0, growth);
  }
  for (const season of seasons) {
    for (const seed of season.seeds) {
      offer(normalizeTerm(seed), { type: "season", event: season.event, daysUntil: season.daysUntil }, 1);
    }
  }
  for (const entry of DISCOVER_CATALOG) {
    offer(normalizeTerm(entry.term), { type: "catalog", family: entry.family }, 2);
  }

  const hashes = new Map<string, number>();
  const hashOf = (term: string) => {
    let value = hashes.get(term);
    if (value === undefined) {
      value = fnv1a(`${term}|${day}`);
      hashes.set(term, value);
    }
    return value;
  };
  const within = (a: Ranked, b: Ranked): number => {
    if (a.origin.type === "shopping" && b.origin.type === "shopping") {
      if (a.growth !== b.growth) return a.growth > b.growth ? -1 : 1;
      return a.term.localeCompare(b.term);
    }
    if (a.origin.type === "season" && b.origin.type === "season") {
      return a.origin.daysUntil - b.origin.daysUntil || a.term.localeCompare(b.term);
    }
    return hashOf(a.term) - hashOf(b.term) || a.term.localeCompare(b.term);
  };
  return [...best.values()]
    .sort((a, b) => a.group - b.group || within(a, b))
    .map(({ term, origin, group }) => ({ term, origin, group }));
}

type Reading = Pick<SupplyReading, "count" | "status"> & { fetchedAt?: Date | null };

const levelOrder = (count: number) => (count < LOW_SUPPLY_BELOW ? 0 : 1);

/**
 * Applies the Etsy filter and final ordering. With Etsy, only terms with a fresh reading between MIN_ETSY_PRESENCE
 * and HIGH_SUPPLY_ABOVE listings are kept; within each group low supply goes before medium (stable otherwise).
 * Without Etsy nothing is filtered and `supply` is null. At most DISCOVER_LIMIT results.
 */
export function rankSuggestions(
  candidates: Candidate[],
  supply: Map<string, Reading>,
  etsyAllowed: boolean,
): DiscoverSuggestion[] {
  if (!etsyAllowed) {
    return candidates.slice(0, DISCOVER_LIMIT).map((c) => ({ term: c.term, origin: c.origin, supply: null }));
  }
  const kept: { candidate: Candidate; index: number; reading: Reading; count: number }[] = [];
  candidates.forEach((candidate, index) => {
    const reading = supply.get(candidate.term);
    if (reading?.status !== "fresh" || reading.count === null) return;
    if (reading.count < MIN_ETSY_PRESENCE || reading.count > HIGH_SUPPLY_ABOVE) return;
    kept.push({ candidate, index, reading, count: reading.count });
  });
  kept.sort(
    (a, b) => a.candidate.group - b.candidate.group || levelOrder(a.count) - levelOrder(b.count) || a.index - b.index,
  );
  return kept.slice(0, DISCOVER_LIMIT).map(({ candidate, reading }) => ({
    term: candidate.term,
    origin: candidate.origin,
    supply: { count: reading.count, status: reading.status, fetchedAt: reading.fetchedAt?.toISOString() ?? null },
  }));
}

/**
 * Caps how many distinct candidate terms the whole instance sends to Etsy per UTC day, so Discover cannot drain the
 * shared daily budget. Terms already taken today are free to look up again. In memory, like the rest of the Etsy guards.
 */
export function createDailyQuota(now: () => number = Date.now, limit = DAILY_NEW_TERMS) {
  let record = { day: "", terms: new Set<string>() };
  return {
    take(terms: string[]): Set<string> {
      const day = utcDay(now());
      if (record.day !== day) record = { day, terms: new Set() };
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

/**
 * Builds Discover suggestions from Google Shopping rising queries, the season calendar and the curated catalog,
 * filtered by Etsy listing counts when Etsy is usable. Nothing is derived from the caller's own keywords, which are
 * only used to exclude terms they already track.
 */
export function createDiscoverService(deps: DiscoverDeps = {}) {
  const database = deps.db ?? db;
  const supply = deps.supply ?? etsySupplyService;
  const now = deps.now ?? Date.now;
  const quota = createDailyQuota(now);

  async function suggestionsFor(userId: number, region: string, etsyAllowed: boolean): Promise<DiscoverResult> {
    const own = await database.select({ term: keywords.term }).from(keywords).where(eq(keywords.userId, userId));
    const tracked = new Set(own.map((keyword) => normalizeTerm(keyword.term)));

    const shopping = await database
      .select({ seed: discoverRising.seed, query: discoverRising.query, growthValue: discoverRising.growthValue })
      .from(discoverRising)
      .where(gte(discoverRising.collectedAt, new Date(now() - SHOPPING_MAX_AGE_MS)));

    const candidates = buildCandidates(shopping, activeSeasons(new Date(now()), region), tracked, utcDay(now()));
    const useEtsy = etsyAllowed && supply.isEnabled();
    let readings = new Map<string, SupplyReading>();
    if (useEtsy && candidates.length > 0) {
      const allowed = quota.take(candidates.map((candidate) => candidate.term));
      if (allowed.size > 0) readings = await supply.readSupply([...allowed]);
    }
    const checking = useEtsy && [...readings.values()].some((reading) => reading.status === "refreshing");
    return { suggestions: rankSuggestions(candidates, readings, useEtsy), checking };
  }

  return { suggestionsFor };
}

export const discoverService = createDiscoverService();
