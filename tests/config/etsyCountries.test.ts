import { describe, expect, test } from "vitest";
import { ETSY_COUNTRY_NAMES, etsyCountryFor } from "../../src/config/etsyCountries.js";

describe("etsyCountryFor", () => {
  test("maps a region code to the English name Etsy expects", () => {
    expect(etsyCountryFor("MX")).toBe("Mexico");
    expect(etsyCountryFor("US")).toBe("United States");
    expect(etsyCountryFor("KR")).toBe("South Korea");
  });

  test("worldwide and unknown codes have no country, never a guess", () => {
    expect(etsyCountryFor("")).toBeNull();
    expect(etsyCountryFor("XX")).toBeNull();
    expect(etsyCountryFor("mx")).toBeNull();
  });

  test("never contains a code or an empty name (Etsy answers 0 to those, which would look like data)", () => {
    for (const [code, name] of Object.entries(ETSY_COUNTRY_NAMES)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(name.length).toBeGreaterThan(3);
      expect(name).not.toBe(code);
    }
  });
});
