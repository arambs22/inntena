/** Base wait between consecutive Google Trends requests. */
const BASE_DELAY_MS = 8000;
/** Random extra wait added to every delay so request timing is not predictable. */
const JITTER_MS = 3000;

/**
 * Consecutive failed requests after which a collection run gives up, both within a
 * region and (via the flag on RegionCollectionResult) across regions. Also the threshold
 * at which the dashboard reports a keyword as blocked, and the cut-off of the daily
 * Google Shopping step — shared from here so they can't drift apart.
 */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** Delay before the next Google Trends request: the base wait plus random jitter. */
export function randomDelay(): number {
  return BASE_DELAY_MS + Math.floor(Math.random() * JITTER_MS);
}
