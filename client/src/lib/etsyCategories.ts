/** Mirror of `src/config/etsyCategories.ts` (separate package): the Etsy categories a keyword can be scoped to. */
export const ETSY_CATEGORIES = [
  { id: 562, key: "craftSupplies" },
  { id: 66, key: "art" },
  { id: 1250, key: "paperParty" },
  { id: 1633, key: "weddings" },
  { id: 891, key: "homeLiving" },
  { id: 374, key: "clothing" },
] as const;

export type EtsyCategoryKey = (typeof ETSY_CATEGORIES)[number]["key"];
