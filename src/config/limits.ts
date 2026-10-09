/**
 * Maximum number of active (non-archived) keywords a single user may track.
 *
 * Trend collection is sequential, with an 8-11 s delay between Google Trends requests, which
 * works out to roughly 21 s per keyword x region pair across ALL users. Unbounded keyword counts
 * would lengthen every collection run and raise the chance of an upstream block, so the cap
 * keeps a single run's duration predictable. Archived keywords are not collected and therefore
 * do not count toward it.
 */
export const MAX_ACTIVE_KEYWORDS_PER_USER = 15;
