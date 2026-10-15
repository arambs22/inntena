export interface User {
  id: number;
  email: string;
  historyRetentionDays: number;
  emailVerified: boolean;
  termsAccepted: boolean;
}

export interface KeywordRegionStatus {
  blocked: boolean;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
}

export interface Keyword {
  id: number;
  userId: number;
  term: string;
  category: string;
  createdAt: string;
  removedAt: string | null;
  autoCollectPaused: boolean;
  pinnedAt: string | null;
  etsyTaxonomyId: number | null;
  collectionStatus?: Record<string, KeywordRegionStatus>;
  regions: string[];
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface KeywordTrend {
  id: number;
  term: string;
  category: string;
  timeline: TrendPoint[];
}

export interface RelatedQuery {
  query: string;
  growthValue: string;
}

export interface KeywordRelated {
  id: number;
  term: string;
  category: string;
  rising: RelatedQuery[];
}

export interface KeywordHistoryEntry {
  id: number;
  term: string;
  category: string;
  createdAt: string;
  removedAt: string | null;
  regions: string[];
}

export interface KeywordHistoryTrends {
  id: number;
  term: string;
  category: string;
  series: { region: string; timeline: TrendPoint[] }[];
}

export interface KeywordHistoryRelated {
  id: number;
  term: string;
  category: string;
  columns: { region: string; rising: RelatedQuery[] }[];
}

export type SupplyStatus = "fresh" | "refreshing" | "unavailable";

/** One keyword's Etsy supply reading, as returned by GET /api/supply. `count` is null when unknown or too old to show. */
export interface SupplyItem {
  keywordId: number;
  count: number | null;
  fetchedAt: string | null;
  status: SupplyStatus;
  local: LocalSupply | null;
}

export interface SupplyResponse {
  enabled: boolean;
  items: SupplyItem[];
}

/** Instance settings the client needs before login, from GET /api/public-config. */
export interface PublicConfig {
  supportEmail: string | null;
  operatorName: string | null;
  termsVersion: string;
}

/** Supply from sellers based in one country, for the chosen demand region. */
export interface LocalSupply {
  region: string;
  count: number | null;
  fetchedAt: string | null;
  status: SupplyStatus;
}

/** One Etsy listing, exactly as Etsy returned it. */
export interface ListingSample {
  listingId: number;
  title: string;
  price: number | null;
  currency: string | null;
  url: string;
  thumbnailUrl: string | null;
  favorites: number;
  views: number;
}

/** GET /api/keywords/:id/etsy-listings. `listings` is null while not yet fetched. */
export interface ListingSamplesResponse {
  enabled: boolean;
  status?: SupplyStatus;
  fetchedAt?: string | null;
  listings: ListingSample[] | null;
}

export type SeasonEvent = "valentines" | "mothersDay" | "backToSchool" | "halloween" | "dayOfTheDead" | "christmas" | "weddings";

/** Curated digital-product niche families a catalog suggestion can belong to. */
export type CatalogFamily = "clipart" | "svg" | "wallArt" | "planner" | "party" | "sticker" | "pattern" | "wedding" | "kids" | "coloring" | "template";

/** Why a term is suggested. `growth` is the raw Google value: "Breakout" or a numeric string such as "4400". */
export type DiscoverOrigin =
  | { type: "shopping"; seed: string; growth: string }
  | { type: "season"; event: SeasonEvent; daysUntil: number }
  | { type: "catalog"; family: CatalogFamily };

export interface DiscoverSuggestion {
  term: string;
  origin: DiscoverOrigin;
  /** Etsy supply for the term (all categories, anywhere); null when Etsy is off or the daily cap was reached. */
  supply: { count: number | null; status: SupplyStatus; fetchedAt: string | null } | null;
}

export interface DiscoverResponse {
  suggestions: DiscoverSuggestion[];
  /** True while the server is still verifying more terms against Etsy. */
  checking: boolean;
}
