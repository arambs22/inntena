import type { Keyword } from "./types";

/** Orderings offered for the keyword list. */
export const SORT_MODES = ["newest", "oldest", "alphabetical", "category"] as const;
export type SortMode = (typeof SORT_MODES)[number];
export const DEFAULT_SORT_MODE: SortMode = "newest";

const SORT_MODE_KEY = "inntena_keyword_sort";

/** Lowercases, strips diacritics and trims, so search ignores case and accents. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Keeps the items whose term or category contains the query (case- and accent-insensitive).
 * An empty or whitespace-only query returns every item in its original order.
 */
export function filterKeywords<T extends { term: string; category: string }>(items: T[], query: string): T[] {
  const needle = normalizeForSearch(query);
  if (needle === "") return [...items];
  return items.filter(
    (item) => normalizeForSearch(item.term).includes(needle) || normalizeForSearch(item.category).includes(needle)
  );
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareByMode(a: Keyword, b: Keyword, mode: SortMode): number {
  switch (mode) {
    case "newest":
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    case "oldest":
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    case "alphabetical":
      return compareText(a.term, b.term);
    case "category":
      return compareText(a.category, b.category) || compareText(a.term, b.term);
  }
}

/**
 * Returns a new array ordered by `mode`, with pinned keywords always first.
 * Ties are broken by id so the order is deterministic.
 */
export function sortKeywords(items: Keyword[], mode: SortMode): Keyword[] {
  return [...items].sort((a, b) => {
    const pinDiff = Number(b.pinnedAt !== null) - Number(a.pinnedAt !== null);
    if (pinDiff !== 0) return pinDiff;
    return compareByMode(a, b, mode) || a.id - b.id;
  });
}

/** Filters by the search query, then sorts. */
export function arrangeKeywords(items: Keyword[], query: string, mode: SortMode): Keyword[] {
  return sortKeywords(filterKeywords(items, query), mode);
}

/** Validates a persisted sort mode, falling back to the default for anything unrecognized. */
export function parseStoredSortMode(raw: string | null): SortMode {
  return SORT_MODES.find((mode) => mode === raw) ?? DEFAULT_SORT_MODE;
}

/** Reads the persisted sort mode; storage may be unavailable or throw. */
export function loadSortMode(): SortMode {
  try {
    return parseStoredSortMode(localStorage.getItem(SORT_MODE_KEY));
  } catch {
    return DEFAULT_SORT_MODE;
  }
}

/** Persists the sort mode; failures are ignored since the preference is a convenience only. */
export function saveSortMode(mode: SortMode): void {
  try {
    localStorage.setItem(SORT_MODE_KEY, mode);
  } catch {
    // Storage unavailable: the selection simply will not persist.
  }
}
