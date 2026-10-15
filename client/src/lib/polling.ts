/** Delays between successive polls of a "refreshing" server response, in ms; about 2 minutes in total. */
const POLL_DELAYS_MS = [4000, 8000, 15000, 30000, 30000, 30000];

/**
 * Delay before the next poll given how many polls were already done, or null once the schedule is exhausted
 * (callers then wait for their periodic tick to retry).
 */
export function nextPollDelay(pollsDone: number): number | null {
  return POLL_DELAYS_MS[pollsDone] ?? null;
}
