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
