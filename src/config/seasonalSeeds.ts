/**
 * Our own calendar of selling seasons for digital products, used by Discover. This is not Etsy data. Each season
 * shows from SEASON_LEAD_DAYS before it starts until it ends, with seed search terms in English and Spanish.
 */
export type SeasonEvent = "valentines" | "mothersDay" | "backToSchool" | "halloween" | "dayOfTheDead" | "christmas" | "weddings";

export const SEASON_LEAD_DAYS = 56;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActiveSeason {
  event: SeasonEvent;
  /** Whole days until the season starts; 0 on its first day and while it lasts. */
  daysUntil: number;
  seeds: string[];
}

interface Season {
  event: SeasonEvent;
  /** First and last day of the season in a given year (UTC midnight). */
  span: (year: number, region: string) => [Date, Date];
  seeds: string[];
}

const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const single = (month: number, day: number) => (year: number): [Date, Date] => [utc(year, month, day), utc(year, month, day)];

/** Second Sunday of May (US and most countries' Mother's Day). */
function secondSundayOfMay(year: number): Date {
  const first = utc(year, 5, 1);
  const offset = (7 - first.getUTCDay()) % 7;
  return utc(year, 5, 1 + offset + 7);
}

const SEASONS: Season[] = [
  { event: "valentines", span: single(2, 14), seeds: ["valentines clipart", "valentine png", "san valentin clipart"] },
  {
    event: "mothersDay",
    span: (year, region) => {
      const date = region === "MX" ? utc(year, 5, 10) : secondSundayOfMay(year);
      return [date, date];
    },
    seeds: ["mothers day png", "mothers day clipart", "dia de las madres png"],
  },
  { event: "backToSchool", span: single(8, 1), seeds: ["back to school clipart", "teacher clipart", "regreso a clases png"] },
  { event: "halloween", span: single(10, 31), seeds: ["halloween clipart", "spooky png", "clipart halloween"] },
  { event: "dayOfTheDead", span: single(11, 2), seeds: ["day of the dead clipart", "dia de muertos png", "calavera clipart"] },
  { event: "christmas", span: single(12, 25), seeds: ["christmas clipart", "christmas png", "clipart navidad"] },
  {
    event: "weddings",
    span: (year) => [utc(year, 4, 1), utc(year, 9, 30)],
    seeds: ["wedding clipart", "wedding invitation png", "boda clipart"],
  },
];

/** Seasons whose window (lead period through last day) contains `today`, nearest first. */
export function activeSeasons(today: Date, region: string): ActiveSeason[] {
  const day = utc(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate()).getTime();
  const active: ActiveSeason[] = [];
  for (const season of SEASONS) {
    for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
      const [start, end] = season.span(year, region);
      const windowStart = start.getTime() - SEASON_LEAD_DAYS * DAY_MS;
      if (day >= windowStart && day <= end.getTime()) {
        active.push({ event: season.event, daysUntil: Math.max(0, Math.round((start.getTime() - day) / DAY_MS)), seeds: season.seeds });
        break;
      }
    }
  }
  return active.sort((a, b) => a.daysUntil - b.daysUntil || a.event.localeCompare(b.event));
}
