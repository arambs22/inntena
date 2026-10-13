import type { Language } from "./i18n";

/**
 * Google Trends labels a rising query "Breakout" when its growth is more than 5,000%.
 * Only the raw numeric value is stored, so the label is derived from it here.
 */
export const BREAKOUT_THRESHOLD = 5000;

/** What to render for a rising query's growth. */
export type GrowthLabel =
  | { kind: "breakout" }
  | { kind: "percent"; text: string }
  | { kind: "raw"; text: string };

/**
 * Turns a stored growth value into something a person can read: `+250%`, or a breakout marker.
 * Values that already carry their own formatting, or that cannot be read as a number, are passed
 * through untouched rather than guessed at.
 */
export function formatGrowth(raw: string, locale: string): GrowthLabel {
  const value = raw.trim();
  if (/breakout/i.test(value)) return { kind: "breakout" };
  if (value === "" || value.includes("%")) return { kind: "raw", text: raw };

  const growth = Number(value);
  if (!Number.isFinite(growth)) return { kind: "raw", text: raw };
  if (growth > BREAKOUT_THRESHOLD) return { kind: "breakout" };
  return { kind: "percent", text: `+${growth.toLocaleString(locale)}%` };
}

/** Number-formatting locale for each UI language. */
export function growthLocale(language: Language): string {
  return language === "es" ? "es-MX" : "en-US";
}
