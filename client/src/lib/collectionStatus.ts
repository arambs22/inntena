import type { KeywordRegionStatus } from "./types";

/** A failed collection attempt for one region. */
export interface RegionFailure {
  geo: string;
  status: KeywordRegionStatus;
}

/** The most recent failed attempt across a set of regions. */
export interface LatestFailure {
  at: string;
  reason: NonNullable<KeywordRegionStatus["failureReason"]>;
}

/**
 * Regions, among those requested, whose most recent collection attempt failed.
 * A region counts as failed as soon as the backend reports a failure reason, not only after
 * repeated failures.
 */
export function failedRegions(statusByGeo: Record<string, KeywordRegionStatus> | undefined, geos: string[]): RegionFailure[] {
  if (!statusByGeo) return [];
  const result: RegionFailure[] = [];
  for (const geo of geos) {
    const status = statusByGeo[geo];
    if (status && status.failureReason !== null && status.failureReason !== undefined) result.push({ geo, status });
  }
  return result;
}

/** The newest failed attempt among the given regions, or null when none of them failed. */
export function latestFailure(statusByGeo: Record<string, KeywordRegionStatus> | undefined, geos: string[]): LatestFailure | null {
  let best: LatestFailure | null = null;
  for (const { status } of failedRegions(statusByGeo, geos)) {
    const at = status.lastFailedAt ?? status.lastAttemptAt;
    if (best === null || new Date(at).getTime() > new Date(best.at).getTime()) {
      best = { at, reason: status.failureReason! };
    }
  }
  return best;
}

/** Formats an ISO timestamp as a short local date and time in the given locale; returns the input unchanged if unparseable. */
export function formatAttemptTime(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
