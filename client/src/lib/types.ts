export interface User {
  id: number;
  email: string;
  historyRetentionDays: number;
  emailVerified: boolean;
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
