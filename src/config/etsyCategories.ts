/**
 * Etsy taxonomy ids a keyword can be scoped to. A short fixed list of the top-level categories where digital
 * products are listed; Etsy's taxonomy filter includes every subcategory. The client mirrors this list in
 * `client/src/lib/etsyCategories.ts` (separate package) — keep both in sync.
 */
export const ETSY_CATEGORY_IDS: readonly number[] = [562, 66, 1250, 1633, 891, 374];

/** True for one of the offered Etsy categories. */
export function isEtsyCategoryId(id: number): boolean {
  return ETSY_CATEGORY_IDS.includes(id);
}
