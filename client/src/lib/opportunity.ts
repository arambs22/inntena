import type { TrendPoint } from "./types";

/** Days in each of the two periods compared when measuring demand momentum. */
export const MOMENTUM_WINDOW_DAYS = 14;
/** Relative change at or above which demand counts as rising. */
export const MOMENTUM_RISING_AT = 0.15;
/** Relative change at or below which demand counts as cooling. */
export const MOMENTUM_COOLING_AT = -0.15;
/** Supply below this many listings is "low". */
export const SUPPLY_LOW_BELOW = 10_000;
/** Supply above this many listings is "high"; anything from the low bound up to and including it is "medium". */
export const SUPPLY_HIGH_ABOVE = 100_000;

export type Momentum = "rising" | "steady" | "cooling" | "unknown";
export type SupplyLevel = "low" | "medium" | "high";
export type Verdict = "opportunity" | "promising" | "steady" | "crowded" | "cooling";

export interface MomentumReading {
  momentum: Momentum;
  /** Percentage change of the recent average against the earlier one; null when it cannot be expressed as a ratio. */
  changePct: number | null;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Demand momentum of one keyword: the average Google Trends value of its last 14 points against the 14 before.
 * Google Trends values are relative to each keyword's own peak, so comparing a keyword with itself is valid even
 * though comparing two keywords' values is not. Needs 28 points; fewer gives "unknown".
 */
export function computeMomentum(timeline: TrendPoint[]): MomentumReading {
  const needed = MOMENTUM_WINDOW_DAYS * 2;
  if (timeline.length < needed) return { momentum: "unknown", changePct: null };

  const sorted = [...timeline].sort((a, b) => a.date.localeCompare(b.date));
  const recentMean = mean(sorted.slice(-MOMENTUM_WINDOW_DAYS).map((point) => point.value));
  const previousMean = mean(sorted.slice(-needed, -MOMENTUM_WINDOW_DAYS).map((point) => point.value));

  if (previousMean === 0) {
    return recentMean === 0 ? { momentum: "steady", changePct: 0 } : { momentum: "rising", changePct: null };
  }

  const change = (recentMean - previousMean) / previousMean;
  const momentum: Momentum = change >= MOMENTUM_RISING_AT ? "rising" : change <= MOMENTUM_COOLING_AT ? "cooling" : "steady";
  return { momentum, changePct: change * 100 };
}

/** Buckets an Etsy listing count into low / medium / high supply. */
export function supplyLevel(count: number): SupplyLevel {
  if (count < SUPPLY_LOW_BELOW) return "low";
  if (count <= SUPPLY_HIGH_ABOVE) return "medium";
  return "high";
}

/**
 * Combines demand momentum and supply level into one verdict. Falling demand always reads as cooling; otherwise
 * high supply is crowded; otherwise rising demand is an opportunity (low supply) or promising (medium); the rest is steady.
 * Returns null when either input is unknown.
 */
export function verdictFor(momentum: Momentum, level: SupplyLevel | null): Verdict | null {
  if (momentum === "unknown" || level === null) return null;
  if (momentum === "cooling") return "cooling";
  if (level === "high") return "crowded";
  if (momentum === "rising") return level === "low" ? "opportunity" : "promising";
  return "steady";
}

/**
 * Compact count for tight spaces: 73K, 2.2M. One decimal is kept only while the abbreviated figure is below 10
 * (1.5K, 2.2M); from 10 up it is rounded to a whole number (73K).
 */
export function formatCount(count: number, locale: string): string {
  const unit = count >= 1_000 ? 10 ** (3 * Math.floor(Math.log10(count) / 3)) : 1;
  const maximumFractionDigits = count / unit < 10 && unit > 1 ? 1 : 0;
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits }).format(count);
}
