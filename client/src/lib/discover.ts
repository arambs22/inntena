import type { Translations } from "./i18n";
import type { DiscoverOrigin } from "./types";

const OPEN_KEY = "inntena_discover_open";

/** One line saying why a keyword is suggested: the keyword it rose with, or the season and the days left. */
export function describeOrigin(origin: DiscoverOrigin, t: Translations): string {
  return origin.type === "related"
    ? t.discover.fromRelated(origin.from)
    : t.discover.season(t.discover.events[origin.event], origin.daysUntil);
}

/** Whether the Discover strip is expanded; open by default and when storage is unavailable. */
export function loadDiscoverOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Remembers whether the Discover strip is expanded; storage failures are ignored. */
export function saveDiscoverOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open));
  } catch {
    // Not remembered; harmless.
  }
}
