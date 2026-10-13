/**
 * Numeric growth behind a stored rising-query value.
 *
 * Google Trends reports each rising query with a raw numeric `value` (the percentage increase,
 * e.g. 40 or 836500) and a display string (`+40%` or `Breakout`). Collection stores the raw value,
 * but rows written in other formats exist too, so this reads the number out of either shape.
 * A literal "Breakout" outranks any number; anything unparseable ranks below every real value.
 */
export function growthNumber(growthValue: string): number {
  if (/breakout/i.test(growthValue)) return Number.POSITIVE_INFINITY;
  const parsed = Number.parseFloat(growthValue.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : -1;
}

/**
 * Orders rising queries from the largest growth to the smallest. Ties are broken alphabetically
 * so the order is deterministic: rows from one collection run share a single timestamp, so the
 * database gives no ordering guarantee among them. Returns a new array.
 */
export function sortByGrowthDesc<T extends { query: string; growthValue: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => growthNumber(b.growthValue) - growthNumber(a.growthValue) || a.query.localeCompare(b.query)
  );
}
