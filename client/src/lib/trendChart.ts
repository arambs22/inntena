import type { RegionTimeline } from "../components/TrendChart";
import type { TrendPoint } from "./types";

/** Selectable chart windows, in calendar days. */
export const CHART_RANGES = [7, 30, 90] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export const DEFAULT_CHART_RANGE: ChartRange = 90;

const CHART_RANGE_KEY = "inntena_chart_range";
const MS_PER_DAY = 86_400_000;

/** Number of distinct dates plotted across all series — for a caller-rendered "showing N days" label alongside the chart. */
export function countChartDays(series: RegionTimeline[]): number {
  return new Set(series.flatMap((s) => s.timeline.map((point) => point.date))).size;
}

/** Converts a `YYYY-MM-DD` string to a UTC day number, so calendar arithmetic ignores DST and month lengths. */
function toDayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Keeps the points whose day number is within `days` calendar days ending at `latestDay` (inclusive). */
function cutTimeline(timeline: TrendPoint[], latestDay: number, days: number): TrendPoint[] {
  const firstDay = latestDay - days + 1;
  return timeline.filter((point) => toDayNumber(point.date) >= firstDay);
}

/**
 * Keeps the points of the last `days` calendar days, inclusive of the timeline's latest date.
 * The cutoff is relative to the data, not to today, since collected data can lag. Returns a new array.
 */
export function sliceTimeline(timeline: TrendPoint[], days: number): TrendPoint[] {
  if (timeline.length === 0) return [];
  const latestDay = Math.max(...timeline.map((point) => toDayNumber(point.date)));
  return cutTimeline(timeline, latestDay, days);
}

/**
 * Slices every series with one shared cutoff: the latest date present across all of them,
 * so regions stay aligned on the same window. Returns new arrays.
 */
export function sliceSeries(series: RegionTimeline[], days: number): RegionTimeline[] {
  const allDays = series.flatMap((s) => s.timeline.map((point) => toDayNumber(point.date)));
  if (allDays.length === 0) return series.map((s) => ({ ...s, timeline: [] }));
  const latestDay = Math.max(...allDays);
  return series.map((s) => ({ ...s, timeline: cutTimeline(s.timeline, latestDay, days) }));
}

/** Validates a persisted range value, falling back to the default for anything unrecognized. */
export function parseStoredRange(raw: string | null): ChartRange {
  const match = CHART_RANGES.find((range) => String(range) === raw);
  return match ?? DEFAULT_CHART_RANGE;
}

/** Reads the persisted chart range; storage may be unavailable or throw. */
export function loadChartRange(): ChartRange {
  try {
    return parseStoredRange(localStorage.getItem(CHART_RANGE_KEY));
  } catch {
    return DEFAULT_CHART_RANGE;
  }
}

/** Persists the chart range; failures are ignored since the preference is a convenience only. */
export function saveChartRange(range: ChartRange): void {
  try {
    localStorage.setItem(CHART_RANGE_KEY, String(range));
  } catch {
    // Storage unavailable: the selection simply will not persist.
  }
}
