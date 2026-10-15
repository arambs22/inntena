/**
 * Region code → country name as Etsy's `shop_location` filter expects it. Etsy needs the English name; a code or a
 * name it does not recognise is not rejected, it silently returns a count of 0 — indistinguishable from real data.
 * So this list holds only names confirmed against the live API by `src/scripts/verifyEtsyCountries.ts`; a region
 * missing here simply gets no local count.
 */
export const ETSY_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  MX: "Mexico",
  BR: "Brazil",
  AR: "Argentina",
  CO: "Colombia",
  CL: "Chile",
  PT: "Portugal",
  IE: "Ireland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  CH: "Switzerland",
  AT: "Austria",
  BE: "Belgium",
  JP: "Japan",
  KR: "South Korea",
  IN: "India",
  SG: "Singapore",
  NZ: "New Zealand",
  ZA: "South Africa",
};

/** The verified Etsy country name for a region code, or null for worldwide ("") and unknown codes. */
export function etsyCountryFor(region: string): string | null {
  return Object.prototype.hasOwnProperty.call(ETSY_COUNTRY_NAMES, region) ? ETSY_COUNTRY_NAMES[region]! : null;
}
