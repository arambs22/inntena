import type { Translations } from "./i18n";
import { formatGrowth } from "./growth";
import type { DiscoverOrigin } from "./types";

const OPEN_KEY = "inntena_discover_open";
const PAGE_KEY = "inntena_discover_page";

/** Suggestions shown per page of the Discover panel. */
export const DISCOVER_PAGE_SIZE = 5;

/**
 * One honest line saying where a suggestion comes from: a rising Google Shopping search, an upcoming season, or a
 * curated digital-product niche.
 */
export function describeOrigin(origin: DiscoverOrigin, t: Translations, locale = "en-US"): string {
  switch (origin.type) {
    case "shopping": {
      const label = formatGrowth(origin.growth, locale);
      return label.kind === "breakout" ? t.discover.shoppingBreakout : t.discover.shoppingRising(label.text);
    }
    case "season":
      return t.discover.season(t.discover.events[origin.event], origin.daysUntil);
    case "catalog":
      return t.discover.catalogLabel(t.discover.families[origin.family]);
  }
}

/** Number of pages needed for `total` items; at least 1 so an empty list still has a first page. */
export function pageCount(total: number, size: number = DISCOVER_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** The items on a zero-based page; an out-of-range or invalid page is clamped into range. */
export function pageOf<T>(items: T[], page: number, size: number = DISCOVER_PAGE_SIZE): T[] {
  const clamped = clampPage(page, items.length, size);
  return items.slice(clamped * size, clamped * size + size);
}

/** The next page, wrapping to the first after the last. */
export function nextPage(page: number, total: number, size: number = DISCOVER_PAGE_SIZE): number {
  return (clampPage(page, total, size) + 1) % pageCount(total, size);
}

/** Forces a page index into `[0, pageCount - 1]`; non-integers and negatives become 0. */
export function clampPage(page: number, total: number, size: number = DISCOVER_PAGE_SIZE): number {
  if (!Number.isInteger(page) || page < 0) return 0;
  return Math.min(page, pageCount(total, size) - 1);
}

/** The remembered page for this browser session; 0 when absent, invalid or when storage is unavailable. */
export function loadDiscoverPage(): number {
  try {
    const value = Number(sessionStorage.getItem(PAGE_KEY));
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Remembers the current page for this browser session; storage failures are ignored. */
export function saveDiscoverPage(page: number): void {
  try {
    sessionStorage.setItem(PAGE_KEY, String(page));
  } catch {
    // Not remembered; harmless.
  }
}

/** Whether the Discover strip is expanded; open by default and when storage is unavailable. */
export function loadDiscoverOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Remembers whether the Discover strip is expanded; storage failures are ignored. */
export function saveDiscoverOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open));
  } catch {
    // Not remembered; harmless.
  }
}
